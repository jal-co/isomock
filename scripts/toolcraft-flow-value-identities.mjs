import { exact } from "./toolcraft-flow-facts.mjs";
import { toolcraftFlowTypeCategory } from "./toolcraft-flow-value-categories.mjs";
function bindingNameContains(name, expected, ts) {
  if (ts.isIdentifier(name)) return name.text === expected;
  return (name.elements ?? []).some((element) =>
    element.name && bindingNameContains(element.name, expected, ts));
}
function statementDeclares(statement, expected, ts) {
  if (ts.isVariableStatement(statement)) return statement.declarationList.declarations
    .some(({ name }) => bindingNameContains(name, expected, ts));
  if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement) ||
    ts.isEnumDeclaration(statement) || ts.isImportEqualsDeclaration(statement)) &&
    statement.name?.text === expected) return true;
  if (!ts.isImportDeclaration(statement) || !statement.importClause) return false;
  const { name, namedBindings } = statement.importClause;
  return name?.text === expected || Boolean(namedBindings) && (
    ts.isNamespaceImport(namedBindings) && namedBindings.name.text === expected ||
    ts.isNamedImports(namedBindings) && namedBindings.elements.some(
      (element) => element.name.text === expected));
}
function sourceDeclares(node, expected, ts) {
  for (let scope = node.parent; scope; scope = scope.parent) {
    if ((ts.isSourceFile(scope) || ts.isBlock(scope) || ts.isModuleBlock(scope)) &&
      scope.statements.some((statement) => statementDeclares(statement, expected, ts))) {
      return true;
    }
    if (ts.isFunctionLike(scope) && scope.parameters.some(({ name }) =>
      bindingNameContains(name, expected, ts))) return true;
    if (ts.isCatchClause(scope) && scope.variableDeclaration &&
      bindingNameContains(scope.variableDeclaration.name, expected, ts)) return true;
    if ((ts.isForStatement(scope) || ts.isForInStatement(scope) ||
      ts.isForOfStatement(scope)) && ts.isVariableDeclarationList(scope.initializer) &&
      scope.initializer.declarations.some(({ name }) =>
        bindingNameContains(name, expected, ts))) return true;
  }
  return false;
}
function ambientBinding(checker, node, ts) {
  const declarations = checker?.getSymbolAtLocation(node)?.declarations ?? [];
  return declarations.length > 0 ? declarations.every((declaration) =>
    declaration.getSourceFile().isDeclarationFile)
    : !sourceDeclares(node, node.text, ts);
}
function globalProperty(checker, node, name, ts) {
  return ts.isPropertyAccessExpression(node) &&
    ts.isIdentifier(node.expression) && node.expression.text === "globalThis" &&
    ambientBinding(checker, node.expression, ts) && node.name.text === name;
}
function relationFromIdentities(left, right, identityOf) {
  const leftValues = left?.kind === "exact" ? left.values : [];
  const rightValues = right?.kind === "exact" ? right.values : [];
  if (leftValues.length === 0 || rightValues.length === 0) {
    return Object.freeze({ equal: Object.freeze([]),
      unequal: Object.freeze([]), uncertain: Object.freeze([{ leftFact: left,
        rightFact: right }]) });
  }
  const leftGroups = new Map();
  const rightGroups = new Map();
  for (const value of leftValues) {
    const key = identityOf(value);
    if (key === undefined) continue;
    leftGroups.set(key, [...leftGroups.get(key) ?? [], value]);
  }
  for (const value of rightValues) {
    const key = identityOf(value);
    if (key === undefined) continue;
    rightGroups.set(key, [...rightGroups.get(key) ?? [], value]);
  }
  const orderedLeft = [...leftGroups].sort(([leftKey], [rightKey]) =>
    String(leftKey).localeCompare(String(rightKey)));
  const orderedRight = [...rightGroups].sort(([leftKey], [rightKey]) =>
    String(leftKey).localeCompare(String(rightKey)));
  const equal = [];
  for (const [key, values] of orderedLeft) {
    const matches = rightGroups.get(key);
    if (matches) equal.push(Object.freeze({ identity: key,
      leftFact: exact(values), rightFact: exact(matches) }));
  }
  const unequal = orderedLeft.flatMap(([identity, values]) => {
    const mismatches = orderedRight.flatMap(([rightIdentity, rightValues]) =>
      rightIdentity === identity ? [] : rightValues);
    return mismatches.length === 0 ? [] : [Object.freeze({ identity,
      leftFact: exact(values), rightFact: exact(mismatches) })];
  });
  const unresolvedLeft = leftValues.filter((value) => identityOf(value) === undefined);
  const unresolvedRight = rightValues.filter((value) => identityOf(value) === undefined);
  const uncertain = unresolvedLeft.length > 0 || unresolvedRight.length > 0
    ? [Object.freeze({ leftFact: unresolvedLeft.length > 0 ? exact(unresolvedLeft) : left,
        rightFact: unresolvedRight.length > 0 ? exact(unresolvedRight) : right })]
    : [];
  return Object.freeze({ equal: Object.freeze(equal),
    unequal: Object.freeze(unequal), uncertain: Object.freeze(uncertain) });
}
export function sameValueRelation(left, right, options = {}) {
  return relationFromIdentities(left, right, options.identityOf ?? ((value) => value));
}
export function createToolcraftFlowValueIdentities({ checker, index,
  isReferenceIdentity, propertyKeys, ts }) {
  const references = new WeakMap();
  let nextReference = 0;

  function referenceIdentity(node) {
    let identity = references.get(node);
    if (!identity) {
      identity = `reference:${nextReference += 1}`;
      references.set(node, identity);
    }
    return identity;
  }

  function intrinsicName(node, name) {
    return ts.isIdentifier(node) && node.text === name &&
      ambientBinding(checker, node, ts) || globalProperty(checker, node, name, ts);
  }

  function primitiveIdentity(value) {
    const node = index.unwrap(value);
    if (ts.isParenthesizedExpression(node)) return primitiveIdentity(node.expression);
    if (ts.isBigIntLiteral(node)) {
      try { return `bigint:${BigInt(node.text.slice(0, -1)).toString()}`; }
      catch { return undefined; }
    }
    if (ts.isNumericLiteral(node)) {
      const number = Number(node.text);
      return `number:${Object.is(number, -0) ? "-0" : number === 0 ? "+0" : number}`;
    }
    if (ts.isVoidExpression(node)) return "undefined";
    if (ts.isPrefixUnaryExpression(node) && [ts.SyntaxKind.MinusToken,
      ts.SyntaxKind.PlusToken].includes(node.operator)) {
      const operand = index.unwrap(node.operand);
      if (ts.isBigIntLiteral(operand) &&
        node.operator === ts.SyntaxKind.MinusToken) {
        try { return `bigint:${(-BigInt(operand.text.slice(0, -1))).toString()}`; }
        catch {}
      }
      if (ts.isNumericLiteral(operand)) {
        const sign = node.operator === ts.SyntaxKind.MinusToken ? -1 : 1;
        const number = sign * Number(operand.text);
        return `number:${Object.is(number, -0) ? "-0" : number === 0 ? "+0" : number}`;
      }
      if (intrinsicName(operand, "Infinity")) return node.operator ===
        ts.SyntaxKind.MinusToken ? "number:-Infinity" : "number:Infinity";
      if (intrinsicName(operand, "NaN")) return "number:NaN";
    }
    if (ts.isPrefixUnaryExpression(node) &&
      node.operator === ts.SyntaxKind.TildeToken) {
      const operand = index.unwrap(node.operand);
      if (ts.isNumericLiteral(operand)) return `number:${~Number(operand.text)}`;
      if (ts.isBigIntLiteral(operand)) {
        try { return `bigint:${(~BigInt(operand.text.slice(0, -1))).toString()}`; }
        catch {}
      }
    }
    if (intrinsicName(node, "Infinity")) return "number:Infinity";
    if (intrinsicName(node, "NaN")) return "number:NaN";
    if (ts.isStringLiteralLike(node)) return `string:${node.text.length}:${node.text}`;
    if (node.kind === ts.SyntaxKind.TrueKeyword) return "boolean:true";
    if (node.kind === ts.SyntaxKind.FalseKeyword) return "boolean:false";
    if (node.kind === ts.SyntaxKind.NullKeyword) return "null";
    if (intrinsicName(node, "undefined")) return "undefined";
    const propertyKey = propertyKeys?.fromFact?.(exact([value]))?.alternatives?.[0];
    if (propertyKey?.kind === "symbol") return `symbol:${propertyKey.id}`;
  }

  function valueCategory(value) {
    const node = index.unwrap(value);
    if (primitiveIdentity(value) !== undefined) return "primitive";
    if (!node || typeof node !== "object") return "unknown";
    return isReferenceIdentity?.(node) ? "reference"
      : toolcraftFlowTypeCategory(checker?.getTypeAtLocation(node), ts);
  }
  function identityOf(value) {
    const primitive = primitiveIdentity(value);
    if (primitive !== undefined) return primitive;
    const node = index.unwrap(value);
    return valueCategory(value) === "reference" ? referenceIdentity(node) : undefined;
  }
  return Object.freeze({ identityOf, sameValueRelation: (left, right) =>
    relationFromIdentities(left, right, identityOf), valueCategory });
}
