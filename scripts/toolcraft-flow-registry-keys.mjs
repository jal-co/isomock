export function toolcraftFlowRegistryText(value, { index, ts }) {
  const node = index.unwrap(value);
  if (ts.isParenthesizedExpression(node)) {
    return toolcraftFlowRegistryText(node.expression, { index, ts });
  }
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isNumericLiteral(node)) return String(Number(node.text));
  if (ts.isBigIntLiteral(node)) {
    try { return BigInt(node.text.slice(0, -1)).toString(); } catch { return; }
  }
  if (node.kind === ts.SyntaxKind.TrueKeyword) return "true";
  if (node.kind === ts.SyntaxKind.FalseKeyword) return "false";
  if (node.kind === ts.SyntaxKind.NullKeyword) return "null";
  if (ts.isVoidExpression(node)) return "undefined";
  if (!ts.isPrefixUnaryExpression(node)) return;
  const operand = index.unwrap(node.operand);
  if (ts.isNumericLiteral(operand)) {
    const numeric = Number(operand.text);
    if (node.operator === ts.SyntaxKind.PlusToken) return String(numeric);
    if (node.operator === ts.SyntaxKind.MinusToken) return String(-numeric);
    if (node.operator === ts.SyntaxKind.TildeToken) return String(~numeric);
  }
  if (ts.isBigIntLiteral(operand) && node.operator === ts.SyntaxKind.MinusToken) {
    try { return (-BigInt(operand.text.slice(0, -1))).toString(); } catch { return; }
  }
}
