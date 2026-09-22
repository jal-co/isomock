import ts from "typescript";
import { interpretPlaywrightProvenanceMutation } from "./toolcraft-playwright-provenance-mutation.mjs";

import {
  UNKNOWN,
  cloneProvenance as clone,
  equalProvenance as equal,
  joinProvenance as join,
  provenanceValue as value,
  readProvenanceMember as member,
  safeProvenance as safe,
  unknownProvenance as unknown,
  unwrapExpression as unwrap,
} from "./toolcraft-playwright-provenance-value.mjs";

const MAX_LOCAL_FUNCTION_ITERATIONS = 32;

export function interpretPlaywrightProvenanceStatements(context) {
  const outcome = runStatements(context.statements, context);
  return outcome.returned ?? safe();
}

function runStatements(statements, context) {
  hoistLocalFunctions(statements, context);
  let returned;
  for (const statement of statements) {
    context.tick(statement);
    if (ts.isFunctionDeclaration(statement)) continue;
    if (ts.isVariableStatement(statement)) {
      bindVariableDeclarations(statement.declarationList, context, false);
    } else if (ts.isClassDeclaration(statement) && statement.name) {
      context.bind(statement.name, context.evaluate(statement));
    } else if (ts.isReturnStatement(statement)) {
      const returnedValue = statement.expression ? context.evaluate(statement.expression) : safe();
      recordExpressionEffects(statement.expression, returnedValue, context);
      return { completion: "return", returned: joinOptional(returned, returnedValue) };
    } else if (ts.isThrowStatement(statement)) {
      context.evaluate(statement.expression);
      return { completion: "throw", returned };
    } else if (ts.isBreakStatement(statement)) {
      return { completion: "break", returned };
    } else if (ts.isContinueStatement(statement)) {
      return { completion: "continue", returned };
    } else if (ts.isExpressionStatement(statement)) {
      interpretExpression(statement.expression, context);
    } else if (ts.isBlock(statement)) {
      const nested = runStatements(statement.statements, context);
      returned = joinOptional(returned, nested.returned);
      if (nested.completion !== "normal") return { ...nested, returned };
    } else if (ts.isIfStatement(statement)) {
      context.evaluate(statement.expression, false);
      const branches = [statement.thenStatement];
      if (statement.elseStatement) branches.push(statement.elseStatement);
      else branches.push(ts.factory.createBlock([]));
      const outcome = runBranches(branches, context);
      returned = joinOptional(returned, outcome.returned);
      if (outcome.completion !== "normal") return { ...outcome, returned };
    } else if (ts.isSwitchStatement(statement)) {
      context.evaluate(statement.expression, false);
      const branches = createSwitchBranches(statement);
      const outcome = runBranches(branches, context, new Set(["break"]));
      returned = joinOptional(returned, outcome.returned);
      if (outcome.completion !== "normal") return { ...outcome, returned };
    } else if (isLoop(statement)) {
      const outcome = runLoop(statement, context);
      returned = joinOptional(returned, outcome.returned);
      if (outcome.completion === "return") return { completion: "return", returned };
    } else if (ts.isTryStatement(statement)) {
      const outcome = runTry(statement, context);
      returned = joinOptional(returned, outcome.returned);
      if (outcome.completion !== "normal") return { ...outcome, returned };
    } else if (!ts.isEmptyStatement(statement)) {
      returned = joinOptional(returned, unknown());
    }
  }
  return { completion: "normal", returned };
}

function interpretExpression(input, context) {
  const mutation = interpretPlaywrightProvenanceMutation({ ...context, input });
  if (mutation.handled) {
    recordExpressionEffects(input, mutation.value, context);
    return mutation.value;
  }
  const result = context.evaluate(unwrap(input));
  context.recordExecution?.(result, input);
  return result;
}

function bindVariableDeclarations(declarationList, context, unknownValues) {
  for (const declaration of declarationList.declarations) {
    const initializer = unknownValues ? unknown() : declaration.initializer
      ? context.evaluate(declaration.initializer, ts.isIdentifier(declaration.name)) : unknown();
    recordExpressionEffects(declaration.initializer, initializer, context);
    context.bind(declaration.name, initializer);
    if (ts.isIdentifier(declaration.name)) context.env.get(declaration.name.text).scopedCell = false;
  }
}

