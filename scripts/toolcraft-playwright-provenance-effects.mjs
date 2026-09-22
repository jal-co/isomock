import ts from "typescript";
import { isBuiltin } from "node:module";
import {
  AUTHORITY, SAFE, UNKNOWN, authorityProvenance as authority, poisonProvenance as poison,
  joinProvenance as join,
  provenanceValue as value, rankProvenance as rank, safeProvenance as safe,
  substituteProvenanceParameters as substitute, readProvenanceMember as member,
  tagProvenance as tagged, unknownProvenance as unknown, writeProvenancePath,
  unwrapExpression as unwrap,
} from "./toolcraft-playwright-provenance-value.mjs";

export const isTrustedPlaywrightExternalSpecifier = (specifier) => isBuiltin(specifier);
export function readPlaywrightIntrinsicMember(owner, key) {
  if (["global:globalThis", "global:global"].includes(owner.target) && ["Proxy", "Reflect"].includes(key)) return { ...safe(), target: `global:${key}` };
  if (["global:globalThis", "global:global"].includes(owner.target)) return ["crypto", "setTimeout", "clearTimeout", "console", "performance", "URL", "fetch", "AbortController", "structuredClone"].includes(key) ? safe() : tagged(unknown(), "intrinsic:global");
  if (["global:Proxy", "global:Reflect"].includes(owner.target) && key !== undefined) return { ...member(owner, key), target: `${owner.target}.${key}` };
  return member(owner, key);
}

export function createPlaywrightNamespace() {
  const result = value(SAFE, SAFE, new Map(), true), expect = safe();
  const poll = value(SAFE, SAFE, new Map(), true, undefined, false, undefined, safe());
  poll.invokedParameters = [{ parameterIndex: 0, parameterPath: [] }]; expect.members.set("poll", poll);
  result.members.set("test", tagged(authority(), "@playwright/test")); result.members.set("expect", expect); return result;
}

export function createPlaywrightProvenanceEffects(env) {
  const stack = [];
  const begin = (previous, clones) => {
    const context = { captured: new Map([...previous].map(([name, binding]) => [name,
      { clone: clones.get(binding.item), original: binding.item }])), clones, env,
    execution: SAFE, invokedCallables: [], invokedParameters: [], writes: [] };
    context.recordExecution = (item) => {
      context.execution = Math.max(context.execution, item.executionEffect ?? rank(item));
      context.invokedParameters.push(...(item.invokedParameters ?? []));
      context.invokedCallables.push(...(item.invokedCallables ?? []));
    };
    context.recordEvaluatedEffects = (item, node) => {
      context.execution = Math.max(context.execution, item.executionEffect ?? SAFE);
      context.invokedParameters.push(...(item.invokedParameters ?? []));
    };
    stack.push(context);
    return context;
  };
  const end = () => stack.pop();
  const recordWrite = (path, assigned) => {
    const active = stack.at(-1), binding = path && env.get(path.root);
    if (!active || !path) return;
    if (!binding) {
      active.execution = UNKNOWN;
      active.writes.push({ assigned: unknown(), keys: [], wildcard: true });
      return;
    }
    if (binding.item.parameterIndex !== undefined) {
      active.writes.push({ assigned, keys: [...binding.item.parameterPath, ...path.keys], parameterIndex: binding.item.parameterIndex });
      return;
    }
    const capturedEntry = [...active.captured].find(([, { clone }]) => clone === binding.item);
    if (capturedEntry) active.writes.push({ assigned, keys: path.keys,
      target: capturedEntry[1].original, targetKey: capturedEntry[0] });
  };
  const applyCallWrites = (callee, argumentsValues, context = { active: [], steps: 0 }) => {
    if (++context.steps > 50_000) return UNKNOWN;
    const invocation = { argumentsValues, callee, effect: callee.executionEffect ?? SAFE,
      ranks: argumentsValues.map((argument) => rank(argument)) };
    if (context.active.some((item) => item.callee === callee && item.argumentsValues.length === argumentsValues.length &&
      item.effect === invocation.effect && item.ranks.every((value, index) => value === invocation.ranks[index]) &&
      item.argumentsValues.every((argument, index) => argument === argumentsValues[index]))) return UNKNOWN;
    context.active.push(invocation);
    let execution = callee.executionEffect ?? SAFE;
    for (const write of callee.writes ?? []) {
      const assigned = tagged(substitute(write.assigned, argumentsValues), callee.target);
      if (write.wildcard) { for (const argument of argumentsValues) poison(argument); continue; }
      const parameterTarget = write.parameterIndex === undefined ? undefined : argumentsValues[write.parameterIndex];
      const active = stack.at(-1), localTarget = active?.clones.get(write.target) ??
        (active && write.target ? active.clones.get(write.target) : undefined);
      writeProvenancePath(parameterTarget ?? localTarget ?? write.target, write.keys, assigned);
      if (localTarget) active.writes.push({ ...write, assigned });
    }
    const invoked = [...(callee.invokedCallables ?? []),
      ...(callee.invokedParameters ?? []).map((invocation) => {
      let callable = argumentsValues[invocation.parameterIndex] ?? unknown();
      for (const key of invocation.parameterPath) callable = member(callable, key);
      return { argumentsValues: (invocation.argumentsValues ?? []).map((item) => substitute(item, argumentsValues)), callable };
    })];
    for (const { argumentsValues: invokedArguments, callable } of invoked) {
      const active = stack.at(-1);
      const captured = active && [...active.captured.values()].find(({ clone }) => clone === callable);
      if (captured) {
        active.invokedCallables.push({ argumentsValues: invokedArguments, callable: captured.original });
        continue;
      }
      if (active && callable.parameterIndex !== undefined) {
        active.invokedParameters.push({ argumentsValues: invokedArguments,
          parameterIndex: callable.parameterIndex, parameterPath: callable.parameterPath });
        continue;
      }
      execution = Math.max(execution, callable.call, applyCallWrites(callable, invokedArguments, context));
    }
    context.active.pop();
    return execution;
  };
  return { applyCallWrites, begin, end, recordWrite };
}

