import {
  ABSENT, UNKNOWN, objectFact, updateState, withCompletion, withObject,
} from "./toolcraft-flow-facts.mjs";
import { toolcraftDataDescriptor } from
  "./toolcraft-flow-property-descriptors.mjs";

export function createToolcraftFlowConstruction({
  applyCandidate, applyExternal,
  argumentOutcomes,
  emitEvent,
  evaluateExpression,
  index,
  memory,
  propertyOperations,
  restore,
  runBody,
  ts,
}) {
  function objectReturn(fact, state) {
    return fact?.kind === "exact" && fact.values.length > 0 &&
      fact.values.every((value) => state.objects.has(index.unwrap(value)) ||
        state.callables.has(index.unwrap(value)));
  }

  function initializeFields(plan, states, depth, calls) {
    let current = states;
    for (const field of plan.fields) {
      current = current.flatMap((state) => {
        const outcomes = field.initializer ? evaluateExpression(
          field.initializer, state, depth + 1, calls,
        ) : [{ fact: exactUndefined(), state }];
        return outcomes.flatMap(({ fact, state: ready }) => {
          const keyFact = field.keyFact ?? (field.key ? Object.freeze({
            alternatives: Object.freeze([field.key]),
            coverage: memory.propertyKeys.emptyCoverage(),
            kind: "PropertyKeyFact", unbounded: false,
          }) : undefined);
          return keyFact ? propertyOperations.define(
            ready.thisFact, keyFact, toolcraftDataDescriptor(fact), ready,
          ).map(({ state: next }) => next) : [ready];
        });
      });
    }
    return current;
  }

  function exactUndefined() {
    return { kind: "exact", values: Object.freeze([
      ts.factory.createIdentifier("undefined"),
    ]) };
  }

  function undefinedReturn(fact) {
    return fact?.kind === "absent" || fact?.kind === "exact" &&
      fact.values.every((value) => {
        const node = index.unwrap(value);
        return ts.isIdentifier(node) && node.text === "undefined" ||
          ts.isVoidExpression(node);
      });
  }

  function baseResults(candidate, activated, depth, calls) {
    const plan = candidate.construction;
    const framed = activated.frames.map((state) => updateState(state, {
      constructionFrame: Object.freeze({
        instanceFact: candidate.thisFact,
        phase: "base",
        plan,
      }),
      thisFact: candidate.thisFact,
    }));
    const initialized = initializeFields(plan, framed, depth + 1, calls);
    const body = plan.constructor
      ? runBody(plan.constructor, initialized, depth + 1, calls)
      : initialized.map((state) => ({
          completion: "normal", fact: UNKNOWN, state,
        }));
    return body.map((result) => ({
      ...result,
      fact: result.completion === "return" && objectReturn(
        result.fact, result.state,
      ) ? result.fact : candidate.thisFact,
      state: result.state.exit === "throw" ? result.state
        : withCompletion(result.state, "normal", ABSENT),
    }));
  }

  function finishDerived(result, candidate) {
    const frame = result.state.constructionFrame;
    if (result.state.exit === "throw") return result;
    if (result.completion === "return" && objectReturn(result.fact, result.state)) {
      return { ...result, state: withCompletion(
        result.state, "normal", ABSENT,
      ) };
    }
    if (frame?.phase !== "derived-ready") return {
      fact: UNKNOWN,
      state: withCompletion(result.state, "throw", result.fact ?? ABSENT),
    };
    const primitiveReturn = result.completion === "return" &&
      !undefinedReturn(result.fact);
    return primitiveReturn ? {
      fact: UNKNOWN,
      state: withCompletion(result.state, "throw", result.fact),
    } : { ...result, fact: frame.instanceFact,
      state: withCompletion(result.state, "normal", ABSENT) };
  }

  function invokeBase(frame, facts, evaluated, state, depth, calls) {
    if (frame.phase === "derived-ready") return [{ fact: UNKNOWN,
      state: withCompletion(state, "throw", UNKNOWN) }];
    if (frame.plan.bases.length === 0) return [{ fact: UNKNOWN,
      state: withCompletion(state, "throw", UNKNOWN) }];
    return frame.plan.bases.flatMap((base) => base.external
      ? applyExternal(evaluated, facts, state, depth + 1, calls).map(
          (next) => ({ fact: frame.instanceFact, state: next }),
        )
      : applyCandidate(Object.freeze({ ...base, thisBound: true,
          thisFact: frame.instanceFact }), facts, state, depth + 1, calls)
    ).flatMap((result) => {
      if (result.state.exit !== "normal") return [result];
      const readyFrame = Object.freeze({ ...frame,
        instanceFact: result.fact, phase: "derived-ready" });
      const ready = updateState(result.state, {
        constructionFrame: readyFrame,
        thisFact: result.fact,
      });
      return initializeFields(frame.plan, [ready], depth + 1, calls).map(
        (next) => ({ fact: result.fact, state: next }),
      );
    });
  }

  function superOutcomes(call, state, depth, calls) {
    const frame = state.constructionFrame;
    const event = Object.freeze({
      kind: "SuperEvent", plan: frame?.plan, site: call,
    });
    emitEvent?.(call, state, event);
    if (!frame || frame.phase === "base") return [{ fact: UNKNOWN,
      state: withCompletion(state, "throw", UNKNOWN), truth: "unknown" }];
    return argumentOutcomes(call.arguments, state, depth + 1, calls).flatMap(
      ({ evaluated, facts, state: ready }) => invokeBase(
        frame, facts, evaluated, ready, depth + 1, calls,
      ),
    ).map((result) => ({ ...result, truth: "true" }));
  }

  function derivedResults(candidate, activated, depth, calls) {
    const plan = candidate.construction;
    const framed = activated.frames.map((state) => updateState(state, {
      constructionFrame: Object.freeze({
        instanceFact: candidate.thisFact,
        phase: "derived-pending",
        plan,
      }),
      thisFact: ABSENT,
    }));
    const body = plan.constructor ? runBody(
      plan.constructor, framed, depth + 1, calls,
    ) : framed.flatMap((state) => invokeBase(
      state.constructionFrame, activated.supplied, [], state, depth + 1, calls,
    ).map((result) => ({ ...result, completion: "normal" })));
    return body.map((result) => finishDerived(result, candidate));
  }

  function applyConstruction(candidate, activated, callerState, depth, calls) {
    if (candidate.thisFact === undefined) {
      // An opaque caller may construct a supplied class, but owns no known instance.
      return [{ fact: UNKNOWN, state: updateState(callerState, { overflow: true }) }];
    }
    let allocated = callerState;
    for (const identity of candidate.thisFact?.values ?? []) {
      if (!allocated.objects.has(index.unwrap(identity))) {
        allocated = withObject(
          allocated, index.unwrap(identity), objectFact(new Map(), {
            prototypeFact: candidate.construction.prototypeFact,
          }),
        );
      }
    }
    const prepared = { ...activated,
      frames: activated.frames.map((frame) => updateState(frame, {
        objects: allocated.objects,
      })) };
    const results = candidate.construction.derived
      ? derivedResults(candidate, prepared, depth, calls)
      : baseResults(candidate, prepared, depth, calls);
    return restore(results, callerState, activated.callerEnvironment);
  }

  return Object.freeze({ applyConstruction, superOutcomes });
}
