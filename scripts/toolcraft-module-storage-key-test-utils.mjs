import ts from "typescript";

import {
  isToolcraftModulePropertyAccessNamed as isPropertyAccessNamed,
  unwrapToolcraftModuleNode as unwrap,
} from "./toolcraft-module-ast-test-utils.mjs";

function collectLocalBindings(sourceFile) {
  const functions = new Map();
  const initializers = new Map();
  const visit = (node) => {
    if (ts.isFunctionDeclaration(node) && node.name && node.body) {
      functions.set(node.name.text, node);
    }
    if (
      ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) &&
      node.initializer
    ) {
      initializers.set(node.name.text, node.initializer);
      const value = unwrap(node.initializer);
      if (ts.isArrowFunction(value) || ts.isFunctionExpression(value)) {
        functions.set(node.name.text, value);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return { functions, initializers };
}

function returnExpressions(fn) {
  if (ts.isArrowFunction(fn) && !ts.isBlock(fn.body)) return [fn.body];
  const expressions = [];
  const visit = (node) => {
    if (node !== fn && ts.isFunctionLike(node)) return;
    if (ts.isReturnStatement(node) && node.expression) {
      expressions.push(node.expression);
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(fn.body);
  return expressions;
}

function lineageKey(lineage) {
  return `${lineage.root}\0${lineage.derived ? "derived" : "direct"}`;
}

function uniqueLineages(lineages) {
  return [...new Map(lineages.map((lineage) => [lineageKey(lineage), lineage])).values()];
}

function resolveKeyLineages(
  node,
  bindings,
  resolveStaticString,
  parameters = new Map(),
  seen = new Set(),
) {
  const value = unwrap(node);
  if (!value || seen.has(value)) return [];
  const staticValue = resolveStaticString(value);
  if (staticValue !== undefined) {
    return [{ derived: false, root: `literal:${staticValue}` }];
  }
  if (ts.isIdentifier(value)) {
    const parameter = parameters.get(value.text);
    if (parameter) return parameter;
    const initializer = bindings.initializers.get(value.text);
    if (!initializer) return [{ derived: false, root: `identifier:${value.text}` }];
    seen.add(value);
    return resolveKeyLineages(
      initializer,
      bindings,
      resolveStaticString,
      parameters,
      seen,
    );
  }
  if (
    ts.isCallExpression(value) && ts.isPropertyAccessExpression(value.expression) &&
    ["replace", "slice", "substring"].includes(value.expression.name.text)
  ) {
    return resolveKeyLineages(
      value.expression.expression,
      bindings,
      resolveStaticString,
      parameters,
      seen,
    ).map((lineage) => ({ ...lineage, derived: true }));
  }
  if (ts.isCallExpression(value) && ts.isIdentifier(value.expression)) {
    const fn = bindings.functions.get(value.expression.text);
    if (!fn || seen.has(fn)) return [];
    seen.add(fn);
    const callParameters = new Map(parameters);
    fn.parameters.forEach((parameter, index) => {
      if (!ts.isIdentifier(parameter.name) || !value.arguments[index]) return;
      callParameters.set(
        parameter.name.text,
        resolveKeyLineages(
          value.arguments[index],
          bindings,
          resolveStaticString,
          parameters,
          new Set(seen),
        ),
      );
    });
    return uniqueLineages(returnExpressions(fn).flatMap((expression) =>
      resolveKeyLineages(
        expression,
        bindings,
        resolveStaticString,
        callParameters,
        new Set(seen),
      )
    ));
  }
  if (
    ts.isBinaryExpression(value) &&
    value.operatorToken.kind === ts.SyntaxKind.PlusToken
  ) {
    const operands = [value.left, value.right].flatMap((operand) =>
      resolveKeyLineages(
        operand,
        bindings,
        resolveStaticString,
        parameters,
        new Set(seen),
      )
    );
    const dynamic = operands.filter(({ root }) => !root.startsWith("literal:"));
    return uniqueLineages(dynamic.map((lineage) => ({ ...lineage, derived: true })));
  }
  if (ts.isTemplateExpression(value)) {
    return uniqueLineages(value.templateSpans.flatMap((span) =>
      resolveKeyLineages(
        span.expression,
        bindings,
        resolveStaticString,
        parameters,
        new Set(seen),
      ).map((lineage) => ({ ...lineage, derived: true }))
    ));
  }
  return [];
}

export function hasToolcraftAlternateStorageKeyFlow(
  sourceFile,
  resolveStaticString,
) {
  const bindings = collectLocalBindings(sourceFile);
  const operations = new Map();
  const visit = (node) => {
    if (
      ts.isCallExpression(node) && node.arguments[0]
    ) {
      const method = ["getItem", "removeItem"].find((candidate) =>
        isPropertyAccessNamed(node.expression, candidate, resolveStaticString),
      );
      if (method) {
        for (const lineage of resolveKeyLineages(
          node.arguments[0],
          bindings,
          resolveStaticString,
        )) {
          const key = `${method}\0${lineage.root}`;
          const flags = operations.get(key) ?? new Set();
          flags.add(lineage.derived ? "derived" : "direct");
          operations.set(key, flags);
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return [...operations.values()].some((flags) =>
    flags.has("direct") && flags.has("derived"),
  );
}
