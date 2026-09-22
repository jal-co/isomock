import ts from "typescript";

import {
  getToolcraftModulePropertyName as propertyName,
  getToolcraftModulePropertyValue as propertyInitializer,
} from "./toolcraft-module-ast-test-utils.mjs";
import {
  createToolcraftProductConstructorInspector,
} from "./toolcraft-product-constructor-boundary.mjs";
import {
  parseToolcraftTypeScriptSource,
} from "./toolcraft-typescript-source-evidence.mjs";

const alternativeOperators = new Set([
  ts.SyntaxKind.AmpersandAmpersandToken,
  ts.SyntaxKind.BarBarToken,
  ts.SyntaxKind.QuestionQuestionToken,
]);
const maxAlternatives = 64;

export function collectToolcraftConstructorInitializers(sourceFile) {
  const result = new Map();
  const visit = (node) => {
    if (
      ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) &&
      node.initializer
    ) result.set(node.name.text, node.initializer);
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return result;
}

export function resolveToolcraftConstructorExpression(
  node,
  checker,
  initializers,
  seen = new Set(),
) {
  let current = node;
  let hadCast = false;
  while (current) {
    while (
      ts.isParenthesizedExpression(current) ||
      ts.isAsExpression(current) ||
      ts.isTypeAssertionExpression(current) ||
      ts.isSatisfiesExpression(current) ||
      ts.isNonNullExpression(current)
    ) {
      hadCast ||= ts.isAsExpression(current) || ts.isTypeAssertionExpression(current);
      current = current.expression;
    }
    if (!ts.isIdentifier(current)) return { hadCast, node: current };
    let declaration;
    if (checker) {
      let symbol = ts.isShorthandPropertyAssignment(current.parent)
        ? checker.getShorthandAssignmentValueSymbol(current.parent)
        : checker.getSymbolAtLocation(current);
      if (!symbol || seen.has(symbol)) return { hadCast, node: current };
      seen.add(symbol);
      if (symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
      declaration = symbol?.declarations?.find(
        (item) => ts.isVariableDeclaration(item) && item.initializer,
      )?.initializer;
    } else {
      if (seen.has(current.text)) return { hadCast, node: current };
      seen.add(current.text);
      declaration = initializers.get(current.text);
    }
    if (!declaration) return { hadCast, node: current };
    current = declaration;
  }
  return { hadCast, node: current };
}

export function collectToolcraftConstructorObjectProperties(
  node,
  checker,
  initializers,
  resolveStaticString,
  seen = new Set(),
) {
  const resolved = resolveToolcraftConstructorExpression(
    node,
    checker,
    initializers,
  ).node;
  if (!resolved || !ts.isObjectLiteralExpression(resolved) || seen.has(resolved)) {
    return undefined;
  }
  seen.add(resolved);
  const properties = new Map();
  for (const property of resolved.properties) {
    if (ts.isSpreadAssignment(property)) {
      const spread = collectToolcraftConstructorObjectProperties(
        property.expression,
        checker,
        initializers,
        resolveStaticString,
        seen,
      );
      if (!spread) properties.set("<dynamic>", property);
      else for (const [name, value] of spread) properties.set(name, value);
      continue;
    }
    properties.set(propertyName(property, resolveStaticString) ?? "<dynamic>", property);
  }
  return properties;
}

function resolveLocalFunctionReturn(call, checker) {
  if (!checker || !ts.isIdentifier(call.expression) || call.arguments.length > 0) {
    return undefined;
  }
  let symbol = checker.getSymbolAtLocation(call.expression);
  if (symbol?.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
  const declaration = symbol?.declarations?.find((item) =>
    (ts.isFunctionDeclaration(item) && Boolean(item.body)) ||
    (ts.isVariableDeclaration(item) && Boolean(item.initializer)),
  );
  let fn;
  if (declaration && ts.isFunctionDeclaration(declaration)) fn = declaration;
  if (declaration && ts.isVariableDeclaration(declaration)) {
    const initializer = declaration.initializer &&
      resolveToolcraftConstructorExpression(
        declaration.initializer,
        checker,
        new Map(),
      ).node;
    if (
      initializer &&
      (ts.isArrowFunction(initializer) || ts.isFunctionExpression(initializer))
    ) fn = initializer;
  }
  if (!fn || fn.parameters.length > 0 || !fn.body) return undefined;
  if (ts.isArrowFunction(fn) && !ts.isBlock(fn.body)) return fn.body;
  const returns = fn.body.statements.filter(ts.isReturnStatement)
    .flatMap((statement) => statement.expression ? [statement.expression] : []);
  return returns.length === 1 ? returns[0] : undefined;
}

function getAlternativeBranches(node) {
  if (ts.isConditionalExpression(node)) return [node.whenTrue, node.whenFalse];
  return ts.isBinaryExpression(node) && alternativeOperators.has(node.operatorToken.kind)
    ? [node.left, node.right]
    : undefined;
}

function opaqueAlternative() {
  return { opaque: true, text: "{}" };
}

function objectAlternative(properties, opaque = false) {
  return {
    objectProperties: properties,
    opaque,
    text: `{${[...properties].map(([name, value]) =>
      `${JSON.stringify(name)}:${value}`,
    ).join(",")}}`,
  };
}

function arrayAlternative(elements, opaque = false) {
  return {
    arrayElements: elements,
    opaque,
    text: `[${elements.join(",")}]`,
  };
}

function crossAlternatives(left, right, combine, createFallback) {
  if (left.length * right.length > maxAlternatives) {
    return [createFallback()];
  }
  return left.flatMap((leftValue) =>
    right.map((rightValue) => combine(leftValue, rightValue)),
  );
}

function createValueExpander({
  checker,
  initializers,
  resolveStaticString,
  sourceFile,
}) {
  const expandMember = (node, seen) => {
    const container = resolveToolcraftConstructorExpression(
      node.expression,
      checker,
      initializers,
    ).node;
    if (ts.isArrayLiteralExpression(container) && ts.isElementAccessExpression(node)) {
      const index = Number(
        ts.isNumericLiteral(node.argumentExpression)
          ? node.argumentExpression.text
          : resolveStaticString(node.argumentExpression),
      );
      return Number.isInteger(index) && container.elements[index]
        ? expand(container.elements[index], seen)
        : undefined;
    }
    if (!ts.isObjectLiteralExpression(container)) return undefined;
    const name = ts.isPropertyAccessExpression(node)
      ? node.name.text
      : resolveStaticString(node.argumentExpression);
    const property = container.properties.find((candidate) =>
      propertyName(candidate, resolveStaticString) === name,
    );
    const initializer = property && propertyInitializer(property);
    return initializer ? expand(initializer, seen) : undefined;
  };

  const expandObject = (object, seen) => {
    let alternatives = [objectAlternative(new Map())];
    for (const property of object.properties) {
      if (ts.isSpreadAssignment(property)) {
        const spreads = expand(property.expression, seen);
        alternatives = crossAlternatives(
          alternatives,
          spreads,
          (current, spread) => {
            if (!spread.objectProperties) {
              return objectAlternative(current.objectProperties, true);
            }
            return objectAlternative(
              new Map([...current.objectProperties, ...spread.objectProperties]),
              current.opaque || spread.opaque,
            );
          },
          () => objectAlternative(new Map(), true),
        );
        continue;
      }
      const name = propertyName(property, resolveStaticString);
      const initializer = propertyInitializer(property);
      if (!name || !initializer) {
        alternatives = alternatives.map(({ objectProperties }) =>
          objectAlternative(objectProperties, true),
        );
        continue;
      }
      alternatives = crossAlternatives(
        alternatives,
        expand(initializer, seen),
        (current, value) => objectAlternative(
          new Map([...current.objectProperties, [name, value.text]]),
          current.opaque || value.opaque,
        ),
        () => objectAlternative(new Map(), true),
      );
    }
    return alternatives;
  };

  const expandArray = (array, seen) => {
    let alternatives = [arrayAlternative([])];
    for (const element of array.elements) {
      const values = expand(
        ts.isSpreadElement(element) ? element.expression : element,
        seen,
      );
      alternatives = crossAlternatives(
        alternatives,
        values,
        (current, value) => {
          if (ts.isSpreadElement(element) && !value.arrayElements) {
            return arrayAlternative(current.arrayElements, true);
          }
          return arrayAlternative(
            [...current.arrayElements, ...(value.arrayElements ?? [value.text])],
            current.opaque || value.opaque,
          );
        },
        () => arrayAlternative([], true),
      );
    }
    return alternatives;
  };

  const expand = (node, seen = new Set()) => {
    const value = resolveToolcraftConstructorExpression(
      node,
      checker,
      initializers,
    ).node;
    if (!value || seen.has(value)) return [opaqueAlternative()];
    const nextSeen = new Set([...seen, value]);
    if (ts.isCallExpression(value)) {
      const returned = resolveLocalFunctionReturn(value, checker);
      return returned ? expand(returned, nextSeen) : [opaqueAlternative()];
    }
    const branches = getAlternativeBranches(value);
    if (branches) {
      const alternatives = branches.flatMap((branch) => expand(branch, nextSeen));
      return alternatives.length <= maxAlternatives
        ? alternatives
        : [opaqueAlternative()];
    }
    if (ts.isObjectLiteralExpression(value)) return expandObject(value, nextSeen);
    if (ts.isArrayLiteralExpression(value)) return expandArray(value, nextSeen);
    if (ts.isPropertyAccessExpression(value) || ts.isElementAccessExpression(value)) {
      const member = expandMember(value, nextSeen);
      if (member) return member;
    }
    const staticValue = resolveStaticString(value);
    if (staticValue !== undefined) {
      return [{ opaque: false, text: JSON.stringify(staticValue) }];
    }
    return ts.isIdentifier(value)
      ? [opaqueAlternative()]
      : [{ opaque: false, text: value.getText(sourceFile) }];
  };
  return expand;
}

export function collectToolcraftCanonicalDefinitionPolicyCodes({
  checker,
  initializers,
  properties,
  resolveStaticString,
  sourceFile,
}) {
  const expand = createValueExpander({
    checker,
    initializers,
    resolveStaticString,
    sourceFile,
  });
  const base = propertyInitializer(properties.get("base"));
  const modules = propertyInitializer(properties.get("modules"));
  const baseAlternatives = expand(base).map((alternative) =>
    alternative.objectProperties ? alternative : opaqueAlternative(),
  );
  const moduleValue = resolveToolcraftConstructorExpression(
    modules,
    checker,
    initializers,
  ).node;
  const renderedModules = moduleValue && ts.isArrayLiteralExpression(moduleValue)
    ? `[${moduleValue.elements.map((element) => {
        if (ts.isSpreadElement(element)) return `...${expand(element.expression)[0].text}`;
        const resolved = resolveToolcraftConstructorExpression(
          element,
          checker,
          initializers,
        ).node;
        return resolved && ts.isCallExpression(resolved)
          ? resolved.getText(sourceFile)
          : "{}";
      }).join(",")}]`
    : "[{}]";
  const parsed = parseToolcraftTypeScriptSource({
    absolutePath: "src/app/app-schema.ts",
    rawSource: `import { defineToolcraft } from "@/toolcraft/runtime";\n` +
      baseAlternatives.map(({ text }) =>
        `defineToolcraft({ base: ${text}, modules: ${renderedModules} });`,
      ).join("\n"),
  });
  if (!parsed) throw new Error("TypeScript compiler is required for module policy tests.");
  const { sourceFile: normalized } = parsed;
  const inspector = createToolcraftProductConstructorInspector({
    getNodeLocation: () => ({ column: 1, line: 1 }),
    repoPath: "src/app/app-schema.ts",
    sourceFile: normalized,
  });
  const codes = new Set();
  const visit = (node) => {
    for (const violation of inspector.inspectNode(node)) {
      if (
        violation.message.startsWith("Product base") ||
        violation.message.includes("canonical module factory")
      ) codes.add("module-owned-base-field");
      if (violation.message.includes("opaque factory definitions")) {
        codes.add("spread-module-clone");
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(normalized);
  if (baseAlternatives.some(({ opaque }) => opaque)) {
    codes.add("old-product-definition");
  }
  return codes;
}
