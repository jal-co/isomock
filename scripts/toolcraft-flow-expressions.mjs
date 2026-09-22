import { UNKNOWN, exact, objectFact, updateState, withCompletion,
  withObject } from
  "./toolcraft-flow-facts.mjs";
import { createToolcraftFlowCalls } from "./toolcraft-flow-calls.mjs";
import { createToolcraftFlowLiteralValues } from
  "./toolcraft-flow-literal-values.mjs";
import { createToolcraftFlowOperators } from "./toolcraft-flow-operators.mjs";
import { createToolcraftFlowExpressionSequencing } from
  "./toolcraft-flow-expression-sequencing.mjs";
import { createToolcraftFlowPatterns } from "./toolcraft-flow-patterns.mjs";
import { createToolcraftFlowPropertyCopy } from
  "./toolcraft-flow-property-copy.mjs";
import { createToolcraftFlowReferences } from
  "./toolcraft-flow-references.mjs";
import { compactToolcraftFlowStates } from
  "./toolcraft-flow-state-joining.mjs";
export function createToolcraftFlowExpressions({
  budget, callableValues, checker, classDefinitions, executeExpression,
  executeStatements, index,
  invocationAuthority, memory, objectProvenance, recordInvocation, ts,
  propertyOperations,
}) {
  const { binaryTruth, nullish, preservedUnary, primitive, truth } =
    createToolcraftFlowOperators({ index, ts });
  let patterns;
  const frames = createToolcraftFlowCalls({
    assignPattern: (...args) => patterns.assign(...args),
    budget,
    captureValue: callableValues.captureValue,
    checker,
    evaluateExpression: (...args) => executeExpression(...args),
    index,
    memory,
    propertyOperations,
    recordInvocation,
    runStatements: executeStatements,
    ts,
  });
  const propertyKeys = memory.propertyKeys;
  const references = createToolcraftFlowReferences({
    assignPattern: (...args) => patterns.assign(...args), budget,
    evaluateExpression: (...args) => executeExpression(...args), frames, index,
    factForReference: callableValues.factForReference,
    memory, nullish, primitive, propertyOperations, truth, ts,
  });
  patterns = createToolcraftFlowPatterns({
    assignValue: references.assignValue,
    evaluateExpression: (...args) => executeExpression(...args),
    index, memory,
    readProperty: references.readProperty,
    ts,
  });
  const propertyCopy = createToolcraftFlowPropertyCopy({ memory,
    propertyOperations });
  const literals = createToolcraftFlowLiteralValues({
    evaluateExpression: (...args) => executeExpression(...args),
    frames, index, memory, primitive, propertyCopy, truth, ts,
  });
  const order = createToolcraftFlowExpressionSequencing({
    binaryTruth, budget,
    executeExpression: (...args) => executeExpression(...args),
    memory, nullish, truth, ts,
  });
  function handleExpression(node, state, depth = 0, calls = new Set()) {
    if (ts.isParenthesizedExpression(node)) {
      return executeExpression(node.expression, state, depth + 1, calls).map(
        ({ chain: omitted, ...outcome }) => outcome,
      );
    }
    if (ts.isAwaitExpression(node)) {
      return executeExpression(node.expression, state, depth + 1, calls);
    }
    if (ts.isBinaryExpression(node) &&
      node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
      node.operatorToken.kind <= ts.SyntaxKind.LastAssignment) {
      return references.assignmentOutcomes(node, state, depth, calls);
    }
    const branching = order.branchingOutcomes(node, state, depth, calls);
    if (branching) return branching;
    if (ts.isClassExpression(node)) {
      return classDefinitions.define(node, state, depth + 1, calls, false);
    }
    if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.SuperKeyword) {
        return frames.superOutcomes(node, state, depth + 1, calls);
      }
      return invokeExpression(node, state, depth, calls);
    }
    if (ts.isNewExpression(node)) return invokeExpression(
      node, state, depth, calls,
    );
    if (ts.isTaggedTemplateExpression(node)) return invokeTaggedExpression(
      node, state, depth, calls,
    );
    if ((ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
      [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(
        node.operator,
      )) {
      return references.updateOutcomes(node, state, depth, calls);
    }
    if (preservedUnary(node)) {
      return executeExpression(node.operand, state, depth + 1, calls).map(
        ({ state: next }) => ({ fact: exact([node]), state: next, truth: "unknown" }));
    }
    if (ts.isVoidExpression(node)) {
      return executeExpression(node.expression, state, depth + 1, calls).map(
        ({ state: next }) => ({ fact: exact([node]), state: next, truth: "false" }));
    }
    if (ts.isTypeOfExpression(node) || ts.isPrefixUnaryExpression(node) ||
      ts.isYieldExpression(node)) {
      const target = node.expression ?? node.operand;
      if (!target) return [{ fact: UNKNOWN, state, truth: "unknown" }];
      return executeExpression(target, state, depth + 1, calls).map(
        ({ state: next }) => ({ fact: UNKNOWN, state: next, truth: "unknown" }),
      );
    }
    if (ts.isDeleteExpression(node)) {
      return references.deleteOutcomes(node, state, depth, calls);
    }
    if (ts.isPostfixUnaryExpression(node)) {
      const target = node.operand ?? node.expression;
      const value = memory.materialize(target, state, depth + 1);
      return patterns.assign(target, UNKNOWN, value.state).map((next) => ({
        fact: UNKNOWN, state: next, truth: "unknown",
      }));
    }
    if (ts.isPropertyAccessExpression(node) ||
      ts.isElementAccessExpression(node)) {
      return references.readReference(node, state, depth + 1, calls);
    }
    if (ts.isObjectLiteralExpression(node)) {
      return literals.objectOutcomes(node, state, depth + 1, calls);
    }
    if (ts.isArrayLiteralExpression(node)) {
      return literals.arrayOutcomes(node, state, depth + 1, calls);
    }
    const ordered = order.orderedOutcomes(node, state, depth, calls);
    if (ordered) return ordered;
    if (ts.isFunctionExpression(node) || ts.isArrowFunction(node)) {
      const captured = memory.captureClosure(node, state);
      return [{ ...captured, truth: "true" }];
    }
    const pureLeaf = ts.isIdentifier(node) || ts.isLiteralExpression(node) ||
      [
        ts.SyntaxKind.FalseKeyword,
        ts.SyntaxKind.ImportKeyword,
        ts.SyntaxKind.NullKeyword,
        ts.SyntaxKind.SuperKeyword,
        ts.SyntaxKind.ThisKeyword,
        ts.SyntaxKind.TrueKeyword,
      ].includes(node.kind);
    if (!pureLeaf) return [{ fact: UNKNOWN,
      state: updateState(state, { overflow: true }), truth: "unknown" }];
    const value = memory.materialize(node, state, depth + 1);
    const reference = ts.isIdentifier(node)
      ? Object.freeze({ kind: "binding", node }) : undefined;
    return [{ ...value, reference, truth: truth(value.fact) }];
  }
  function invokeExpression(call, state, depth, calls) {
    return executeExpression(call.expression, state, depth + 1, calls).flatMap(
      (callee) => {
        if (callee.state.exit !== "normal") return [callee];
        if (callee.chain === "short-circuited" && ts.isOptionalChain(call)) {
          recordInvocation?.(call, callee.state,
            Object.freeze({ kind: "skipped" }));
          return [{ chain: callee.chain, fact: callee.fact,
            state: callee.state, truth: callee.truth }];
        }
        const status = nullish(callee.fact);
        if (!call.questionDotToken && status === "true") {
          return frames.argumentOutcomes(
            call.arguments ?? [], callee.state, depth, calls,
          ).map(({ state: ready }) => ({
            fact: callee.fact,
            state: withCompletion(ready, "throw", callee.fact),
            truth: "unknown",
          }));
        }
        const skipped = call.questionDotToken && status !== "false" ? [{
          chain: "short-circuited",
          fact: exact([ts.factory.createIdentifier("undefined")]),
          state: callee.state,
          truth: "false",
        }] : [];
        if (call.questionDotToken && status === "true") {
          recordInvocation?.(call, callee.state,
            Object.freeze({ kind: "skipped" }));
          return skipped;
        }
        if (status === "unknown" && !budget.product(2, 1)) {
          return [{ fact: UNKNOWN,
            state: updateState(callee.state, { overflow: true }),
            truth: "unknown" }];
        }
        const thrown = !call.questionDotToken && status === "unknown"
          ? frames.argumentOutcomes(
              call.arguments, callee.state, depth, calls,
            ).map(({ state: ready }) => ({
              fact: callee.fact,
              state: withCompletion(ready, "throw", callee.fact),
              truth: "unknown",
            })) : [];
        const active = invocationPlansFromCallee(
          call, callee, depth, calls,
        ).flatMap(({ plan, state: ready }) => executePlan(
          plan, call, ready, depth, calls,
        ));
        return [...skipped, ...thrown, ...active];
      },
    );
  }

  function invocationPlans(call, state, depth = 0, calls = new Set()) {
    return executeExpression(call.expression, state, depth + 1, calls).flatMap(
      (callee) => invocationPlansFromCallee(call, callee, depth, calls),
    );
  }

  function invocationPlansFromCallee(call, callee, depth, calls) {
    const prepared = callableValues.captureCallee(call, callee, depth);
    return frames.argumentOutcomes(
      call.arguments, callee.state, depth, calls,
    ).flatMap(({ evaluated, state: ready }) =>
      invocationAuthority.normalize(prepared, evaluated).map((plan) => ({
        plan, state: ready,
      })));
  }

  function invokeTaggedExpression(node, state, depth, calls) {
    const substitutions = ts.isTemplateExpression(node.template)
      ? node.template.templateSpans.map(({ expression }) => expression) : [];
    const prepared = executeExpression(
      node.tag, state, depth + 1, calls,
    ).flatMap((callee) => {
      const taggedCall = { arguments: [node.template, ...substitutions],
        expression: node.tag };
      const calleePlan = callableValues.captureCallee(
        taggedCall, callee, depth,
      );
      return frames.argumentOutcomes(
        substitutions, callee.state, depth, calls,
      ).map(
        (outcome) => ({ ...outcome, calleePlan }),
      );
    });
    const call = { arguments: [node.template, ...substitutions],
      expression: node.tag };
    return prepared.flatMap(({ calleePlan, evaluated, state: ready }) => {
      const plans = invocationAuthority.normalize(calleePlan, [frames.argumentRecord(
          node.template, { fact: exact([node.template]), state: ready }, depth,
        ), ...evaluated]);
      return plans.flatMap((plan) => executePlan(
        plan, node, ready, depth, calls,
      ));
    });
  }

  function executePlan(plan, identity, ready, depth, calls) {
    if (plan.kind === "deferred") {
      recordInvocation?.(identity, ready, plan);
      return [{ fact: exact([identity]), state: memory.captureCallable(
        identity, plan.candidates, ready,
      ), truth: "true" }];
    }
    recordInvocation?.(identity, ready, plan);
    const effects = Object.freeze({
      applyCandidate: (candidate, facts, state) => frames.apply(
        candidate, facts, state, depth + 1, calls,
      ),
    });
    const intrinsic = plan.intrinsic === "assign"
      ? propertyCopy.assign(plan, ready, effects)
      : plan.intrinsic === "defineProperty"
        ? propertyCopy.defineProperty(plan, ready, effects)
        : plan.intrinsic === "create" ? (() => {
            const object = memory.syntheticObjectIdentity(identity, "object-create");
            return [{ fact: exact([object]), state: withObject(ready, object,
              objectFact(new Map(), { prototypeFact: plan.actual[0] })) }];
          })()
          : plan.intrinsic === "symbolFor" ? [{
            fact: propertyKeys.symbolFor(plan.actual[0]) ?? UNKNOWN, state: ready,
          }] : plan.intrinsic === "symbol" ? [{
            fact: propertyKeys.freshSymbol(plan.site), state: ready,
          }] : undefined;
    if (intrinsic) return intrinsic.map((result) => ({
      ...result, truth: truth(result.fact),
    }));
    const callbacks = plan.evaluated.flatMap(
      ({ candidates = [] }) => candidates,
    );
    const opaque = { fact: exact([identity]),
      state: frames.applyOpaque(plan.actual, ready) };
    const localCandidates = plan.candidates.filter(({ external }) => !external);
    const results = localCandidates.length > 0
      ? localCandidates.flatMap((candidate) => frames.apply(
        candidate, plan.actual, ready, depth + 1, calls,
      )) : compactToolcraftFlowStates([
        opaque.state, ...callbacks.flatMap((candidate) =>
          frames.apply(candidate, [], opaque.state, depth + 1, calls)
            .map(({ state }) => state)
        ),
      ], 0).map((state) => ({ fact: opaque.fact, state }));
    return results.map((result) => ({
      fact: result.fact?.kind === "unknown" &&
        !result.fact.possibleValues?.length ? exact([identity]) : result.fact,
      state: result.state,
      truth: truth(result.fact),
    }));
  }

  return Object.freeze({
    beginEvaluation() {
      frames.beginEvaluation();
    },
    handleExpression,
    assignPattern: patterns.assign,
    invocationPlans,
  });
}
