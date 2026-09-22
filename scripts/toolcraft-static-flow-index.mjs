const MAX_COMPATIBILITY_RECORDS = 64;

export function createToolcraftStaticFlowIndex({
  checker,
  resolveStaticString,
  ts,
}) {
  function unwrap(node) {
    let current = node;
    while (ts.isAsExpression(current) || ts.isNonNullExpression(current) ||
      ts.isParenthesizedExpression(current) ||
      ts.isSatisfiesExpression(current) ||
      ts.isTypeAssertionExpression(current)) current = current.expression;
    return current;
  }

  function executionNode(node) {
    let current = node;
    while (ts.isAsExpression(current) || ts.isNonNullExpression(current) ||
      ts.isSatisfiesExpression(current) ||
      ts.isTypeAssertionExpression(current)) current = current.expression;
    return current;
  }

  function executionScope(node) {
    for (let current = node; current; current = current.parent) {
      if (ts.isFunctionLike(current) || ts.isSourceFile(current)) return current;
    }
    return undefined;
  }

  function lexicalScope(node) {
    for (let current = node; current; current = current.parent) {
      if (ts.isBlock(current) || ts.isSourceFile(current)) return current;
    }
    return undefined;
  }

  function staticMember(node) {
    if (ts.isPropertyAccessExpression(node)) return node.name.text;
    if (!ts.isElementAccessExpression(node) || !node.argumentExpression) {
      return undefined;
    }
    return ts.isNumericLiteral(node.argumentExpression)
      ? node.argumentExpression.text
      : resolveStaticString(node.argumentExpression);
  }

  function reference(expression) {
    let node = unwrap(expression);
    const path = [];
    let dynamic = false;
    while (ts.isPropertyAccessExpression(node) ||
      ts.isElementAccessExpression(node)) {
      const member = staticMember(node);
      if (member === undefined) dynamic = true;
      else path.unshift(member);
      node = unwrap(node.expression);
    }
    if (!ts.isIdentifier(node)) return undefined;
    return Object.freeze({
      dynamic,
      path: Object.freeze(path),
      symbol: checker.getSymbolAtLocation(node),
    });
  }

  function contains(container, node) {
    return container.pos <= node.pos && container.end >= node.end;
  }

  function localSymbol(node) {
    if (!ts.isIdentifier(node)) return undefined;
    const symbol = checker.getSymbolAtLocation(node);
    return (symbol?.declarations ?? []).some((declaration) =>
      ts.isVariableDeclaration(declaration) || ts.isBindingElement(declaration) ||
      ts.isParameter(declaration)
    ) ? symbol : undefined;
  }

  function recordsFor(symbol) {
    const sourceFile = symbol?.declarations?.[0]?.getSourceFile();
    if (!sourceFile) return Object.freeze([]);
    const records = [];
    function visit(node) {
      if (records.length >= MAX_COMPATIBILITY_RECORDS) return;
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) &&
        checker.getSymbolAtLocation(node.name) === symbol) records.push(node);
      if (ts.isBinaryExpression(node) && reference(node.left)?.symbol === symbol &&
        node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
        node.operatorToken.kind <= ts.SyntaxKind.LastAssignment) records.push(node);
      ts.forEachChild(node, visit);
    }
    visit(sourceFile);
    return Object.freeze(records);
  }

  return Object.freeze({
    contains,
    executionNode,
    executionScope,
    lexicalScope,
    localSymbol,
    recordsFor,
    reference,
    staticMember,
    unwrap,
  });
}
