import { ABSENT, UNKNOWN, updateState,
  withCompletion } from "./toolcraft-flow-facts.mjs";
import { restoreToolcraftEnvironment } from "./toolcraft-flow-environments.mjs";
import { createToolcraftFlowActivation } from
  "./toolcraft-flow-activation.mjs";
import { restoreToolcraftFlowFrame } from
  "./toolcraft-flow-frame-lifecycle.mjs";
import { createToolcraftFlowConstruction } from
  "./toolcraft-flow-construction.mjs";

const MAX_EFFECT_VISITS = 128;

export function createToolcraftFlowCalls({
  assignPattern, budget, captureValue, checker, evaluateExpression, index, memory,
  propertyOperations, recordInvocation, runStatements, ts,
}) {
  const evaluation = { visits: 0 };
  const activation = createToolcraftFlowActivation({
    assignPattern, checker, memory, ts,
  });

  function applyOpaque(facts, state) {
    return facts.reduce((current, fact) => fact?.kind === "exact"
      ? fact.values.reduce((next, value) => memory.markOpaque(value, next), current)
      : current, state);
  }

  function applyExternal(evaluated, facts, state, depth, calls) {
    const opaque = applyOpaque(facts, state);
    const callbacks = evaluated.flatMap(({ candidates = [] }) => candidates);
    return [opaque, ...callbacks.flatMap((candidate) => apply(
      candidate, [], opaque, depth + 1, calls,
    ).map(({ state: next }) => next))];
  }

  function argumentOutcomes(arguments_ = [], state, depth, calls) {
    let prepared = [{ evaluated: [], facts: [], state }];
    for (const argument of arguments_) {
      const next = [];
      for (const item of prepared) {
        const outcomes = evaluateExpression(
          ts.isSpreadElement(argument) ? argument.expression : argument,
          item.state, depth + 1, calls,
        );
        const remaining = 32 - next.length;
        if (outcomes.length > remaining ||
          !budget.product(outcomes.length, 1, remaining)) {
          return [{ facts: [],
            evaluated: arguments_.map((node) => sourceRecord(node)),
            state: updateState(item.state, { overflow: true }) }];
        }
        for (const outcome of outcomes) next.push({
          evaluated: [...item.evaluated, argumentRecord(
            argument, outcome, depth,
          )],
          facts: [...item.facts, outcome.fact], state: outcome.state,
        });
      }
      prepared = next;
    }
    return prepared;
  }

  function sourceRecord(node) {
    const spread = ts.isSpreadElement(node);
    return Object.freeze({ source: index.unwrap(
      spread ? node.expression : node,
    ), spread, unresolved: true });
  }

  function argumentRecord(node, outcome, depth) {
    const source = sourceRecord(node);
    const captured = outcome.evaluatedValue ?? captureValue(
      source.source, outcome.fact, outcome.state, depth + 1,
    );
    const positionalShape = captured.positionalShape ??
      memory.positionalShapeFromFact(outcome.fact, outcome.state);
    return Object.freeze({ ...source, ...captured,
      fact: outcome.fact, positionalShape, unresolved: false });
  }

  function restore(results, state, callerEnvironment) {
    return results.map((result) => {
      const restored = updateState(restoreToolcraftEnvironment(
        result.state, callerEnvironment,
      ), { constructionFrame: state.constructionFrame,
      returnFact: result.state.exit === "normal"
        ? state.returnFact : result.state.returnFact,
      thisFact: state.thisFact });
      return { ...result, state: restoreToolcraftFlowFrame({
        callerEnvironment, callerState: state, fact: result.fact,
        index, state: restored,
      }) };
    });
  }

  function runBody(fn, frames, depth, calls) {
    if (!fn?.body) return frames.map((state) => ({
      completion: "normal", fact: UNKNOWN, state,
    }));
    const activeCalls = new Set(calls).add(fn);
    return frames.flatMap((frame) => !ts.isBlock(fn.body)
      ? evaluateExpression(fn.body, frame, depth + 1, activeCalls).map(
        ({ fact, state }) => ({ completion: "normal", fact, state }),
      ) : runStatements(
        fn.body.statements, [frame], Infinity, depth + 1, activeCalls,
      ).map((state) => {
        const completion = state.exit;
        const fact = completion === "return" ? state.returnFact : UNKNOWN;
        return { completion, fact,
          state: completion === "return"
            ? withCompletion(state, "normal", ABSENT) : state };
      }));
  }

  const construction = createToolcraftFlowConstruction({
    applyCandidate: (...args) => apply(...args),
    applyExternal,
    argumentOutcomes,
    emitEvent: recordInvocation,
    evaluateExpression,
    index,
    memory,
    propertyOperations,
    restore,
    runBody,
    ts,
  });

  function apply(candidate, argumentFacts, state, depth, calls) {
    const identity = candidate.construction?.classNode ?? candidate.fn;
    if (!budget.checkpoint() || evaluation.visits >= MAX_EFFECT_VISITS ||
      calls.has(identity)) {
      return [{ fact: UNKNOWN, state: updateState(state, { overflow: true }) }];
    }
    evaluation.visits += 1;
    const activated = activation.activate(
      candidate, argumentFacts, state, depth, calls,
    );
    if (candidate.construction) return construction.applyConstruction(
      candidate, activated, state, depth, new Set(calls).add(identity),
    );
    return restore(runBody(candidate.fn, activated.frames, depth, calls),
      state, activated.callerEnvironment);
  }

  return Object.freeze({
    apply,
    applyOpaque,
    argumentRecord,
    argumentOutcomes,
    beginEvaluation() { evaluation.visits = 0; },
    superOutcomes: construction.superOutcomes,
  });
}