function recordExpressionEffects(expression, result, context) {
  if (!expression) return;
  const node = unwrap(expression);
  if (ts.isCallExpression(node) || ts.isTaggedTemplateExpression(node) || ts.isNewExpression(node) ||
    ts.isAwaitExpression(node) || ts.isYieldExpression(node) || ts.isConditionalExpression(node) ||
    ts.isBinaryExpression(node) || ts.isVoidExpression(node) || ts.isDeleteExpression(node)) {
    context.recordEvaluatedEffects?.(result, expression);
  }
}

function runBranches(branches, context, consumedCompletions = new Set()) {
  const initial = snapshotEnvironment(context.env);
  const outcomes = branches.map((branch) => {
    restoreEnvironment(context.env, initial);
    return {
      env: snapshotAfter(context.env, () => runStatements(
        ts.isBlock(branch) ? branch.statements : [branch], context,
      )),
    };
  }).map(({ env }) => ({ env: env.snapshot, ...env.outcome }));
  restoreEnvironment(context.env, initial);
  const normalized = outcomes.map((outcome) => ({
    ...outcome,
    normalizedCompletion: consumedCompletions.has(outcome.completion) ? "normal" : outcome.completion,
  }));
  const continuing = normalized.filter(({ normalizedCompletion }) => normalizedCompletion === "normal");
  if (continuing.length > 0) mergeEnvironments(context.env, continuing.map(({ env }) => env));
  const completions = new Set(normalized.map(({ normalizedCompletion }) => normalizedCompletion));
  return {
    completion: completions.size === 1 ? [...completions][0] : "normal",
    returned: outcomes.reduce((result, outcome) => joinOptional(result, outcome.returned), undefined),
  };
}

function createSwitchBranches(statement) {
  const clauses = statement.caseBlock.clauses;
  const branches = clauses.map((_, start) => {
    const statements = [];
    for (let index = start; index < clauses.length; index += 1) {
      for (const child of clauses[index].statements) {
        statements.push(child);
        if (ts.isBreakStatement(child)) return ts.factory.createBlock(statements);
      }
    }
    return ts.factory.createBlock(statements);
  });
  if (!clauses.some(ts.isDefaultClause)) branches.push(ts.factory.createBlock([]));
  return branches;
}

function isLoop(statement) {
  return ts.isForStatement(statement) || ts.isForInStatement(statement) ||
    ts.isForOfStatement(statement) || ts.isWhileStatement(statement) || ts.isDoStatement(statement);
}

function runLoop(statement, context) {
  if (ts.isForStatement(statement)) {
    if (statement.initializer && ts.isVariableDeclarationList(statement.initializer)) {
      bindVariableDeclarations(statement.initializer, context, false);
    } else if (statement.initializer) context.evaluate(statement.initializer);
    if (statement.condition) context.evaluate(statement.condition, false);
  } else if (ts.isForInStatement(statement) || ts.isForOfStatement(statement)) {
    const iterable = context.evaluate(statement.expression, false);
    const entry = member(iterable, "0");
    if (ts.isVariableDeclarationList(statement.initializer)) {
      for (const declaration of statement.initializer.declarations) context.bind(declaration.name, entry);
    } else if (ts.isIdentifier(statement.initializer)) context.bind(statement.initializer, entry);
  } else if (statement.expression) context.evaluate(statement.expression, false);
  const bodyStatements = [statement.statement];
  if (ts.isForStatement(statement) && statement.incrementor) {
    bodyStatements.push(ts.factory.createExpressionStatement(statement.incrementor));
  }
  const initial = snapshotEnvironment(context.env);
  let carried = initial;
  let returned;
  const exits = ts.isDoStatement(statement) ? [] : [initial];
  for (let iteration = 0; iteration < MAX_LOCAL_FUNCTION_ITERATIONS; iteration += 1) {
    restoreEnvironment(context.env, carried);
    const outcome = runStatements(bodyStatements, context);
    returned = joinOptional(returned, outcome.returned);
    const next = snapshotEnvironment(context.env);
    if (outcome.completion === "return" || outcome.completion === "throw") {
      if (exits.length > 0) restoreEnvironment(context.env, mergeSnapshots(exits));
      return { completion: exits.length > 0 ? "normal" : outcome.completion, returned };
    }
    exits.push(next);
    if (outcome.completion === "break") {
      restoreEnvironment(context.env, mergeSnapshots(exits));
      return { completion: "normal", returned };
    }
    const joined = ts.isDoStatement(statement) && iteration === 0
      ? next : mergeSnapshots([carried, next]);
    if (equalSnapshots(joined, carried)) {
      restoreEnvironment(context.env, mergeSnapshots(exits));
      return { completion: "normal", returned };
    }
    carried = joined;
  }
  const poisoned = mergeSnapshots([carried, ...exits]);
  for (const binding of poisoned.values()) {
    binding.item.state = UNKNOWN;
    binding.item.call = UNKNOWN;
    binding.item.closed = false;
    binding.item.members.set("*", unknown());
  }
  restoreEnvironment(context.env, poisoned);
  return { completion: "normal", returned: joinOptional(returned, unknown()) };
}

