export function createToolcraftStrictContext({ index, ts }) {
  function hasDirective(statements) {
    for (const statement of statements) {
      if (!ts.isExpressionStatement(statement) ||
        !ts.isStringLiteral(statement.expression)) return false;
      if (statement.expression.text === "use strict") return true;
    }
    return false;
  }

  return function strictContext(node) {
    for (let current = index.unwrap(node); current; current = current.parent) {
      if (ts.isClassLike(current)) return true;
      if (ts.isFunctionLike(current) && current.body &&
        ts.isBlock(current.body) && hasDirective(current.body.statements)) {
        return true;
      }
      if (ts.isSourceFile(current)) {
        return ts.isExternalModule(current) || hasDirective(current.statements);
      }
    }
    return false;
  };
}
