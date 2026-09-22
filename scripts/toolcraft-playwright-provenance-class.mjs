import ts from "typescript";
import { interpretPlaywrightProvenanceMutation } from "./toolcraft-playwright-provenance-mutation.mjs";

import {
  SAFE,
  joinProvenance as join,
  poisonProvenance as poison,
  propertyKey,
  provenanceValue as value,
  safeProvenance as safe,
} from "./toolcraft-playwright-provenance-value.mjs";

export function evaluatePlaywrightProvenanceClass({ bind, env, evaluate, mutate, node }) {
  const result = value(SAFE, SAFE, new Map(), true);
  const instance = value(SAFE, SAFE, new Map(), true);
  for (const heritage of node.heritageClauses ?? []) for (const typeNode of heritage.types) {
    const base = evaluate(typeNode.expression);
    if (base.instance) {
      const inherited = join(instance, base.instance);
      instance.state = inherited.state;
      instance.call = inherited.call;
      instance.closed = inherited.closed;
      for (const [key, item] of inherited.members) instance.members.set(key, item);
    } else poison(instance);
  }
  for (const element of node.members) {
    const destination = element.modifiers?.some(({ kind }) =>
      kind === ts.SyntaxKind.StaticKeyword) ? result : instance;
    if (ts.isConstructorDeclaration(element)) {
      analyzeConstructor({ bind, element, env, evaluate, instance, mutate });
      continue;
    }
    const key = propertyKey(element.name);
    if (key === undefined) return poisonAndReturn(instance, result);
    if (ts.isPropertyDeclaration(element)) {
      destination.members.set(key, element.initializer ? evaluate(element.initializer) : poisonAndReturn(destination, safe()));
    } else if (ts.isMethodDeclaration(element) || ts.isGetAccessorDeclaration(element)) {
      destination.members.set(key, evaluate(element));
    } else return poisonAndReturn(instance, result);
  }
  result.instance = instance;
  return result;
}

function poisonAndReturn(target, returned) {
  poison(target);
  return returned;
}

function analyzeConstructor({ bind, element, env, evaluate, instance, mutate }) {
  const previousThis = env.get("$this");
  env.set("$this", { imported: false, item: instance });
  const previousParameters = new Map();
  element.parameters.forEach((parameter, index) => {
    if (!ts.isIdentifier(parameter.name)) { poison(instance); return; }
    previousParameters.set(parameter.name.text, env.get(parameter.name.text));
    const parameterValue = { ...safe(), parameterIndex: index };
    bind(parameter.name, parameterValue);
    if (parameter.modifiers?.length) instance.members.set(parameter.name.text, parameterValue);
  });
  for (const statement of element.body?.statements ?? []) {
    if (ts.isReturnStatement(statement)) {
      if (statement.expression && statement.expression.kind !== ts.SyntaxKind.ThisKeyword) poison(instance);
      continue;
    }
    if (!ts.isExpressionStatement(statement)) { poison(instance); continue; }
    const mutation = interpretPlaywrightProvenanceMutation({ bind, env, evaluate, input: statement.expression, mutate });
    if (mutation.handled) continue;
    poison(instance);
  }
  if (previousThis) env.set("$this", previousThis); else env.delete("$this");
  for (const [name, previous] of previousParameters) {
    if (previous) env.set(name, previous); else env.delete(name);
  }
}
