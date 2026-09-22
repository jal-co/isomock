import ts from "typescript";

import { createToolcraftTypeScriptChecker } from "./toolcraft-typescript-analysis.mjs";

const mutatingArrayMethods = new Set([
  "copyWithin",
  "fill",
  "pop",
  "push",
  "reverse",
  "shift",
  "sort",
  "splice",
  "unshift",
]);
const readOnlyArrayMethods = new Set([
  "at",
  "entries",
  "includes",
  "indexOf",
  "join",
  "keys",
  "lastIndexOf",
  "slice",
  "toReversed",
  "toSpliced",
  "toString",
  "values",
  "with",
]);

function isConstVariableDeclaration(node) {
  return (
    ts.isVariableDeclaration(node) &&
    ts.isVariableDeclarationList(node.parent) &&
    (node.parent.flags & ts.NodeFlags.Const) !== 0 &&
    ts.isIdentifier(node.name) &&
    node.initializer
  );
}

export function createToolcraftStaticStringResolver(
  sourceFile,
  checker = createToolcraftTypeScriptChecker(sourceFile, ts),
) {

  function isTransparentExpression(node) {
    return (
      ts.isParenthesizedExpression(node) ||
      ts.isAsExpression(node) ||
      ts.isTypeAssertionExpression(node) ||
      ts.isSatisfiesExpression(node) ||
      ts.isNonNullExpression(node)
    );
  }

  function unwrapStaticExpression(node) {
    let current = node;
    while (isTransparentExpression(current)) {
      current = current.expression;
    }
    return current;
  }

  function getConstDeclaration(node) {
    return checker
      .getSymbolAtLocation(node)
      ?.declarations?.find(isConstVariableDeclaration);
  }

  function getReferenceSymbol(node) {
    return ts.isShorthandPropertyAssignment(node.parent)
      ? checker.getShorthandAssignmentValueSymbol(node.parent)
      : checker.getSymbolAtLocation(node);
  }

  function getStaticMemberAccess(node) {
    const value = unwrapStaticExpression(node);
    if (ts.isPropertyAccessExpression(value)) {
      return { member: value.name.text, node: value };
    }
    if (!ts.isElementAccessExpression(value) || !value.argumentExpression) {
      return undefined;
    }
    const argument = unwrapStaticExpression(value.argumentExpression);
    return ts.isStringLiteralLike(argument) ||
      ts.isNoSubstitutionTemplateLiteral(argument)
      ? { member: argument.text, node: value }
      : undefined;
  }

  function isAssignmentOperator(kind) {
    return (
      kind >= ts.SyntaxKind.FirstAssignment &&
      kind <= ts.SyntaxKind.LastAssignment
    );
  }

  function isUnsafeArrayReference(reference) {
    let usage = reference;
    while (
      usage.parent &&
      isTransparentExpression(usage.parent) &&
      usage.parent.expression === usage
    ) {
      usage = usage.parent;
    }
    const member = unwrapStaticExpression(usage.parent);
    if (
      (ts.isPropertyAccessExpression(member) ||
        ts.isElementAccessExpression(member)) &&
      member.expression === usage
    ) {
      const memberAccess = getStaticMemberAccess(member);
      const parent = member.parent;
      if (
        ts.isCallExpression(parent) &&
        parent.expression === member
      ) {
        return (
          !memberAccess ||
          mutatingArrayMethods.has(memberAccess.member) ||
          !readOnlyArrayMethods.has(memberAccess.member)
        );
      }
      return (
        (ts.isBinaryExpression(parent) &&
          parent.left === member &&
          isAssignmentOperator(parent.operatorToken.kind)) ||
        ((ts.isPrefixUnaryExpression(parent) ||
          ts.isPostfixUnaryExpression(parent)) &&
          parent.operand === member) ||
        (ts.isDeleteExpression(parent) && parent.expression === member)
      );
    }
    const parent = usage.parent;
    if (!parent) return true;
    if (
      (ts.isVoidExpression(parent) ||
        ts.isTypeOfExpression(parent)) &&
      parent.expression === usage
    ) {
      return false;
    }
    if (
      ts.isExpressionStatement(parent) &&
      parent.expression === usage
    ) {
      return false;
    }
    if (
      ts.isBinaryExpression(parent) &&
      isAssignmentOperator(parent.operatorToken.kind) &&
      (parent.left === usage || parent.right === usage)
    ) {
      return true;
    }
    if (
      ((ts.isPrefixUnaryExpression(parent) ||
        ts.isPostfixUnaryExpression(parent)) &&
        parent.operand === usage) ||
      (ts.isDeleteExpression(parent) && parent.expression === usage)
    ) {
      return true;
    }
    return true;
  }

  function isArrayBindingSafeAt(declaration, evaluationNode) {
    const symbol = checker.getSymbolAtLocation(declaration.name);
    if (!symbol) return false;
    let safe = true;
    const evaluationOffset = evaluationNode.getStart(sourceFile);
    function visit(node) {
      if (!safe || node.getStart(sourceFile) >= evaluationOffset) return;
      if (
        ts.isIdentifier(node) &&
        node !== declaration.name &&
        getReferenceSymbol(node) === symbol
      ) {
        safe = !isUnsafeArrayReference(node);
      }
      ts.forEachChild(node, visit);
    }
    visit(sourceFile);
    return safe;
  }

  function resolveArray(node, resolvingDeclarations, evaluationNode) {
    const value = unwrapStaticExpression(node);
    if (ts.isArrayLiteralExpression(value)) {
      if (value.elements.some((element) => ts.isSpreadElement(element))) {
        return undefined;
      }
      const elements = value.elements.map((element) =>
        resolve(element, resolvingDeclarations),
      );
      return elements.some((element) => element === undefined)
        ? undefined
        : elements;
    }
    if (!ts.isIdentifier(value)) return undefined;
    const declaration = getConstDeclaration(value);
    if (
      !declaration ||
      resolvingDeclarations.has(declaration) ||
      !isArrayBindingSafeAt(declaration, evaluationNode)
    ) {
      return undefined;
    }
    resolvingDeclarations.add(declaration);
    const elements = resolveArray(
      declaration.initializer,
      resolvingDeclarations,
      evaluationNode,
    );
    resolvingDeclarations.delete(declaration);
    return elements;
  }

  function resolveConstantJoin(node, resolvingDeclarations) {
    const memberAccess = ts.isCallExpression(node)
      ? getStaticMemberAccess(node.expression)
      : undefined;
    if (
      !ts.isCallExpression(node) ||
      node.arguments.length > 1 ||
      memberAccess?.member !== "join"
    ) {
      return undefined;
    }
    const values = resolveArray(
      memberAccess.node.expression,
      resolvingDeclarations,
      node,
    );
    if (!values) return undefined;
    const delimiter = node.arguments.length === 0
      ? ","
      : resolve(node.arguments[0], resolvingDeclarations);
    if (delimiter === undefined) return undefined;
    return values.join(delimiter);
  }

  function resolve(node, resolvingDeclarations = new Set()) {
    const value = unwrapStaticExpression(node);
    if (value !== node) return resolve(value, resolvingDeclarations);
    if (ts.isStringLiteralLike(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      return node.text;
    }
    if (ts.isParenthesizedExpression(node)) {
      return resolve(node.expression, resolvingDeclarations);
    }
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.PlusToken
    ) {
      const left = resolve(node.left, resolvingDeclarations);
      const right = resolve(node.right, resolvingDeclarations);
      return left === undefined || right === undefined ? undefined : left + right;
    }

    if (ts.isTemplateExpression(node)) {
      let value = node.head.text;
      for (const span of node.templateSpans) {
        const expressionValue = resolve(span.expression, resolvingDeclarations);
        if (expressionValue === undefined) return undefined;
        value += expressionValue + span.literal.text;
      }
      return value;
    }

    const memberAccess = getStaticMemberAccess(node);
    if (memberAccess && ts.isIdentifier(memberAccess.node.expression)) {
      const declaration = getConstDeclaration(memberAccess.node.expression);
      const initializer = declaration && unwrapStaticExpression(declaration.initializer);
      if (declaration && ts.isObjectLiteralExpression(initializer) && !resolvingDeclarations.has(declaration)) {
        const property = initializer.properties.find((candidate) => {
          if (!ts.isPropertyAssignment(candidate) && !ts.isShorthandPropertyAssignment(candidate)) return false;
          const name = unwrapStaticExpression(candidate.name);
          return (ts.isIdentifier(name) || ts.isStringLiteralLike(name) || ts.isNumericLiteral(name)) && name.text === memberAccess.member;
        });
        if (property) {
          resolvingDeclarations.add(declaration);
          const resolved = ts.isShorthandPropertyAssignment(property)
            ? resolve(property.name, resolvingDeclarations) : resolve(property.initializer, resolvingDeclarations);
          resolvingDeclarations.delete(declaration);
          return resolved;
        }
      }
    }

    if (ts.isIdentifier(node)) {
      const declaration = getConstDeclaration(node);
      if (!declaration || resolvingDeclarations.has(declaration)) return undefined;
      resolvingDeclarations.add(declaration);
      const value = resolve(declaration.initializer, resolvingDeclarations);
      resolvingDeclarations.delete(declaration);
      return value;
    }

    return resolveConstantJoin(node, resolvingDeclarations);
  }
  return resolve;
}
export function createToolcraftStaticStringSetResolver(sourceFile, checker = createToolcraftTypeScriptChecker(sourceFile, ts)) {
  const resolveString = createToolcraftStaticStringResolver(sourceFile, checker);
  const declarations = new Map();
  const index = (node) => { if (isConstVariableDeclaration(node)) declarations.set(node.name.text, node); ts.forEachChild(node, index); };
  index(sourceFile);
  const resolve = (input, seen = new Set()) => {
    let node = input;
    while (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isTypeAssertionExpression(node) || ts.isSatisfiesExpression(node) || ts.isNonNullExpression(node)) node = node.expression;
    if (ts.isConditionalExpression(node)) {
      const left = resolve(node.whenTrue, seen), right = resolve(node.whenFalse, seen);
      return left === undefined || right === undefined ? undefined : [...left, ...right];
    }
    if (ts.isArrayLiteralExpression(node)) {
      const parts = node.elements.map((element) => resolve(ts.isSpreadElement(element) ? element.expression : element, seen));
      return parts.some((part) => part === undefined) ? undefined : parts.flat();
    }
    if (ts.isIdentifier(node)) {
      const declaration = checker.getSymbolAtLocation(node)?.declarations?.find(isConstVariableDeclaration) ?? declarations.get(node.text);
      if (declaration && !seen.has(declaration)) return resolve(declaration.initializer, new Set([...seen, declaration]));
    }
    const value = resolveString(node);
    return value === undefined ? undefined : [value];
  };
  return resolve;
}
export function isToolcraftStringCompositionNode(node) {
  return (
    ts.isStringLiteralLike(node) ||
    ts.isNoSubstitutionTemplateLiteral(node) ||
    ts.isTemplateExpression(node) ||
    ts.isParenthesizedExpression(node) ||
    (ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.PlusToken)
  );
}
export function isNestedToolcraftStringComposition(node) {
  const parent = node.parent;
  return Boolean(
    parent &&
      (ts.isParenthesizedExpression(parent) ||
        ts.isTemplateSpan(parent) ||
        (ts.isBinaryExpression(parent) &&
          parent.operatorToken.kind === ts.SyntaxKind.PlusToken)),
  );
}
