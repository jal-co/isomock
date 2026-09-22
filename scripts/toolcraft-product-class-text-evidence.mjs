const MAX_TEXT_DEPTH = 12;
const MAX_TEXT_VARIANTS = 32;

/** Text composition must use executed references, never declaration initializers. */
export function createToolcraftProductClassTextEvidence({
  checker, flowValues, resolveStaticString, ts, unwrap,
}) {
  function typedTexts(node) {
    const type = checker.getTypeAtLocation(node);
    const variants = type?.isUnionOrIntersection?.() ? type.types : [type];
    const values = variants.flatMap((candidate) =>
      candidate && (candidate.flags & ts.TypeFlags.StringLiteral) !== 0
        ? [candidate.value] : []
    );
    return values.length > 0 && values.length === variants.length
      ? [...new Set(values)] : undefined;
  }

  function combine(left, right) {
    return left && right && left.length * right.length <= MAX_TEXT_VARIANTS
      ? left.flatMap((prefix) => right.map((suffix) => prefix + suffix))
      : undefined;
  }

  function texts(expression, depth = 0, visited = new Set()) {
    if (depth >= MAX_TEXT_DEPTH) return undefined;
    const node = unwrap(expression);
    if (visited.has(node)) return undefined;
    const nextVisited = new Set(visited).add(node);
    const nested = (value) => texts(value, depth + 1, nextVisited);
    if (ts.isStringLiteralLike(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      return [node.text];
    }
    const reference = ts.isIdentifier(node) || ts.isPropertyAccessExpression(node) ||
      ts.isElementAccessExpression(node);
    const controlled = ts.isConditionalExpression(node) ||
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken;
    if (reference || controlled) {
      const fact = reference ? flowValues.valueAt(node, expression)
        : flowValues.resultAt(node, expression);
      if (fact.kind !== "exact") return undefined;
      if (fact.values.length === 1 && fact.values[0] === node) {
        return ts.isIdentifier(node) ? typedTexts(node) : undefined;
      }
      const alternatives = fact.values.map(nested);
      return alternatives.every(Boolean) &&
        alternatives.flat().length <= MAX_TEXT_VARIANTS
        ? [...new Set(alternatives.flat())] : undefined;
    }
    if (ts.isTemplateExpression(node)) {
      let values = [node.head.text];
      for (const span of node.templateSpans) {
        values = combine(values, nested(span.expression));
        if (!values) return undefined;
        values = values.map((value) => value + span.literal.text);
      }
      return values;
    }
    if (ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      return combine(nested(node.left), nested(node.right));
    }
    // Only self-contained literals may use lexical conversion.
    if (ts.isNumericLiteral(node)) {
      const value = resolveStaticString(node);
      return value === undefined ? undefined : [value];
    }
    return undefined;
  }
  return texts;
}
