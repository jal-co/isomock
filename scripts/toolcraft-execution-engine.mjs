import {
  UNKNOWN, boundStates, updateState,
} from "./toolcraft-flow-facts.mjs";
import { compactToolcraftFlowStates } from
  "./toolcraft-flow-state-joining.mjs";

const MAX_EXECUTION_DEPTH = 24;
const MAX_STATEMENT_VISITS = 1024;

export function createToolcraftExecutionEngine({ budget, index }) {
  let expressionHandler;
  let expressionReset = () => {};
  let initializeList = (_statements, states) => states;
  let observer;
  let statementHandler;
  let statementVisits = 0;

  function executeExpression(expression, state, depth = 0, calls = new Set()) {
    if (!expression || depth >= MAX_EXECUTION_DEPTH) {
      if (expression) observer?.(index.unwrap(expression), state,
        Object.freeze({ kind: "exhaustion", reason: "execution-depth" }));
      return [{
        fact: UNKNOWN,
        state: expression
          ? updateState(state, { overflow: true })
          : state,
        truth: "unknown",
      }];
    }
    const node = index.executionNode(expression);
    observer?.(node, state);
    if (!budget.reserve() || !expressionHandler) {
      observer?.(node, state, Object.freeze({
        kind: "exhaustion", reason: "execution-budget",
      }));
      return [{ fact: UNKNOWN,
        state: updateState(state, { overflow: true }), truth: "unknown" }];
    }
    return expressionHandler(node, state, depth, calls);
  }

  function executeStatement(statement, states, depth = 0, calls = new Set()) {
    statementVisits += 1;
    for (const state of states) observer?.(statement, state);
    if (depth >= MAX_EXECUTION_DEPTH ||
      statementVisits > MAX_STATEMENT_VISITS || !budget.reserve() ||
      !statementHandler) {
      observer?.(statement, states[0], Object.freeze({
        kind: "exhaustion",
        reason: depth >= MAX_EXECUTION_DEPTH ? "execution-depth"
          : statementVisits > MAX_STATEMENT_VISITS ? "statement-visits"
            : "execution-budget",
      }));
      return states.map((state) => updateState(state, { overflow: true }));
    }
    return statementHandler(statement, states, depth, calls);
  }

  function emitEvent(node, state, event) {
    observer?.(node, state, event);
  }

  function executeList(
    statements, states, limit = Infinity, depth = 0, calls = new Set(),
  ) {
    let current = initializeList(statements, states, depth, calls);
    for (const [position, statement] of statements.entries()) {
      const active = current.filter(({ exit }) => exit === "normal");
      if (active.length === 0) break;
      if (active.every(({ overflow }) => overflow)) {
        for (const skipped of statements.slice(position)) observer?.(
          skipped, active[0], Object.freeze({
            kind: "exhaustion", reason: "upstream-exhaustion",
          }),
        );
        break;
      }
      if (statement.getStart() >= limit) break;
      current = compactToolcraftFlowStates(executeStatement(
        statement, current, depth + 1, calls,
      ));
    }
    return boundStates(current);
  }

  function reset() {
    statementVisits = 0;
    budget.reset();
    expressionReset();
  }

  function setHandlers({ expression, initializeStatements, resetExpression,
    statement }) {
    expressionHandler = expression;
    initializeList = initializeStatements ?? initializeList;
    expressionReset = resetExpression ?? expressionReset;
    statementHandler = statement;
  }

  return Object.freeze({
    executeExpression,
    emitEvent,
    executeList,
    executeStatement,
    reset,
    setHandlers,
    setObserver(value) { observer = value; },
  });
}
