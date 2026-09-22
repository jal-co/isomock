import { ABSENT, HOLE, OVERFLOW, UNKNOWN, mergeFacts, positional } from
  "./toolcraft-flow-facts.mjs";
import { publicToolcraftObjectFact } from
  "./toolcraft-flow-public-facts.mjs";
import { createToolcraftFlowKernel } from "./toolcraft-flow-kernel.mjs";
import { toolcraftInvocationAlternatives } from
  "./toolcraft-invocation-facts.mjs";

const MAX_ARRAY_VARIANTS = 16;

export function createToolcraftStaticFlowValues({
  checker,
  resolveStaticString,
  ts,
}) {
  const regions = createToolcraftFlowKernel({
    checker, resolveStaticString, ts,
  });
  const { index } = regions;

  function observedNode(useNode) {
    if (ts.isJsxSpreadAttribute(useNode)) return useNode.expression;
    if (ts.isJsxAttribute(useNode) && ts.isJsxExpression(useNode.initializer) &&
      useNode.initializer.expression) return useNode.initializer.expression;
    return useNode;
  }

  function evaluatedAt(expression, useNode) {
    const target = index.unwrap(expression);
    const observed = index.unwrap(observedNode(useNode));
    return regions.statesBefore(useNode).flatMap((state) =>
      target === observed
        ? regions.expressionOutcomes(expression, state)
        : [regions.materialize(expression, state)]
    );
  }

  function factsAt(expression, useNode, project) {
    const facts = [];
    for (const value of evaluatedAt(expression, useNode)) {
      const state = value.state;
      if (state.overflow) {
        facts.push(OVERFLOW);
        continue;
      }
      facts.push(publicCallableFact(project(value.fact, value.state), value.state));
    }
    return mergeFacts(facts);
  }

  function valueAt(expression, useNode = expression) {
    return factsAt(expression, useNode, (fact) => fact);
  }

  function resultAt(expression, useNode = expression) {
    const facts = [];
    for (const state of regions.statesBefore(useNode)) {
      if (state.overflow) {
        facts.push(OVERFLOW);
        continue;
      }
      facts.push(...regions.expressionOutcomes(expression, state).map(
        ({ fact, state: next }) => publicCallableFact(fact, next),
      ));
    }
    return mergeFacts(facts);
  }

  function publicCallableFact(fact, state) {
    if (fact.kind !== "exact") return fact;
    return mergeFacts(fact.values.map((value) => {
      const callables = regions.callableAt(value, state);
      return callables?.length
        ? { kind: "exact", values: callables.map(
            ({ callableSource, fn }) => fn ?? callableSource,
          ).filter(Boolean) }
        : { kind: "exact", values: [value] };
    }));
  }

  function propertyAt(expression, member, useNode = expression) {
    return factsAt(expression, useNode, (fact, state) =>
      regions.propertyFromFact(fact, member, state)
    );
  }

  function expandSlots(slots) {
    let variants = [[]];
    for (const fact of slots) {
      if (fact.kind === "absent") {
        variants = variants.map((items) => [...items, HOLE]);
        continue;
      }
      if (fact.kind !== "exact") return undefined;
      variants = variants.flatMap((items) => fact.values.map((value) =>
        [...items, value]
      ));
      if (variants.length > MAX_ARRAY_VARIANTS) return undefined;
    }
    return variants;
  }

  function arrayAt(expression, useNode = expression) {
    const node = index.unwrap(expression);
    if (ts.isConditionalExpression(node)) {
      const alternatives = [
        arrayAt(node.whenTrue, useNode),
        arrayAt(node.whenFalse, useNode),
      ];
      if (alternatives.some(({ kind }) => kind !== "array")) return UNKNOWN;
      return positional(alternatives.flatMap(({ variants }) => variants),
        alternatives.flatMap(({ tails }) => tails),
        alternatives.flatMap(({ evidence = [] }) => evidence));
    }
    const variants = [];
    const tails = [];
    const evidence = [];
    for (const state of regions.statesBefore(useNode)) {
      if (state.overflow) return OVERFLOW;
      const value = regions.materialize(expression, state);
      const shape = regions.positionalShapeFromFact(value.fact, value.state);
      if (!shape) {
        tails.push(node);
        evidence.push("typed-or-unknown-length");
        continue;
      }
      const expanded = expandSlots(shape.slots);
      if (!expanded) {
        evidence.push("unknown-slot");
        tails.push(node);
      } else variants.push(...expanded);
      tails.push(...shape.tails);
      evidence.push(...shape.evidence);
    }
    return positional(variants.length > 0 ? variants : [[]], tails, evidence);
  }

  function objectAt(expression, useNode = expression) {
    const variants = [];
    for (const resolved of evaluatedAt(expression, useNode)) {
      const state = resolved.state;
      if (state.overflow) return OVERFLOW;
      if (resolved.fact.kind !== "exact") return resolved.fact;
      for (const value of resolved.fact.values) {
        const object = state.objects.get(index.unwrap(value));
        if (!object) return UNKNOWN;
        variants.push(publicToolcraftObjectFact(object, state, index));
      }
    }
    return Object.freeze({ kind: "object", variants: Object.freeze(variants) });
  }

  function invocationsAt(call) {
    const result = regions.invocationsAt(call);
    return Array.isArray(result)
      ? toolcraftInvocationAlternatives("exact", result) : result;
  }

  const flow = {
    arrayAt,
    invocationsAt,
    objectAt,
    propertyAt,
    recordsFor: index.recordsFor,
    reference: index.reference,
    resultAt,
    unwrap: index.unwrap,
    valueAt,
  };
  return Object.freeze(flow);
}

export { ABSENT, OVERFLOW, UNKNOWN };
