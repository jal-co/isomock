import {
  UNKNOWN, boundStates, completionOf, normalStates, resumeCompletion,
  suspendCompletion, updateState, withCompletion, withExit,
} from "./toolcraft-flow-facts.mjs";
import { toolcraftFlowStateKey } from "./toolcraft-flow-state-keys.mjs";
import { joinLoopPostStates } from "./toolcraft-flow-state-joining.mjs";

export function createToolcraftFlowControl({
  assignPattern, budget, engine, index, ts, variableDeclaration,
}) {
  function loopScopes(statement) {
    if (ts.isForInStatement(statement) || ts.isForOfStatement(statement)) {
      return Object.freeze([statement.initializer, statement.statement]);
    }
    const condition = ts.isForStatement(statement)
      ? statement.condition : ts.isWhileStatement(statement) ||
          ts.isDoStatement(statement) ? statement.expression : undefined;
    const increment = ts.isForStatement(statement)
      ? statement.incrementor : undefined;
    return Object.freeze([condition, statement.statement, increment]
      .filter(Boolean));
  }

  function ExhaustionEvent(statement) {
    return Object.freeze({ coverage: "may-revisit", kind: "exhaustion",
      reason: "loop-cap", scopes: loopScopes(statement) });
  }

  function exhaustLoop(statement, states) {
    if (states.length > 0) engine.emitEvent(
      statement, states[0], ExhaustionEvent(statement),
    );
    return states;
  }
  function primitive(fact) {
    if (fact?.kind !== "exact" || fact.values.length !== 1) return undefined;
    const node = index.unwrap(fact.values[0]);
    if (ts.isNumericLiteral(node)) return ["number", Number(node.text)];
    if (ts.isStringLiteralLike(node)) return ["string", node.text];
    if (node.kind === ts.SyntaxKind.TrueKeyword) return ["boolean", true];
    if (node.kind === ts.SyntaxKind.FalseKeyword) return ["boolean", false];
    if (node.kind === ts.SyntaxKind.NullKeyword) return ["null", null];
    return undefined;
  }

  function equalFacts(left, right) {
    const a = primitive(left);
    const b = primitive(right);
    return !a || !b ? "unknown" : a[0] === b[0] && a[1] === b[1]
      ? "true" : "false";
  }

  function runSwitchFrom(clauses, start, states, depth, calls) {
    let current = states;
    for (let position = start; position < clauses.length; position += 1) {
      const active = normalStates(current);
      current = engine.executeList(
        clauses[position].statements, active, Infinity, depth + 1, calls,
      ).concat(current.filter(({ exit }) => exit !== "normal"));
    }
    return current.map((candidate) => candidate.exit === "break" &&
      candidate.exitLabel === undefined
      ? withExit(candidate, "normal") : candidate);
  }

  function runSwitch(statement, states, depth, calls) {
    const clauses = statement.caseBlock.clauses;
    return boundStates(states.flatMap((state) => engine.executeExpression(
      statement.expression, state, depth + 1, calls,
    ).flatMap((discriminant) => {
      let pending = [discriminant];
      const matched = [];
      let defaultIndex = -1;
      clauses.forEach((clause, position) => {
        if (ts.isDefaultClause(clause)) {
          defaultIndex = position;
          return;
        }
        const next = [];
        for (const candidate of pending) {
          for (const tested of engine.executeExpression(
            clause.expression, candidate.state, depth + 1, calls,
          )) {
            const equality = equalFacts(discriminant.fact, tested.fact);
            if (equality !== "false") matched.push(...runSwitchFrom(
              clauses, position, [tested.state], depth + 1, calls,
            ));
            if (equality !== "true") next.push({ ...candidate,
              state: tested.state });
          }
        }
        pending = next;
      });
      return [...matched, ...(defaultIndex >= 0
        ? runSwitchFrom(clauses, defaultIndex,
          pending.map(({ state: next }) => next), depth + 1, calls)
        : pending.map(({ state: next }) => next))];
    })));
  }

  function runLoop(statement, states, depth, calls) {
    const loopLabel = ts.isLabeledStatement(statement.parent) &&
      statement.parent.statement === statement
      ? statement.parent.label.text : undefined;
    const owned = ({ exitLabel }) =>
      exitLabel === undefined || exitLabel === loopLabel;
    if (ts.isForInStatement(statement) || ts.isForOfStatement(statement)) {
      let current = states.flatMap((state) => engine.executeExpression(
        statement.expression, state, depth + 1, calls,
      ).map(({ state: next }) => next));
      const exits = [];
      for (let pass = 0; pass < 8 && current.length > 0; pass += 1) {
        exits.push(...current);
        const target = ts.isVariableDeclarationList(statement.initializer)
          ? statement.initializer.declarations[0]?.name : statement.initializer;
        const assigned = target ? current.flatMap((state) => assignPattern(
          target, UNKNOWN, state, depth + 1, calls,
        )) : current;
        const executed = engine.executeStatement(
          statement.statement, assigned, depth + 1, calls,
        );
        exits.push(...executed.filter((state) =>
          state.exit === "break" && owned(state))
          .map((state) => withExit(state, "normal")));
        exits.push(...executed.filter((state) => state.exit !== "normal" &&
          !(["break", "continue"].includes(state.exit) && owned(state))));
        const next = executed.filter((state) => state.exit === "normal" ||
          state.exit === "continue" && owned(state)
        ).map((state) => withExit(state, "normal"));
        const before = new Set(current.map(toolcraftFlowStateKey));
        if (next.length === before.size && next.every((state) =>
          before.has(toolcraftFlowStateKey(state)))) {
          exhaustLoop(statement, next);
          return joinLoopPostStates([...exits, ...next]);
        }
        current = next;
      }
      if (current.length > 0) exhaustLoop(statement, current);
      return current.length > 0
        ? joinLoopPostStates([...exits, ...current]) : boundStates(exits);
    }
    let current = states;
    if (ts.isForStatement(statement) && statement.initializer) {
      current = ts.isVariableDeclarationList(statement.initializer)
        ? statement.initializer.declarations.reduce((items, declaration) =>
          items.flatMap((state) => variableDeclaration(
            declaration, state, depth + 1, calls,
          )), current)
        : current.flatMap((state) => engine.executeExpression(
          statement.initializer, state, depth + 1, calls,
        ).map(({ state: next }) => next));
    }
    const exits = [];
    for (let pass = 0; pass < 8 && current.length > 0; pass += 1) {
      if (!budget.checkpoint()) {
        exits.push(...current.map((state) =>
          updateState(state, { overflow: true })
        ));
        current = [];
        break;
      }
      const condition = ts.isForStatement(statement)
        ? statement.condition : statement.expression;
      const firstDoPass = ts.isDoStatement(statement) && pass === 0;
      const conditioned = (!firstDoPass && condition
        ? current.flatMap((state) => engine.executeExpression(
          condition, state, depth + 1, calls,
        )) : current.map((state) => ({ state, truth: "true" })));
      exits.push(...conditioned.filter(({ truth }) => truth !== "true")
        .map(({ state }) => state));
      let active = conditioned.filter(({ truth }) => truth !== "false")
        .map(({ state }) => state);
      active = engine.executeStatement(statement.statement, active, depth + 1, calls);
      exits.push(...active.filter((state) =>
        state.exit === "break" && owned(state)
      ).map((state) => withExit(state, "normal")));
      exits.push(...active.filter((state) => state.exit !== "normal" &&
        !(["break", "continue"].includes(state.exit) && owned(state))));
      current = active.filter((state) => state.exit === "normal" ||
        state.exit === "continue" && owned(state)
      ).map((state) => withExit(state, "normal"));
      if (ts.isForStatement(statement) && statement.incrementor) {
        current = current.flatMap((state) => engine.executeExpression(
          statement.incrementor, state, depth + 1, calls,
        ).map(({ state: next }) => next));
      }
    }
    if (current.length > 0) {
      exhaustLoop(statement, current);
      return joinLoopPostStates([...exits, ...current]);
    }
    return boundStates(exits);
  }

  function catchStates(statement, attempted) {
    return attempted.filter(({ exit }) => exit === "throw").flatMap((state) => {
      const thrown = state.returnFact;
      const resumed = withCompletion(state, "normal");
      const binding = statement.catchClause?.variableDeclaration?.name;
      return binding ? assignPattern(
        binding, thrown, resumed,
      ) : [resumed];
    });
  }

  function runTry(statement, states, depth, calls) {
    const attempted = engine.executeStatement(
      statement.tryBlock, states, depth + 1, calls,
    );
    const thrown = catchStates(statement, attempted);
    const retained = attempted.filter(({ exit }) => exit !== "throw");
    const caught = statement.catchClause
      ? engine.executeStatement(
        statement.catchClause.block, thrown, depth + 1, calls,
      )
      : attempted.filter(({ exit }) => exit === "throw");
    const combined = [...retained, ...caught];
    if (!statement.finallyBlock) return boundStates(combined);
    return boundStates(combined.flatMap((state) => {
      const completion = completionOf(state);
      return engine.executeStatement(
        statement.finallyBlock, [suspendCompletion(state)], depth + 1, calls,
      ).map((finalState) => resumeCompletion(finalState, completion));
    }));
  }

  return Object.freeze({ runLoop, runSwitch, runTry });
}