export const hasPlaywrightProvenanceExecutionAuthority = (callee) =>
  callee.call === AUTHORITY || (callee.executionEffect ?? SAFE) !== SAFE;

function isSafeProxyHandlerNode(node, evaluate) {
  return Boolean(node && ts.isObjectLiteralExpression(node) && node.properties.every((property) => {
    if (!ts.isMethodDeclaration(property) || !ts.isIdentifier(property.name)) return false;
    const statement = property.body?.statements[0], expression = statement && ts.isReturnStatement(statement) ? unwrap(statement.expression) : undefined;
    if (property.name.text === "get" && property.parameters.length >= 2 && expression && ts.isElementAccessExpression(expression) && ts.isIdentifier(expression.expression))
      return ts.isIdentifier(property.parameters[0].name) && expression.expression.text === property.parameters[0].name.text && ts.isIdentifier(expression.argumentExpression) && ts.isIdentifier(property.parameters[1].name) && expression.argumentExpression.text === property.parameters[1].name.text;
    return ["get", "set"].includes(property.name.text) && expression && ts.isCallExpression(expression) && ts.isPropertyAccessExpression(expression.expression) && ts.isIdentifier(expression.expression.expression) && expression.expression.expression.text === "Reflect" && evaluate(expression.expression.expression, false).target === "global:Reflect" && expression.expression.name.text === property.name.text && expression.arguments.every((argument, index) => ts.isIdentifier(argument) && ts.isIdentifier(property.parameters[index]?.name) && argument.text === property.parameters[index].name.text);
  }));
}

export function evaluatePlaywrightProxyConstruction({ argumentsValues, constructor, evaluate, mark, markUse, node }) {
  if (constructor.target !== "global:Proxy") return undefined;
  const effectiveArguments = [...(constructor.boundArguments ?? []), ...argumentsValues];
  const proxied = effectiveArguments[0] ?? unknown();
  let handler = effectiveArguments[1] ?? unknown();
  const handlerNode = node.arguments?.[1];
  if (isSafeProxyHandlerNode(handlerNode, evaluate)) handler = safe();
  const joined = join(proxied, handler), result = tagged(joined,
    proxied.target ?? handler.target ?? (rank(joined) === SAFE ? undefined : "intrinsic:Proxy"));
  return markUse ? mark({ imported: Boolean(result.target), target: result.target }, result, node) : result;
}

