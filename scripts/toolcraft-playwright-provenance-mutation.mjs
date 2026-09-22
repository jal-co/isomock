import ts from "typescript";

import {
  UNKNOWN,
  computedKey,
  getProvenanceAccessPath as accessPath,
  poisonProvenance as poison,
  readProvenanceMember as member,
  unknownProvenance as unknown,
  unwrapExpression as unwrap,
} from "./toolcraft-playwright-provenance-value.mjs";

export function interpretPlaywrightProvenanceMutation({
  bind, env, evaluate, input, mutate, recordWrite,
}) {
  const expression = unwrap(input);
  if (ts.isBinaryExpression(expression) &&
    expression.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
    expression.operatorToken.kind <= ts.SyntaxKind.LastAssignment) {
    const assigned = expression.operatorToken.kind === ts.SyntaxKind.EqualsToken
      ? evaluate(expression.right) : unknown();
    const path = accessPath(expression.left);
    recordWrite?.(path, assigned);
    if (ts.isIdentifier(expression.left)) bind(expression.left, assigned);
    else if (!mutate(expression.left, assigned)) poisonRoot(path, env);
    return { handled: true, value: assigned };
  }
  if ((ts.isPrefixUnaryExpression(expression) || ts.isPostfixUnaryExpression(expression)) &&
    ts.isIdentifier(expression.operand)) {
    const path = accessPath(expression.operand);
    recordWrite?.(path, unknown());
    bind(expression.operand, unknown());
    return { handled: true, value: unknown() };
  }
  if (!ts.isCallExpression(expression) || !ts.isPropertyAccessExpression(expression.expression)) {
    return { handled: false };
  }
  const owner = expression.expression.expression;
  const method = expression.expression.name.text;
  if (ts.isIdentifier(owner) && owner.text === "Object" && method === "assign" && expression.arguments.length >= 2) {
    const path = accessPath(expression.arguments[0]);
    const additions = expression.arguments.slice(1).map(evaluate);
    const target = resolveTarget(path, env);
    if (!target || additions.some((item) => item.state === UNKNOWN)) {
      recordWrite?.(path, unknown());
      poisonRoot(path, env);
    } else for (const addition of additions) for (const [key, item] of addition.members) {
      target.members.set(key, item);
      recordWrite?.({ ...path, keys: [...path.keys, key] }, item);
    }
    return { handled: true, value: target ?? unknown() };
  }
  if (ts.isIdentifier(owner) && owner.text === "Object" && method === "defineProperty" && expression.arguments.length === 3) {
    const path = accessPath(expression.arguments[0]);
    const key = computedKey(expression.arguments[1]);
    const descriptor = evaluate(expression.arguments[2]);
    const target = resolveTarget(path, env);
    const assigned = descriptorValue(descriptor);
    if (!target || key === undefined || assigned.state === UNKNOWN) {
      recordWrite?.(path, unknown());
      poisonRoot(path, env);
    } else {
      target.members.set(key, assigned);
      recordWrite?.({ ...path, keys: [...path.keys, key] }, assigned);
    }
    return { handled: true, value: target ?? unknown() };
  }
  if (ts.isIdentifier(owner) && owner.text === "Object" && method === "defineProperties" && expression.arguments.length === 2) {
    const path = accessPath(expression.arguments[0]);
    const descriptors = evaluate(expression.arguments[1]);
    const target = resolveTarget(path, env);
    if (!target || descriptors.state === UNKNOWN) {
      recordWrite?.(path, unknown()); poisonRoot(path, env);
    } else for (const [key, descriptor] of descriptors.members) {
      const assigned = descriptorValue(descriptor);
      target.members.set(key, assigned);
      recordWrite?.({ ...path, keys: [...path.keys, key] }, assigned);
    }
    return { handled: true, value: target ?? unknown() };
  }
  if (ts.isIdentifier(owner) && owner.text === "Reflect" && method === "set" && expression.arguments.length >= 3) {
    const path = accessPath(expression.arguments[0]);
    const key = computedKey(expression.arguments[1]);
    const target = resolveTarget(path, env);
    const assigned = evaluate(expression.arguments[2]);
    if (!target || key === undefined) { recordWrite?.(path, unknown()); poisonRoot(path, env); }
    else { target.members.set(key, assigned); recordWrite?.({ ...path, keys: [...path.keys, key] }, assigned); }
    return { handled: true, value: target ?? unknown() };
  }
  const targetPath = accessPath(owner);
  if (targetPath && ["push", "unshift", "splice", "set"].includes(method)) {
    recordWrite?.(targetPath, unknown());
    poisonRoot(targetPath, env);
    return { handled: true, value: unknown() };
  }
  return { handled: false };
}

function descriptorValue(descriptor) {
  if (descriptor.state === UNKNOWN || descriptor.members.has("get") || descriptor.members.has("set") || descriptor.members.has("*")) return unknown();
  return member(descriptor, "value");
}
function resolveTarget(path, env) {
  if (!path || path.keys.some((key) => key === undefined)) return undefined;
  let target = env.get(path.root)?.item;
  for (const key of path.keys) target = target?.members.get(key);
  return target;
}
function poisonRoot(path, env) {
  const root = path && env.get(path.root)?.item;
  if (root) poison(root);
}
