export function createToolcraftDomContainerErasureEvidence({
  checker,
  erase,
  ts,
  unwrap,
}) {
  function genericContainer(typeNode) {
    let node = typeNode;
    while (node && ts.isParenthesizedTypeNode(node)) node = node.type;
    if (!node || !ts.isTypeReferenceNode(node) ||
      !ts.isIdentifier(node.typeName)) return undefined;
    if (node.typeName.text === "Record" && node.typeArguments?.[1]) {
      return { kind: "record", value: node.typeArguments[1] };
    }
    if (["Array", "ReadonlyArray"].includes(node.typeName.text) &&
      node.typeArguments?.[0]) {
      return { kind: "array", value: node.typeArguments[0] };
    }
    return undefined;
  }

  function inspect(source, typeNode, depth = 0) {
    const container = genericContainer(typeNode);
    const node = unwrap(source);
    if (!container) return false;
    const targetType = checker.getTypeFromTypeNode(container.value);
    if (container.kind === "record" && ts.isObjectLiteralExpression(node)) {
      return node.properties.some((property) => {
        if (ts.isSpreadAssignment(property)) {
          return inspect(property.expression, typeNode, depth + 1);
        }
        const nested = ts.isPropertyAssignment(property)
          ? property.initializer
          : ts.isShorthandPropertyAssignment(property) ? property.name : undefined;
        return nested && erase(nested, targetType, depth + 1);
      });
    }
    if (container.kind === "array" && ts.isArrayLiteralExpression(node)) {
      return node.elements.some((element) => ts.isSpreadElement(element)
        ? inspect(element.expression, typeNode, depth + 1)
        : erase(element, targetType, depth + 1));
    }
    return false;
  }

  return inspect;
}

export function createToolcraftDomIterationTypeEvidence({ checker, reader, ts }) {
  const boundedReader = reader ?? createToolcraftDomBoundedTypeReader({
    checker, ts,
  });
  function referenceTypeArguments(type) {
    const result = boundedReader.typeArgumentsOf(type, "source");
    return result.kind === "exact" ? result.values : [];
  }

  function iterableElementType(expression) {
    const type = checker.getTypeAtLocation(expression);
    return checker.getIndexTypeOfType(type, ts.IndexKind.Number) ??
      referenceTypeArguments(type)[0];
  }

  function forOfTarget(statement) {
    if (!ts.isVariableDeclarationList(statement.initializer)) {
      return checker.getTypeAtLocation(statement.initializer);
    }
    const declaration = statement.initializer.declarations[0];
    return declaration?.type
      ? checker.getTypeFromTypeNode(declaration.type)
      : declaration && checker.getTypeAtLocation(declaration.name);
  }

  return Object.freeze({ forOfTarget, iterableElementType,
    referenceTypeArguments });
}
import { createToolcraftDomBoundedTypeReader } from
  "./toolcraft-dom-bounded-type-reader.mjs";
