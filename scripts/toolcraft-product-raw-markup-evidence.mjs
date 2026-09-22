import {
  getToolcraftNativeSemanticAttributeKind,
  getToolcraftRawMarkupInjectionKind,
  toolcraftNativeSemanticHostPolicies,
} from
  "./toolcraft-native-semantic-policy.mjs";

const MAX_ENTITY_PASSES = 4;
const MAX_MARKUP_DEPTH = 4;
const semanticPolicyByTag = new Map(
  toolcraftNativeSemanticHostPolicies.map((policy) => [policy.tag, policy]),
);
const namedEntities = new Map([
  ["amp", "&"],
  ["apos", "'"],
  ["gt", ">"],
  ["lt", "<"],
  ["quot", '"'],
]);

function propertyName(node, resolveStaticString, ts) {
  return ts.isIdentifier(node) || ts.isStringLiteralLike(node)
    ? node.text.toLowerCase()
    : ts.isComputedPropertyName(node)
      ? resolveStaticString(node.expression)?.toLowerCase()
      : undefined;
}

function decodeEntities(source) {
  let text = source;
  for (let pass = 0; pass < MAX_ENTITY_PASSES; pass += 1) {
    const decoded = text.replace(
      /&(?:#x([0-9a-f]+)|#([0-9]+)|([a-z]+));/giu,
      (match, hex, decimal, named) => {
        const codePoint = hex
          ? Number.parseInt(hex, 16)
          : decimal ? Number.parseInt(decimal, 10) : undefined;
        if (codePoint !== undefined) {
          return Number.isInteger(codePoint) && codePoint >= 0 &&
              codePoint <= 0x10ffff
            ? String.fromCodePoint(codePoint)
            : match;
        }
        return namedEntities.get(named.toLowerCase()) ?? match;
      },
    );
    if (decoded === text) return { known: true, text };
    text = decoded;
  }
  return { known: !/&(?:#x[0-9a-f]+|#[0-9]+|(?:amp|apos|gt|lt|quot));/iu.test(text), text };
}

function readMarkupTag(source, start) {
  let index = start + 1;
  if (source.startsWith("!--", index)) {
    const end = source.indexOf("-->", index + 3);
    return end < 0 ? { kind: "unknown" } : { end: end + 3, kind: "skip" };
  }
  if (source[index] === "!") {
    const end = source.indexOf(">", index + 1);
    return end < 0 ? { kind: "unknown" } : { end: end + 1, kind: "skip" };
  }
  if (source[index] === "/") index += 1;
  while (/\s/u.test(source[index] ?? "")) index += 1;
  let tag = "";
  while (/[a-z0-9-]/iu.test(source[index] ?? "")) {
    tag += source[index];
    index += 1;
  }
  if (!tag) return { end: start + 1, kind: "skip" };
  const attributes = new Map();
  while (index < source.length) {
    while (/\s/u.test(source[index] ?? "")) index += 1;
    if (source[index] === ">") {
      return { attributes, end: index + 1, kind: "tag", tag: tag.toLowerCase() };
    }
    if (source[index] === "/" && source[index + 1] === ">") {
      return { attributes, end: index + 2, kind: "tag", tag: tag.toLowerCase() };
    }
    let name = "";
    while (/[^\s=/>]/u.test(source[index] ?? "")) {
      name += source[index];
      index += 1;
    }
    if (!name) return { kind: "unknown" };
    while (/\s/u.test(source[index] ?? "")) index += 1;
    let value = "";
    if (source[index] === "=") {
      index += 1;
      while (/\s/u.test(source[index] ?? "")) index += 1;
      const quote = ["'", '"'].includes(source[index]) ? source[index++] : undefined;
      if (quote) {
        const end = source.indexOf(quote, index);
        if (end < 0) return { kind: "unknown" };
        value = source.slice(index, end);
        index = end + 1;
      } else {
        const startValue = index;
        while (/[^\s>]/u.test(source[index] ?? "")) index += 1;
        value = source.slice(startValue, index);
      }
    }
    attributes.set(name.toLowerCase(), value);
  }
  return { kind: "unknown" };
}

function markupEvidence(source, depth = 0) {
  if (depth >= MAX_MARKUP_DEPTH) return "unknown";
  const decoded = decodeEntities(source);
  if (!decoded.known) return "unknown";
  for (let index = 0; index < decoded.text.length;) {
    const start = decoded.text.indexOf("<", index);
    if (start < 0) break;
    const token = readMarkupTag(decoded.text, start);
    if (token.kind === "unknown") return "unknown";
    index = token.end;
    if (token.kind !== "tag") continue;
    const policy = semanticPolicyByTag.get(token.tag);
    const srcdoc = token.attributes.get("srcdoc");
    if (srcdoc !== undefined && markupEvidence(srcdoc, depth + 1) !== "safe") {
      return "dangerous";
    }
    if (policy || getToolcraftRawMarkupInjectionKind(token.tag) ||
      [...token.attributes.keys()].some((name) =>
        getToolcraftNativeSemanticAttributeKind(token.tag, name) ||
        getToolcraftRawMarkupInjectionKind(token.tag, name)
    )) return "dangerous";
  }
  return "safe";
}

export function createToolcraftProductRawMarkupEvidence({
  checker,
  flowValues,
  resolveStaticString,
  ts,
}) {
  const { unwrap } = flowValues;
  const RAW_MARKUP_PROPERTY = Object.freeze({
    canonical: "dangerouslysetinnerhtml",
    typed: "dangerouslySetInnerHTML",
  });
  const HTML_PROPERTY = Object.freeze({ canonical: "__html", typed: "__html" });

  function staticText(expression, depth = 0, visited = new Set()) {
    if (depth >= 12) return undefined;
    const node = unwrap(expression);
    const direct = resolveStaticString(node);
    if (direct !== undefined) return direct;
    if (ts.isPropertyAccessExpression(node) ||
      ts.isElementAccessExpression(node)) {
      const name = ts.isPropertyAccessExpression(node)
        ? node.name.text
        : node.argumentExpression && resolveStaticString(node.argumentExpression);
      if (name !== undefined) {
        const fact = flowValues.propertyAt(node.expression, name, expression);
        if (fact.kind === "exact" && fact.values.length === 1) {
          return staticText(fact.values[0], depth + 1, visited);
        }
      }
    }
    if (ts.isIdentifier(node)) {
      const fact = flowValues.valueAt(node, expression);
      if (fact.kind === "exact" && fact.values.length === 1 &&
        fact.values[0] !== node) {
        return staticText(fact.values[0], depth + 1, new Set(visited));
      }
    }
    return undefined;
  }

  function rawMarkupValue(expression) {
    const evidence = flowValues.propertyAt(
      expression, HTML_PROPERTY.typed, expression,
    );
    if (evidence.kind === "absent") return evidence;
    if (evidence.kind !== "exact" || evidence.values.length !== 1) {
      return { kind: "unknown" };
    }
    const text = staticText(evidence.values[0]);
    return text === undefined ? { kind: "unknown" } : { kind: "text", text };
  }

  function spreadEvidence(expression) {
    const evidence = flowValues.propertyAt(
      expression, RAW_MARKUP_PROPERTY.typed, expression,
    );
    if (evidence.kind === "absent") return { kind: "unrelated" };
    return evidence.kind === "exact" && evidence.values.length === 1
      ? rawMarkupValue(evidence.values[0]) : { kind: "unknown" };
  }

  function attributeEvidence(attribute) {
    if (!attribute.initializer ||
      !ts.isJsxExpression(attribute.initializer) ||
      !attribute.initializer.expression) return { kind: "unknown" };
    return rawMarkupValue(attribute.initializer.expression);
  }

  return function inspectRawMarkup(node) {
    if (!ts.isJsxOpeningElement(node) && !ts.isJsxSelfClosingElement(node)) {
      return undefined;
    }
    let evidence = { kind: "absent" };
    let sink;
    for (const attribute of node.attributes.properties) {
      if (ts.isJsxSpreadAttribute(attribute)) {
        const spread = spreadEvidence(attribute.expression);
        if (spread.kind !== "unrelated") {
          evidence = spread;
          sink = attribute;
        }
        continue;
      }
      if (propertyName(attribute.name, resolveStaticString, ts) !==
        "dangerouslysetinnerhtml") {
        continue;
      }
      evidence = attributeEvidence(attribute);
      sink = attribute;
    }
    const markup = evidence.kind === "text"
      ? markupEvidence(evidence.text)
      : evidence.kind;
    return markup === "unknown" || markup === "dangerous"
      ? { node: sink ?? node, tag: markup }
      : undefined;
  };
}
