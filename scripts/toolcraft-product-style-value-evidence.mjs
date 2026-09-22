function propertyName(node, resolveStaticString, ts) {
  if (ts.isIdentifier(node) || ts.isStringLiteralLike(node) || ts.isNumericLiteral(node))
    return node.text.toLowerCase();
  return ts.isComputedPropertyName(node)
    ? resolveStaticString(node.expression)?.toLowerCase()
    : undefined;
}

export function createToolcraftProductStyleValueEvidence({ flowValues, resolveStaticString, ts }) {
  const { unwrap } = flowValues;
  function finalProperty(attributes, expected) {
    let evidence = { kind: "absent" };
    for (const attribute of attributes.properties) {
      if (ts.isJsxSpreadAttribute(attribute)) {
        const spread = flowValues.propertyAt(attribute.expression, expected.typed, attribute);
        if (spread.kind === "exact") {
          evidence =
            spread.values.length === 1
              ? { kind: "value", value: spread.values[0] }
              : { kind: "unknown" };
        } else if (spread.kind === "unknown") evidence = spread;
        continue;
      }
      if (propertyName(attribute.name, resolveStaticString, ts) !== expected.canonical) {
        continue;
      }
      if (!attribute.initializer) return { kind: "unknown" };
      if (ts.isStringLiteralLike(attribute.initializer)) {
        evidence = { kind: "value", value: attribute.initializer };
        continue;
      }
      const expression = ts.isJsxExpression(attribute.initializer)
        ? attribute.initializer.expression
        : undefined;
      evidence = expression ? { kind: "value", value: expression } : { kind: "unknown" };
    }
    return evidence;
  }

  function styleProperties(expression, domainsForProperty) {
    const object = flowValues.objectAt(expression, expression);
    if (object.kind !== "object") {
      return new Map([["*", "unresolved-style"]]);
    }
    const properties = new Map();
    for (const variant of object.variants) {
      if (
        ["string", "symbol"].some((domain) =>
          variant.propertyRemainder?.[domain]?.alternatives?.some(({ kind }) => kind !== "absent"),
        )
      )
        properties.set("*", "unresolved-style");
      for (const [name] of variant.properties) {
        const domains = domainsForProperty(name);
        if (domains.length === 0) continue;
        const fact = flowValues.propertyAt(expression, name, expression);
        if (fact.kind !== "exact") {
          properties.set("*", "unresolved-style");
          continue;
        }
        const active = fact.values.some((value) => {
          const item = unwrap(value);
          return (
            item.kind !== ts.SyntaxKind.NullKeyword &&
            !(ts.isIdentifier(item) && item.text === "undefined")
          );
        });
        if (active) properties.set(name, domains.join("/"));
      }
    }
    return properties;
  }

  return { finalProperty, styleProperties };
}