function runTry(statement, context) {
  const initial = snapshotEnvironment(context.env);
  const tryOutcome = runStatements(statement.tryBlock.statements, context);
  const tryEnvironment = snapshotEnvironment(context.env);
  restoreEnvironment(context.env, initial);
  let catchOutcome = { completion: "throw" };
  let catchEnvironment = initial;
  if (statement.catchClause) {
    if (statement.catchClause.variableDeclaration) {
      context.bind(statement.catchClause.variableDeclaration.name, unknown());
    }
    catchOutcome = runStatements(statement.catchClause.block.statements, context);
    catchEnvironment = snapshotEnvironment(context.env);
  }
  const continuingEnvironments = [];
  if (tryOutcome.completion === "normal") continuingEnvironments.push(tryEnvironment);
  if (catchOutcome.completion === "normal") continuingEnvironments.push(catchEnvironment);
  if (continuingEnvironments.length > 0) mergeEnvironments(context.env, continuingEnvironments);
  else restoreEnvironment(context.env, initial);
  let outcome = {
    completion: tryOutcome.completion === catchOutcome.completion ? tryOutcome.completion : "normal",
    returned: joinOptional(tryOutcome.returned, catchOutcome.returned),
  };
  if (statement.finallyBlock) {
    const finalOutcome = runStatements(statement.finallyBlock.statements, context);
    if (finalOutcome.completion !== "normal") outcome = finalOutcome;
    else outcome.returned = joinOptional(outcome.returned, finalOutcome.returned);
  }
  return outcome;
}

function hoistLocalFunctions(statements, context) {
  for (const statement of statements) if (ts.isVariableStatement(statement)) {
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && !context.env.has(declaration.name.text)) {
        context.bind(declaration.name, unknown());
        context.env.get(declaration.name.text).scopedCell = true;
      }
    }
  }
  const declarations = statements.filter((statement) =>
    ts.isFunctionDeclaration(statement) && statement.name);
  for (const declaration of declarations) {
    context.bind(declaration.name, value(0, 0, new Map(), true, undefined, false, undefined, safe()));
  }
  for (let iteration = 0; declarations.length > 0 && iteration < MAX_LOCAL_FUNCTION_ITERATIONS; iteration += 1) {
    let changed = false;
    for (const declaration of declarations) {
      const previous = context.env.get(declaration.name.text).item;
      const next = context.evaluate(declaration);
      context.bind(declaration.name, next);
      changed ||= !equal(previous, next);
    }
    if (!changed) return;
  }
  for (const declaration of declarations) context.bind(declaration.name, unknown());
}

const joinOptional = (left, right) => !left ? right : !right ? left : join(left, right);
function snapshotEnvironment(env) {
  return new Map([...env].map(([name, binding]) => [name, { ...binding, item: clone(binding.item) }]));
}
function restoreEnvironment(env, snapshot) {
  env.clear();
  for (const pair of snapshot) env.set(...pair);
}
function snapshotAfter(env, operation) {
  const outcome = operation();
  return { outcome, snapshot: snapshotEnvironment(env) };
}
function mergeEnvironments(env, snapshots) {
  const names = new Set(snapshots.flatMap((snapshot) => [...snapshot.keys()]));
  for (const name of names) {
    const bindings = snapshots.map((snapshot) => snapshot.get(name)).filter(Boolean);
    if (bindings.length > 0) env.set(name, {
      ...bindings[0],
      item: bindings.slice(1).reduce((item, binding) => join(item, binding.item), bindings[0].item),
    });
  }
}
function mergeSnapshots(snapshots) {
  const merged = new Map();
  mergeEnvironments(merged, snapshots);
  return merged;
}
function equalSnapshots(left, right) {
  return left.size === right.size && [...left].every(([name, binding]) =>
    right.has(name) && equal(binding.item, right.get(name).item));
}
