export function createToolcraftFlowOperators({ checker, index, ts }) {
  function booleanValue(value) {
    const node = index.unwrap(value);
    if (node.kind === ts.SyntaxKind.FalseKeyword ||
      node.kind === ts.SyntaxKind.NullKeyword ||
      ts.isIdentifier(node) && node.text === "undefined") return false;
    if (ts.isIdentifier(node) && node.text === "NaN") {
      const symbol = checker?.getSymbolAtLocation(node);
      return symbol?.declarations?.some((declaration) =>
        !declaration.getSourceFile().isDeclarationFile) ? undefined : false;
    }
    if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
    if (ts.isNumericLiteral(node)) return Number(node.text) !== 0;
    if (ts.isStringLiteralLike(node)) return node.text.length > 0;
    if (ts.isBigIntLiteral(node)) return !/^0+n?$/u.test(node.text);
    if (ts.isObjectLiteralExpression(node) || ts.isArrayLiteralExpression(node) ||
      ts.isFunctionLike(node)) return true;
  }

  function truthAlternatives(fact, absent = false) {
    if (!fact || fact.kind === "absent") return [absent];
    const values = fact.kind === "exact" ? fact.values
      : fact.possibleValues ?? [];
    if (values.length === 0) return [false, true];
    const outcomes = values.map(booleanValue);
    return outcomes.some((value) => value === undefined)
      ? [false, true] : [...new Set(outcomes)];
  }

  function truth(fact) {
    if (fact?.kind !== "exact" || fact.values.length !== 1) return "unknown";
    const node = index.unwrap(fact.values[0]);
    if (node.kind === ts.SyntaxKind.TrueKeyword) return "true";
    if (node.kind === ts.SyntaxKind.FalseKeyword ||
      node.kind === ts.SyntaxKind.NullKeyword) return "false";
    if (ts.isStringLiteralLike(node)) return node.text ? "true" : "false";
    if (ts.isNumericLiteral(node)) return Number(node.text) ? "true" : "false";
    if (ts.isIdentifier(node) && node.text === "undefined") return "false";
    return "unknown";
  }

  function nullish(fact) {
    if (fact?.kind !== "exact" || fact.values.length !== 1) return "unknown";
    const node = index.unwrap(fact.values[0]);
    return node.kind === ts.SyntaxKind.NullKeyword ||
      ts.isIdentifier(node) && node.text === "undefined" ? "true" : "false";
  }

  function primitive(fact) {
    if (fact?.kind !== "exact" || fact.values.length !== 1) return undefined;
    const node = index.unwrap(fact.values[0]);
    if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
    if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
    if (node.kind === ts.SyntaxKind.NullKeyword) return null;
    if (ts.isNumericLiteral(node)) return Number(node.text);
    if (ts.isStringLiteralLike(node)) return node.text;
    if (ts.isIdentifier(node) && node.text === "undefined") return undefined;
    return undefined;
  }

  function preservedUnary(node) {
    if (!ts.isPrefixUnaryExpression(node)) return false;
    const operand = index.unwrap(node.operand);
    if (node.operator === ts.SyntaxKind.TildeToken) {
      return ts.isNumericLiteral(operand) || ts.isBigIntLiteral(operand);
    }
    if (![ts.SyntaxKind.PlusToken, ts.SyntaxKind.MinusToken]
      .includes(node.operator)) return false;
    if (ts.isNumericLiteral(operand)) return true;
    if (ts.isBigIntLiteral(operand)) return node.operator === ts.SyntaxKind.MinusToken;
    return ts.isIdentifier(operand) && ["Infinity", "NaN"].includes(operand.text) ||
      ts.isPropertyAccessExpression(operand) &&
        ts.isIdentifier(operand.expression) && operand.expression.text === "globalThis" &&
        ["Infinity", "NaN"].includes(operand.name.text);
  }

  function binaryTruth(node, left, right) {
    const first = primitive(left.fact);
    const second = primitive(right.fact);
    if (first === undefined || second === undefined) return "unknown";
    const kind = node.operatorToken.kind;
    let result;
    if ([ts.SyntaxKind.EqualsEqualsToken,
      ts.SyntaxKind.EqualsEqualsEqualsToken].includes(kind)) result = first === second;
    else if ([ts.SyntaxKind.ExclamationEqualsToken,
      ts.SyntaxKind.ExclamationEqualsEqualsToken].includes(kind)) result = first !== second;
    else if (kind === ts.SyntaxKind.LessThanToken) result = first < second;
    else if (kind === ts.SyntaxKind.LessThanEqualsToken) result = first <= second;
    else if (kind === ts.SyntaxKind.GreaterThanToken) result = first > second;
    else if (kind === ts.SyntaxKind.GreaterThanEqualsToken) result = first >= second;
    return result === undefined ? "unknown" : result ? "true" : "false";
  }

  return Object.freeze({ binaryTruth, nullish, preservedUnary, primitive,
    truth, truthAlternatives });
}
