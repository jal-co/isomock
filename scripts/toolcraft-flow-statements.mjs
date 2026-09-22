import {
  boundStates, normalStates, updateState,
  withCompletion, withExit,
} from "./toolcraft-flow-facts.mjs";
import { createToolcraftExecutionBudget } from
  "./toolcraft-execution-budget.mjs";
import { createToolcraftExecutionEngine } from
  "./toolcraft-execution-engine.mjs";
import { createToolcraftExecutionObserver } from
  "./toolcraft-execution-observer.mjs";
import { compactToolcraftFlowStates } from
  "./toolcraft-flow-state-joining.mjs";
import { createToolcraftFlowExpressions } from
  "./toolcraft-flow-expressions.mjs";
import { createToolcraftFlowControl } from "./toolcraft-flow-control.mjs";
import { createToolcraftFlowCallableValues } from
  "./toolcraft-flow-callable-values.mjs";
import { createToolcraftFlowClassDefinitions } from
  "./toolcraft-flow-class-definitions.mjs";
import { createToolcraftFlowMemory } from "./toolcraft-flow-memory.mjs";
import { createToolcraftFlowObjectProvenance } from
  "./toolcraft-flow-object-provenance.mjs";
import { createToolcraftFlowPropertyOperations } from
  "./toolcraft-flow-property-operations.mjs";
import { createToolcraftInvocationAuthority } from
  "./toolcraft-invocation-authority.mjs";

