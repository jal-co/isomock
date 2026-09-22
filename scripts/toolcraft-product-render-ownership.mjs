import { getToolcraftPublicUiOwner } from "./toolcraft-public-ui-ownership.mjs";

// Resolve local render helpers across the shared TS Program. This concerns
// containment only; the canonical origin evaluator still owns component aliases.
export function createToolcraftProductRenderOwnership({ checker, hostConstruction, ts }) {
  function renderTargets(expression, visited = new Set()) {
    if (!expression || visited.has(expression) || visited.size > 32) return undefined;
    visited.add(expression);
    const value = hostConstruction.flowValues.unwrap(expression);
    const target = ts.isJsxElement(value)
      ? value.openingElement
      : ts.isJsxSelfClosingElement(value)
        ? value
        : undefined;
    if (target) {
      if (
        (ts.isIdentifier(target.tagName) && /^[a-z]/u.test(target.tagName.text)) ||
        hostConstruction.originOf(target.tagName).some(getToolcraftPublicUiOwner)
      )
        return [target];
      const implementation = renderTargets(target.tagName, visited);
      return implementation ? [target, ...implementation] : undefined;
    }
    if (ts.isConditionalExpression(value)) {
      const left = renderTargets(value.whenTrue, new Set(visited));
      const right = renderTargets(value.whenFalse, new Set(visited));
      return left && right ? [...left, ...right] : undefined;
    }
    if (ts.isFunctionLike(value) && value.body) {
      if (!ts.isBlock(value.body)) return renderTargets(value.body, visited);
      const returns = [];
      function visit(node) {
        if (ts.isFunctionLike(node)) return;
        if (ts.isReturnStatement(node))
          returns.push(renderTargets(node.expression, new Set(visited)));
        else ts.forEachChild(node, visit);
      }
      visit(value.body);
      return returns.length > 0 && returns.every(Boolean) ? returns.flat() : undefined;
    }
    if (ts.isIdentifier(value)) {
      let symbol = checker.getSymbolAtLocation(value);
      if (symbol?.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
      const declaration = symbol?.valueDeclaration;
      if (declaration && ts.isFunctionLike(declaration)) return renderTargets(declaration, visited);
      const fact = hostConstruction.flowValues.valueAt(value, value);
      if (fact.kind === "exact") {
        const targets = fact.values.map((item) => renderTargets(item, new Set(visited)));
        return targets.every(Boolean) ? targets.flat() : undefined;
      }
    }
    return undefined;
  }
  function containsPublic(node, visited) {
    if (!node || visited.has(node)) return false;
    if (visited.size > 2048) return true;
    visited.add(node);
    if (ts.isTypeNode(node)) return false;
    if (ts.isJsxAttribute(node) && !["render", "children"].includes(node.name.getText()))
      return false;
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      if (hostConstruction.originOf(node.tagName).some(getToolcraftPublicUiOwner)) return true;
      if (!ts.isIdentifier(node.tagName) || /^[A-Z]/u.test(node.tagName.text)) {
        let symbol = checker.getSymbolAtLocation(node.tagName);
        if (symbol?.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
        if (symbol?.declarations?.some((declaration) => containsPublic(declaration, visited)))
          return true;
      }
    }
    if (ts.isJsxExpression(node) && node.expression) {
      const value = node.expression;
      if (
        ts.isIdentifier(value) ||
        ts.isPropertyAccessExpression(value) ||
        ts.isCallExpression(value)
      ) {
        if (ts.isCallExpression(value)) {
          const callee = value.expression;
          if (ts.isPropertyAccessExpression(callee) && callee.name.text === "map" &&
            checker.isArrayType(checker.getTypeAtLocation(callee.expression)) &&
            value.arguments[0] && ts.isFunctionLike(value.arguments[0])) {
            return containsPublic(value.arguments[0], visited);
          }
          const result = hostConstruction.flowValues.resultAt(value, value);
          const resolved =
            result.kind === "exact" ? result.values.filter((item) => item !== value) : [];
          if (resolved.length > 0) return resolved.some((item) => containsPublic(item, visited));
        }
        const reference = ts.isCallExpression(value) ? value.expression : value;
        const declarations = checker.getSymbolAtLocation(reference)?.declarations ?? [];
        if (declarations.some((declaration) => containsPublic(declaration, visited))) return true;
        if (
          declarations.some(
            (declaration) => ts.isVariableDeclaration(declaration) && declaration.initializer,
          )
        )
          return false;
        const type = checker.getTypeAtLocation(value);
        const primitive =
          ts.TypeFlags.StringLike |
          ts.TypeFlags.NumberLike |
          ts.TypeFlags.BooleanLike |
          ts.TypeFlags.Null |
          ts.TypeFlags.Undefined |
          ts.TypeFlags.Never |
          ts.TypeFlags.BigIntLike;
        const types = type.isUnion() ? type.types : [type];
        if (types.some((candidate) => !(candidate.flags & primitive))) return true;
      }
    }
    return Boolean(ts.forEachChild(node, (child) => containsPublic(child, visited) || undefined));
  }
  function hasPublicDescendant(opening) {
    const children = ts.isJsxOpeningElement(opening) ? opening.parent.children : [];
    return (
      containsPublic(opening, new Set()) ||
      children.some((child) => containsPublic(child, new Set()))
    );
  }
  return { hasPublicDescendant, renderTargets };
}
