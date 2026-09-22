import { UNKNOWN, boundStates, emptyState } from "./toolcraft-flow-facts.mjs";
import { compactToolcraftFlowStates } from
  "./toolcraft-flow-state-joining.mjs";
import { toolcraftInvocationAlternatives } from
  "./toolcraft-invocation-facts.mjs";

const MAX_OBSERVED_STATES = 32;

export function createToolcraftExecutionObserver({
  assignPattern, index, reset, runExpression, runStatement, runStatements,
  setObserver, ts,
}) {
  const executionSummaries = new WeakMap();
  const invocationCache = new Map();

  function containingFunction(target) {
    for (let node = target.parent; node; node = node.parent) {
      if (ts.isFunctionLike(node)) return node;
    }
    return undefined;
  }

  function executeFunction(fn, seeds) {
    let states = compactToolcraftFlowStates(seeds, 1);
    for (const parameter of fn.parameters ?? []) states = states.flatMap(
      (state) => assignPattern(parameter, UNKNOWN, state),
    );
    return ts.isBlock(fn.body)
      ? runStatement(fn.body, states, 0)
      : states.flatMap((state) => runExpression(fn.body, state, 0)
        .map(({ state: next }) => next));
  }

  function executeRegion(region) {
    if (ts.isSourceFile(region)) return runStatements(
      region.statements, [emptyState()], Infinity, 0,
    );
    return region?.body ? executeFunction(region, [emptyState()]) : [];
  }

  function createExecutionSummary(region) {
    const exhaustions = [];
    const invocations = new Map();
    const settled = new Set();
    const states = new Map();
    setObserver((node, state, event) => {
      const observedStates = states.get(node) ?? [];
      if (!event && observedStates.length < MAX_OBSERVED_STATES) {
        observedStates.push(state);
        states.set(node, observedStates);
      }
      if (event?.kind === "exhaustion") {
        exhaustions.push(Object.freeze({
          coverage: event.coverage,
          kind: event.reason ?? "execution-budget", node,
          scopes: event.scopes ?? Object.freeze([node]),
        }));
      }
      if (ts.isCallExpression(node) || ts.isNewExpression(node) ||
        ts.isTaggedTemplateExpression(node)) {
        if (["deferred", "invocation", "skipped"].includes(event?.kind)) {
          settled.add(node);
        }
        const observedInvocations = invocations.get(node) ?? [];
        if (event?.kind === "invocation" && observedInvocations.length <
          MAX_OBSERVED_STATES) {
          const exhaustedSources = event.evaluated.filter((value) =>
            value.unresolved || value.fact?.kind === "overflow"
          ).map(({ source }) => source);
          if (exhaustedSources.length === 0 && event.actual.some((fact) =>
            fact?.kind === "overflow"
          )) exhaustedSources.push(node);
          observedInvocations.push(Object.freeze({
            event, exhaustedSources: Object.freeze(exhaustedSources),
          }));
          invocations.set(node, observedInvocations);
        }
      }
    });
    let finalStates;
    try {
      finalStates = executeRegion(region);
    } finally {
      setObserver(undefined);
    }
    return Object.freeze({ exhaustions: Object.freeze(exhaustions),
      finalStates: boundStates(finalStates), invocations, settled, states });
  }

  function summaryForRegion(region) {
    let summary = executionSummaries.get(region);
    if (!summary) {
      summary = createExecutionSummary(region);
      executionSummaries.set(region, summary);
    }
    return summary;
  }

  function summaryAt(target, invocation = false) {
    const source = target.getSourceFile?.();
    if (!source) return createExecutionSummary(undefined);
    const sourceSummary = summaryForRegion(source);
    if (invocation ? sourceSummary.states.has(target)
      : sourceSummary.states.get(target)?.length > 0) {
      return sourceSummary;
    }
    const fn = containingFunction(target);
    if (fn && (ts.isGetAccessorDeclaration(fn) ||
      ts.isSetAccessorDeclaration(fn) || ts.isMethodDeclaration(fn))) {
      return sourceSummary;
    }
    return fn?.body ? summaryForRegion(fn) : sourceSummary;
  }

  function statesBefore(target) {
    reset();
    const observedTarget = index.unwrap(
      ts.isJsxSpreadAttribute(target) ? target.expression
        : ts.isJsxAttribute(target) && ts.isJsxExpression(target.initializer) &&
            target.initializer.expression
          ? target.initializer.expression : target,
    );
    const summary = summaryAt(observedTarget);
    const states = summary.states.get(observedTarget) ?? [];
    return boundStates(states.length > 0 ? states
      : summary.exhaustions.some(({ scopes }) => scopes.some((scope) =>
          index.contains(scope, observedTarget)
        ))
        ? summary.finalStates : []);
  }

  function resultFromSummary(summary, target) {
    const observed = summary.invocations.get(target) ?? [];
    const invocations = observed.map(({ event }) => event);
    const exhaustedPaths = [
      ...observed.filter(({ exhaustedSources }) =>
        exhaustedSources.length > 0
      ).map(({ exhaustedSources }) => Object.freeze({
        kind: "invocation-value-exhaustion",
        sources: exhaustedSources,
        target,
      })),
      ...summary.exhaustions.filter(({ scopes }) => scopes.some((scope) =>
        index.contains(scope, target)
      )).map(({ coverage, kind, node, scopes }) => Object.freeze({
        coverage, kind, node, scopes, target,
      })),
    ];
    const kind = exhaustedPaths.length === 0 ? "exact"
      : invocations.length > 0 ? "partial" : "exhausted";
    return toolcraftInvocationAlternatives(
      kind, invocations, exhaustedPaths,
    );
  }

  function invocationsAt(target) {
    reset();
    const observedTarget = index.unwrap(target);
    const cached = invocationCache.get(observedTarget);
    if (cached) return cached;
    const summary = summaryAt(observedTarget, true);
    const result = resultFromSummary(summary, observedTarget);
    invocationCache.set(observedTarget, result);
    return result;
  }

  return Object.freeze({ invocationsAt, statesBefore });
}
