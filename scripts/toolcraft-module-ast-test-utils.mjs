import ts from "typescript";

export function unwrapToolcraftModuleNode(node) {
  let current = node;
  while (
    current &&
    (ts.isAwaitExpression(current) ||
      ts.isParenthesizedExpression(current) ||
      ts.isAsExpression(current) ||
      ts.isTypeAssertionExpression(current) ||
      ts.isSatisfiesExpression(current) ||
      ts.isNonNullExpression(current))
  ) current = current.expression;
  return current;
}

export function getToolcraftModulePropertyName(node, resolveStaticString) {
  if (!node.name) return undefined;
  if (
    ts.isIdentifier(node.name) || ts.isStringLiteralLike(node.name) ||
    ts.isNumericLiteral(node.name)
  ) return node.name.text;
  return ts.isComputedPropertyName(node.name)
    ? resolveStaticString(node.name.expression)
    : undefined;
}

export function getToolcraftModulePropertyValue(property) {
  if (!property) return undefined;
  if (ts.isPropertyAssignment(property)) return property.initializer;
  if (ts.isShorthandPropertyAssignment(property)) return property.name;
  if (ts.isPropertySignature(property) || ts.isPropertyDeclaration(property)) {
    return property.type ?? property.initializer;
  }
  return undefined;
}

export function getToolcraftModuleRecordProperties(node, resolveStaticString) {
  const members = ts.isInterfaceDeclaration(node) || ts.isTypeLiteralNode(node)
    ? [...node.members]
    : ts.isObjectLiteralExpression(node)
      ? [...node.properties]
      : [];
  return new Map(members.flatMap((member) => {
    const name = getToolcraftModulePropertyName(member, resolveStaticString);
    return name ? [[name, member]] : [];
  }));
}

export function getToolcraftModuleStaticValues(node, resolveStaticString) {
  if (!node) return [];
  const value = unwrapToolcraftModuleNode(node);
  if (ts.isUnionTypeNode(value)) {
    return value.types.flatMap((item) =>
      getToolcraftModuleStaticValues(item, resolveStaticString),
    );
  }
  if (ts.isLiteralTypeNode(value)) {
    return getToolcraftModuleStaticValues(value.literal, resolveStaticString);
  }
  if (ts.isNumericLiteral(value)) return [value.text];
  const resolved = resolveStaticString(value);
  return resolved === undefined ? [] : [resolved];
}

export function isToolcraftModulePropertyAccessNamed(
  node,
  name,
  resolveStaticString,
) {
  const value = unwrapToolcraftModuleNode(node);
  return (ts.isPropertyAccessExpression(value) && value.name.text === name) ||
    (ts.isElementAccessExpression(value) && value.argumentExpression &&
      getToolcraftModuleStaticValues(
        value.argumentExpression,
        resolveStaticString,
      ).includes(name));
}
