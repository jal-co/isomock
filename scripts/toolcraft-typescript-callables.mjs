function isSupportedConstCallable(node, ts, unwrapExpression) {
  if (
    !ts.isVariableDeclaration(node) ||
    !ts.isIdentifier(node.name) ||
    (node.parent.flags & ts.NodeFlags.Const) === 0 ||
    !node.initializer
  ) {
    return undefined;
  }
  const initializer = unwrapExpression(node.initializer, ts);
  return ts.isArrowFunction(initializer) ||
    ts.isFunctionExpression(initializer)
    ? initializer
    : undefined;
}

function isFunctionLike(node, ts) {
  return (
    ts.isArrowFunction(node) ||
    ts.isConstructorDeclaration(node) ||
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isSetAccessorDeclaration(node)
  );
}

export function createToolcraftTypeScriptCallableInventory({
  checker,
  sourceFile,
  ts,
  unwrapExpression,
}) {
  const callableByNode = new Map();
  const callableBySymbol = new Map();
  function register(node, bindingNodes) {
    const callable = Object.freeze({
      callableId: `callable:${node.getStart(sourceFile)}`,
    });
    callableByNode.set(node, callable);
    for (const bindingNode of bindingNodes) {
      const symbol = checker.getSymbolAtLocation(bindingNode);
      if (symbol) callableBySymbol.set(symbol, callable);
    }
  }
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name) {
      register(node, [node.name]);
    } else {
      const callable = isSupportedConstCallable(
        node,
        ts,
        unwrapExpression,
      );
      if (callable) {
        register(
          callable,
          ts.isFunctionExpression(callable) && callable.name
            ? [node.name, callable.name]
            : [node.name],
        );
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return Object.freeze({
    getBySymbol(symbol) {
      return callableBySymbol.get(symbol);
    },
    getEnclosing(node) {
      let current = node.parent;
      while (current) {
        if (isFunctionLike(current, ts)) {
          return callableByNode.get(current);
        }
        current = current.parent;
      }
      return undefined;
    },
  });
}