export function evaluatePlaywrightReflectInvocation({ applyCallWrites, callee, evaluate, mark, node }) {
  if (callee.target === "global:Proxy.bind" && node.arguments.length >= 1) {
    const bound = tagged(safe(), "global:Proxy");
    bound.boundArguments = node.arguments.slice(1).map((argument) => evaluate(argument, false));
    if (node.arguments[2] && isSafeProxyHandlerNode(node.arguments[2], evaluate)) bound.boundArguments[1] = safe();
    return bound;
  }
  if (callee.target === "global:Proxy.revocable") {
    const target = evaluate(node.arguments[0], false), handler = node.arguments[1] ? evaluate(node.arguments[1], false) : unknown();
    const result = value(SAFE, SAFE, new Map(), true);
    const joined = join(target, handler);
    result.members.set("proxy", tagged(joined, target.target ?? handler.target ??
      (rank(joined) === SAFE ? undefined : "intrinsic:Proxy"))); result.members.set("revoke", safe());
    return result;
  }
  const method = callee.target?.startsWith("global:Reflect.") ? callee.target.slice("global:Reflect.".length) : undefined;
  if (!method) return undefined;
  if (method === "get" && node.arguments.length >= 2) {
    const target = evaluate(node.arguments[0], false), keyNode = unwrap(node.arguments[1]);
    const key = ts.isStringLiteralLike(keyNode) || ts.isNumericLiteral(keyNode) ? keyNode.text : undefined;
    const result = member(target, key);
    return rank(result) === SAFE ? result : mark({ imported: Boolean(result.target), target: result.target }, result, node);
  }
  if (method !== "apply" || node.arguments.length < 3) return tagged(unknown(), "intrinsic:Reflect");
  const callable = evaluate(node.arguments[0], false), argumentList = evaluate(node.arguments[2], false);
  const callArguments = [...argumentList.members].filter(([key]) => /^\d+$/u.test(key))
    .sort(([left], [right]) => Number(left) - Number(right)).map(([, item]) => item);
  const state = Math.max(callable.call, applyCallWrites(callable, callArguments));
  if (state !== SAFE) mark({ imported: Boolean(callable.target), target: callable.target }, callable, node.arguments[0]);
  const returned = callable.returnValue ? substitute(callable.returnValue, callArguments) : safe();
  return state === AUTHORITY ? authority() : state === UNKNOWN ? unknown() : returned;
}

export function evaluatePlaywrightProvenanceCall({ applyCallWrites, evaluate, mark, markUse, node, trustedFacadePath }) {
  const callee = evaluate(node.expression, false);
  if (hasPlaywrightProvenanceExecutionAuthority(callee)) {
    mark({ imported: Boolean(callee.target), target: callee.target }, callee, node.expression);
  }
  let state = callee.call;
  const argumentsValues = node.arguments.map((argument) => evaluate(argument, callee.forwardArgs || callee.call !== SAFE));
  const argumentExecution = Math.max(SAFE, ...argumentsValues.map((argument, index) => {
    const expression = unwrap(node.arguments[index]);
    return ts.isCallExpression(expression) || ts.isTaggedTemplateExpression(expression)
      ? argument.executionEffect ?? SAFE : SAFE;
  }));
  state = Math.max(state, argumentExecution, applyCallWrites(callee, argumentsValues));
  if (callee.returnValue) {
    const substituted = substitute(callee.returnValue, argumentsValues);
    const returned = tagged({ ...substituted,
      executionEffect: Math.max(callee.executionEffect ?? SAFE, state) }, callee.target);
    if (callee.target === trustedFacadePath) returned.target = trustedFacadePath;
    return markUse ? mark({ imported: Boolean(returned.target), target: returned.target }, returned, node) : returned;
  }
  if (callee.parameterIndex !== undefined) {
    const result = value(SAFE, SAFE, new Map(), true, callee.target, false, undefined, undefined,
      callee.parameterIndex, [...callee.parameterPath, "$call"]);
    result.invokedParameters = [{ argumentsValues, parameterIndex: callee.parameterIndex, parameterPath: callee.parameterPath }];
    return result;
  }
  const result = state === UNKNOWN ? unknown() : state === AUTHORITY ? authority() : safe();
  result.executionEffect = Math.max(callee.executionEffect ?? SAFE, state);
  const returned = tagged(result, callee.target);
  return markUse ? mark({ imported: Boolean(returned.target), target: returned.target }, returned, node) : returned;
}
