export function createToolcraftDomSourceDangerEvidence({
  checker,
  maxDepth,
  ts,
  typeEvidence,
  unwrap,
}) {
  function declarationInitializers(identifier) {
    if (!ts.isIdentifier(identifier)) return [];
    return (checker.getSymbolAtLocation(identifier)?.declarations ?? [])
      .flatMap((declaration) => {
        if ((ts.isVariableDeclaration(declaration) ||
          ts.isPropertyDeclaration(declaration) ||
          ts.isParameter(declaration)) && declaration.initializer) {
          return [declaration.initializer];
        }
        return [];
      });
  }

  function containsProvenDom(expression, visited = new Set(), depth = 0) {
    const current = unwrap(expression);
    if (visited.has(current)) return false;
    const currentType = checker.getTypeAtLocation(current);
    const symbol = currentType.aliasSymbol ?? currentType.symbol;
    if ((symbol?.flags & (
      ts.SymbolFlags.NamespaceModule | ts.SymbolFlags.ValueModule
    )) !== 0) return false;
    if (typeEvidence(currentType) === "dom") return true;
    if (depth >= maxDepth) return false;
    const nextVisited = new Set(visited).add(current);
    if (declarationInitializers(current).some((initializer) =>
      containsProvenDom(initializer, nextVisited, depth + 1)
    )) return true;
    const nested = ts.isCallExpression(current) || ts.isNewExpression(current)
      ? [...(current.arguments ?? [])]
      : ts.isConditionalExpression(current)
        ? [current.whenTrue, current.whenFalse]
        : ts.isBinaryExpression(current)
          ? [current.left, current.right]
          : ts.isArrayLiteralExpression(current)
            ? [...current.elements]
            : ts.isObjectLiteralExpression(current)
              ? current.properties.flatMap((property) =>
                ts.isSpreadAssignment(property)
                  ? [property.expression]
                  : ts.isPropertyAssignment(property)
                    ? [property.initializer]
                    : ts.isShorthandPropertyAssignment(property)
                      ? [property.name] : []
              )
              : ts.isSpreadElement(current) ? [current.expression] : [];
    return nested.some((child) =>
      containsProvenDom(child, nextVisited, depth + 1)
    );
  }

  return Object.freeze({ containsProvenDom, declarationInitializers });
}