export function createToolcraftFlowStatements({
  checker, index, resolveStaticString, ts,
}) {
  const budget = createToolcraftExecutionBudget();
  const engine = createToolcraftExecutionEngine({ budget, index });
  const memory = createToolcraftFlowMemory({
    checker, index, resolveStaticString, ts,
  });
  const propertyOperations = createToolcraftFlowPropertyOperations({
    checker, index, memory, propertyKeys: memory.propertyKeys, ts,
  });
  const objectProvenance = createToolcraftFlowObjectProvenance({
    checker, index, ts,
  });
  const callableValues = createToolcraftFlowCallableValues({
    checker, index, memory, objectProvenance, ts,
  });
  const classDefinitions = createToolcraftFlowClassDefinitions({
    callableValues,
    evaluateExpression: (...args) => engine.executeExpression(...args),
    executeStatements: (...args) => engine.executeList(...args),
    index,
    memory,
    propertyOperations,
    ts,
  });
  const invocationAuthority = createToolcraftInvocationAuthority();
  const effects = createToolcraftFlowExpressions({
    budget,
    checker,
    executeExpression: (...args) => engine.executeExpression(...args),
    executeStatements: (...args) => engine.executeList(...args),
    index,
    invocationAuthority,
    classDefinitions,
    callableValues,
    memory,
    objectProvenance,
    propertyOperations,
    recordInvocation: engine.emitEvent,
    ts,
  });

  function variableDeclaration(declaration, state, depth, calls) {
    if (!declaration.initializer) return [state];
    return engine.executeExpression(
      declaration.initializer, state, depth + 1, calls,
    ).flatMap((outcome) => effects.assignPattern(
      declaration.name, outcome.fact, outcome.state, depth + 1, calls,
    ));
  }

  const { runLoop, runSwitch, runTry } = createToolcraftFlowControl({
    assignPattern: effects.assignPattern,
    budget, engine, index, ts, variableDeclaration,
  });

  function initializeStatements(statements, states) {
    const bindings = statements.flatMap((statement) =>
      (ts.isFunctionDeclaration(statement) ||
        ts.isClassDeclaration(statement)) && statement.name &&
        !statement.modifiers?.some(
          ({ kind }) => kind === ts.SyntaxKind.DeclareKeyword,
        )
        ? [statement.name]
        : ts.isVariableStatement(statement) && !statement.modifiers?.some(
          ({ kind }) => kind === ts.SyntaxKind.DeclareKeyword,
        )
          ? statement.declarationList.declarations.map(({ name }) => name)
          : []
    );
    const declared = bindings.reduce((current, name) => current.map((state) =>
      memory.declarePattern(name, state)
    ), states);
    const functions = statements.filter((statement) =>
      ts.isFunctionDeclaration(statement) && statement.name && statement.body
    );
    return functions.reduce((current, declaration) => current.map((state) => {
      const captured = memory.captureDeclaration(declaration, state);
      engine.emitEvent(declaration, captured,
        Object.freeze({ kind: "capture" }));
      return captured;
    }), declared);
  }

  function handleStatement(statement, states, depth = 0, calls = new Set()) {
    const active = normalStates(states);
    const abrupt = states.filter(({ exit }) => exit !== "normal");
    if (active.length === 0) return states;
    let results;
    if (ts.isBlock(statement)) {
      results = engine.executeList(statement.statements, active, Infinity,
        depth + 1, calls);
    } else if (ts.isVariableStatement(statement)) {
      results = active;
      for (const declaration of statement.declarationList.declarations) {
        results = results.flatMap((state) =>
          variableDeclaration(declaration, state, depth + 1, calls)
        );
      }
    } else if (ts.isExpressionStatement(statement)) {
      results = active.flatMap((state) => engine.executeExpression(
        statement.expression, state, depth + 1, calls,
      ).map(({ state: next }) => next));
    } else if (ts.isIfStatement(statement)) {
      results = active.flatMap((state) => engine.executeExpression(
        statement.expression, state, depth + 1, calls,
      ).flatMap((condition) => [
        ...(condition.truth !== "false" ? engine.executeStatement(
          statement.thenStatement, [condition.state], depth + 1, calls) : []),
        ...(condition.truth !== "true" ? statement.elseStatement
          ? engine.executeStatement(statement.elseStatement, [condition.state],
            depth + 1, calls) : [condition.state] : []),
      ]));
    } else if (ts.isSwitchStatement(statement)) {
      results = runSwitch(statement, active, depth + 1, calls);
    } else if (ts.isTryStatement(statement)) {
      results = runTry(statement, active, depth + 1, calls);
    } else if (ts.isReturnStatement(statement) || ts.isThrowStatement(statement)) {
      results = active.flatMap((state) => statement.expression
        ? engine.executeExpression(statement.expression, state, depth + 1, calls)
          .map(({ fact, state: next }) => withCompletion(next,
            ts.isReturnStatement(statement) ? "return" : "throw", fact))
        : [withCompletion(state,
          ts.isReturnStatement(statement) ? "return" : "throw")]);
    } else if (ts.isBreakStatement(statement) ||
      ts.isContinueStatement(statement)) {
      results = active.map((state) => withExit(state,
        ts.isBreakStatement(statement) ? "break" : "continue",
        statement.label?.text));
    } else if (ts.isIterationStatement(statement, false)) {
      results = runLoop(statement, active, depth + 1, calls);
    } else if (ts.isLabeledStatement(statement)) {
      results = engine.executeStatement(statement.statement, active, depth + 1, calls)
        .map((state) => state.exit === "break" &&
          state.exitLabel === statement.label.text
          ? withExit(state, "normal") : state);
    } else if (ts.isExportAssignment(statement)) {
      results = active.flatMap((state) => engine.executeExpression(
        statement.expression, state, depth + 1, calls,
      ).map(({ state: next }) => next));
    } else if (ts.isClassDeclaration(statement) &&
      !statement.modifiers?.some(
        ({ kind }) => kind === ts.SyntaxKind.DeclareKeyword,
      )) {
      results = active.flatMap((state) => classDefinitions.define(
        statement, state, depth + 1, calls, true,
      ).map(({ state: next }) => next));
    } else if (ts.isFunctionDeclaration(statement) ||
      ts.isClassDeclaration(statement) ||
      ts.isInterfaceDeclaration(statement) ||
      ts.isTypeAliasDeclaration(statement) ||
      ts.isImportDeclaration(statement) ||
      ts.isImportEqualsDeclaration(statement) ||
      ts.isExportDeclaration(statement) ||
      ts.isEmptyStatement(statement) || ts.isDebuggerStatement(statement)) {
      results = active;
    } else {
      results = active.map((state) => updateState(state, { overflow: true }));
    }
    return boundStates(compactToolcraftFlowStates([...abrupt, ...results]));
  }

  engine.setHandlers({
    expression: effects.handleExpression,
    initializeStatements,
    resetExpression: effects.beginEvaluation,
    statement: handleStatement,
  });
  const observer = createToolcraftExecutionObserver({
    assignPattern: effects.assignPattern,
    index,
    memory,
    reset: engine.reset,
    runExpression: engine.executeExpression,
    runStatement: engine.executeStatement,
    runStatements: engine.executeList,
    setObserver: engine.setObserver,
    ts,
  });
  return Object.freeze({
    ...memory,
    expressionOutcomes: engine.executeExpression,
    invocationsAt: observer.invocationsAt,
    statesBefore: observer.statesBefore,
  });
}
