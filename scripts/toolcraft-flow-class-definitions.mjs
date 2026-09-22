import {
  ABSENT, UNKNOWN, exact, mergeFacts, objectFactFromDescriptors, updateState,
  withObject,
} from "./toolcraft-flow-facts.mjs";
import { captureToolcraftEnvironment } from
  "./toolcraft-flow-environments.mjs";
import {
  mergeToolcraftAccessorDescriptor, toolcraftAccessorDescriptor,
  toolcraftDataDescriptor,
} from "./toolcraft-flow-property-descriptors.mjs";

export function createToolcraftFlowClassDefinitions({
  callableValues, evaluateExpression, executeStatements, index, memory,
  propertyOperations, ts,
}) {
  function isStatic(member) {
    return member.modifiers?.some(
      ({ kind }) => kind === ts.SyntaxKind.StaticKeyword,
    );
  }

  function staticKey(member) {
    const name = member.name;
    if (!name || ts.isComputedPropertyName(name)) return;
    if (ts.isIdentifier(name) || ts.isStringLiteralLike(name) ||
      ts.isNumericLiteral(name)) return memory.propertyKeys.stringKey(name.text);
  }

  function heritageOutcomes(node, state, depth, calls) {
    const heritage = node.heritageClauses?.find(({ token }) =>
      token === ts.SyntaxKind.ExtendsKeyword
    )?.types[0]?.expression;
    if (!heritage) return [{ bases: [], state }];
    return evaluateExpression(heritage, state, depth + 1, calls).map(
      ({ fact, state: ready }) => ({ bases: callableValues.candidatesAt(
        fact, heritage, ready, depth + 1, true,
      ), state: ready }),
    );
  }

  function capturedMember(member, state) {
    if (!ts.isMethodDeclaration(member) &&
      !ts.isGetAccessorDeclaration(member) &&
      !ts.isSetAccessorDeclaration(member)) return { state };
    const captured = memory.captureClosure(member, state);
    return { callableFact: captured.fact, state: captured.state };
  }

  function elementOutcomes(member, item, depth, calls) {
    if (!member.name || !ts.isComputedPropertyName(member.name)) {
      const captured = capturedMember(member, item.state);
      return [{ ...item, elements: [...item.elements, Object.freeze({
        callableFact: captured.callableFact, key: staticKey(member), member,
      })], state: captured.state }];
    }
    return evaluateExpression(
      member.name.expression, item.state, depth + 1, calls,
    ).flatMap(({ fact, state }) => {
      const captured = capturedMember(member, state);
      const keyFact = memory.propertyKeys.fromFact(
        fact, member.name.expression,
      );
      const keys = keyFact.alternatives.length > 0
        ? keyFact.alternatives : [undefined];
      return keys.map((key) => ({ ...item,
        elements: [...item.elements, Object.freeze({
          callableFact: captured.callableFact, key, keyFact, member,
        })], state: captured.state }));
    });
  }

  function basePrototypeFact(bases) {
    const facts = bases.map(({ construction }) => construction?.prototypeFact)
      .filter(Boolean);
    return facts.length > 0 ? mergeFacts(facts) : ABSENT;
  }

  function capturePlan(node, item) {
    const constructor = node.members.find(ts.isConstructorDeclaration);
    const prototypeIdentity = memory.syntheticObjectIdentity(node, "prototype");
    const prototypeFact = exact([prototypeIdentity]);
    const fields = item.elements.filter(({ member }) =>
      ts.isPropertyDeclaration(member) && !isStatic(member)
    ).map(({ key, keyFact, member }) => Object.freeze({
      capturedEnvironment: captureToolcraftEnvironment(item.state),
      initializer: member.initializer, key, keyFact, member,
    }));
    const plan = Object.freeze({ bases: Object.freeze(item.bases),
      classNode: node, constructor, derived: item.bases.length > 0,
      elements: Object.freeze(item.elements), fields: Object.freeze(fields),
      kind: "ConstructionPlan", prototypeFact,
      unsupported: Boolean(node.heritageClauses?.length && item.bases.length === 0) });
    let state = withObject(item.state, prototypeIdentity,
      objectFactFromDescriptors(new Map(), {
        prototypeFact: basePrototypeFact(item.bases),
      }));
    state = withObject(state, node, objectFactFromDescriptors(
      new Map(), { prototypeFact: item.bases.length > 0
        ? exact(item.bases.map(({ fn }) => fn)) : ABSENT },
    ));
    state = propertyOperations.define(exact([node]),
      memory.propertyKeys.staticFact("prototype"),
      toolcraftDataDescriptor(prototypeFact, { enumerable: false,
        writable: false }), state)[0]?.state ?? state;
    const candidate = Object.freeze({ bound: [],
      capturedEnvironment: captureToolcraftEnvironment(state),
      construction: plan, fn: constructor ?? node });
    state = memory.captureCallable(node, [candidate], state);
    return { plan, state };
  }

  function ownerFor(plan, member) {
    return isStatic(member) ? exact([plan.classNode]) : plan.prototypeFact;
  }

  function mapKey(key) {
    return key?.kind === "string" ? key.value : key;
  }

  function installMember(plan, element, state) {
    const { callableFact, key, keyFact, member } = element;
    if (!callableFact) return [state];
    const ownerFact = ownerFor(plan, member);
    let descriptor = ts.isMethodDeclaration(member)
      ? toolcraftDataDescriptor(callableFact, { enumerable: false })
      : toolcraftAccessorDescriptor({ enumerable: false,
          getFact: ts.isGetAccessorDeclaration(member) ? callableFact : undefined,
          setFact: ts.isSetAccessorDeclaration(member) ? callableFact : undefined });
    if (!ts.isMethodDeclaration(member) && key) {
      const identity = index.unwrap(ownerFact.values[0]);
      const previous = state.objects.get(identity)?.propertyDescriptors.get(
        mapKey(key),
      );
      descriptor = mergeToolcraftAccessorDescriptor(previous, descriptor);
    }
    const propertyKeyFact = keyFact ?? (key
      ? Object.freeze({ alternatives: Object.freeze([key]),
          coverage: memory.propertyKeys.emptyCoverage(), kind: "PropertyKeyFact",
          unbounded: false }) : undefined);
    return propertyKeyFact
      ? propertyOperations.define(ownerFact, propertyKeyFact, descriptor, state)
        .map(({ state: next }) => next) : [state];
  }

  function installMethodsAndAccessors(plan, states) {
    return plan.elements.reduce((current, element) => current.flatMap((state) =>
      installMember(plan, element, state)
    ), states);
  }

  function executeStaticPhase(plan, states, depth, calls) {
    const priorThis = states.map(({ thisFact }) => thisFact);
    let current = states.map((state) => updateState(state, {
      thisFact: exact([plan.classNode]),
    }));
    for (const { key, keyFact, member } of plan.elements) {
      if (isStatic(member) && ts.isPropertyDeclaration(member)) {
        const initialize = member.initializer ? (state) => evaluateExpression(
          member.initializer, state, depth + 1, calls,
        ) : (state) => [{ fact: exact([
          ts.factory.createIdentifier("undefined"),
        ]), state }];
        current = current.flatMap((state) => initialize(state).flatMap(
          ({ fact, state: ready }) => {
            const propertyKeyFact = keyFact ?? (key ? Object.freeze({
              alternatives: Object.freeze([key]),
              coverage: memory.propertyKeys.emptyCoverage(),
              kind: "PropertyKeyFact", unbounded: false,
            }) : undefined);
            return propertyKeyFact ? propertyOperations.define(
              exact([plan.classNode]), propertyKeyFact,
              toolcraftDataDescriptor(fact), ready,
            ).map(({ state: next }) => next) : [ready];
          },
        ));
      } else if (ts.isClassStaticBlockDeclaration(member)) {
        current = current.flatMap((state) => executeStatements(
          member.body.statements, [state], Infinity, depth + 1, calls,
        ));
      }
    }
    return current.map((state, position) => updateState(state, {
      thisFact: priorThis[position] ?? priorThis[0],
    }));
  }

  function define(node, state, depth = 0, calls = new Set(),
    bindDeclaration = false) {
    return heritageOutcomes(node, state, depth, calls).flatMap((heritage) => {
      const privateState = node.name ? memory.assignBinding(
        node.name, exact([node]), heritage.state,
      ) : heritage.state;
      let items = [{ ...heritage, elements: [], state: privateState }];
      for (const member of node.members) items = items.flatMap((item) =>
        elementOutcomes(member, item, depth + 1, calls)
      );
      return items.flatMap((item) => {
        const captured = capturePlan(node, item);
        const installed = installMethodsAndAccessors(
          captured.plan, [captured.state],
        );
        return executeStaticPhase(captured.plan, installed, depth + 1, calls)
          .map((next) => ({ fact: exact([node]),
            state: captured.plan.unsupported
              ? updateState(next, { overflow: true })
              : bindDeclaration && node.name ? memory.assignBinding(
                  node.name, exact([node]), next,
                ) : next,
            truth: "true" }));
      });
    });
  }

  return Object.freeze({ define });
}
