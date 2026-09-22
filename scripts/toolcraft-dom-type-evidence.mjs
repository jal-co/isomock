import { createToolcraftTypeGraphEvidence } from
  "./toolcraft-type-graph-evidence.mjs";
import { createToolcraftDomTypeChildren } from
  "./toolcraft-dom-type-children.mjs";
import {
  isToolcraftDomTypeEvidence,
  toolcraftDomEvidenceRisk,
} from "./toolcraft-dom-evidence-tokens.mjs";

const LIB_DOM_DECLARATION = /\/lib\.dom(?:\.iterable)?\.d\.[cm]?ts$/u;
const LIB_ARRAY_DECLARATION = /\/lib\.es(?:5|\d{4}[^/]*)\.d\.[cm]?ts$/u;
const MAX_TYPE_DEPTH = 48;

export {
  isToolcraftDomTypeEvidence,
  toolcraftDomEvidenceRisk,
  toolcraftDomEvidenceToken,
} from "./toolcraft-dom-evidence-tokens.mjs";

function declarationComesFromLibDom(declaration) {
  return LIB_DOM_DECLARATION.test(
    declaration.getSourceFile().fileName.replaceAll("\\", "/"),
  );
}

export function createToolcraftDomTypeEvidence({ checker, reader, ts }) {
  const originCache = new Map();
  const {
    childrenOf,
    originChildrenOf,
    typeArguments,
    variants,
  } = createToolcraftDomTypeChildren({ checker, reader, ts });

  function typeHasLibDomOrigin(type, visited = new Set(), depth = 0) {
    if (!type || visited.has(type)) return false;
    if (depth === 0 && originCache.has(type)) return originCache.get(type);
    if (depth >= MAX_TYPE_DEPTH) return false;
    const nextVisited = new Set(visited).add(type);
    const result = variants(type).some((member) =>
      (member.symbol?.declarations ?? []).some(declarationComesFromLibDom) ||
      originChildrenOf(member).some((related) =>
        typeHasLibDomOrigin(related, nextVisited, depth + 1)
      )
    );
    if (depth === 0) originCache.set(type, result);
    return result;
  }

  let inspectMemberTypeGraph;

  function standardArrayEvidence(type) {
    const members = variants(type);
    if (members.length === 0 || members.some((member) => {
      const symbol = member.symbol ?? member.target?.symbol;
      return !["Array", "ReadonlyArray"].includes(symbol?.getName?.()) ||
        !(symbol?.declarations ?? []).some((declaration) =>
          LIB_ARRAY_DECLARATION.test(
            declaration.getSourceFile().fileName.replaceAll("\\", "/"),
          )
        );
    })) return undefined;
    const risks = members.flatMap(typeArguments).map((argument) =>
      inspectMemberTypeGraph(argument)
    );
    return risks.includes("dom") ? "dom"
      : risks.includes("unknown") || risks.length === 0 ? "unknown" : "plain";
  }

  inspectMemberTypeGraph = createToolcraftTypeGraphEvidence({
    childrenOf,
    classify: (type) => {
      const summary = toolcraftDomEvidenceRisk(type);
      if (summary) return summary === "dangerous" ? "dom"
        : summary === "safe" ? "plain" : "unknown";
      const array = standardArrayEvidence(type);
      if (array) return array;
      return (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) !== 0
        ? "unknown" : typeHasLibDomOrigin(type) ? "dom" : undefined;
    },
    dangerous: "dom",
    maxDepth: MAX_TYPE_DEPTH,
    safe: "plain",
    unknown: "unknown",
  });

  function typeContainsLibDomEvidence(type) {
    return inspectMemberTypeGraph(type) === "dom";
  }

  function typeHasLibDomName(type, names, visited = new Set(), depth = 0) {
    if (!type || visited.has(type) || depth >= MAX_TYPE_DEPTH ||
      isToolcraftDomTypeEvidence(type)) return false;
    const nextVisited = new Set(visited).add(type);
    return variants(type).some((member) =>
      names.has(member.symbol?.getName?.()) &&
        (member.symbol?.declarations ?? []).some(declarationComesFromLibDom) ||
      originChildrenOf(member).some((related) =>
        typeHasLibDomName(related, names, nextVisited, depth + 1)
      )
    );
  }

  function typeEvidence(type) {
    return inspectMemberTypeGraph(type);
  }

  function directTypeEvidence(type) {
    const summary = toolcraftDomEvidenceRisk(type);
    if (summary) return summary === "dangerous" ? "dom"
      : summary === "safe" ? "plain" : "unknown";
    if (!type || (type.flags & (
      ts.TypeFlags.Any | ts.TypeFlags.Unknown
    )) !== 0) return "unknown";
    if ((type.flags & ts.TypeFlags.TypeParameter) !== 0 &&
      !checker.getBaseConstraintOfType(type)) return "unknown";
    return typeHasLibDomOrigin(type) ? "dom" : "plain";
  }

  function expressionEvidence(node) {
    let current = node;
    while (ts.isParenthesizedExpression(current) ||
      ts.isNonNullExpression(current)) current = current.expression;
    if (ts.isAsExpression(current) || ts.isTypeAssertionExpression(current) ||
      ts.isSatisfiesExpression(current)) {
      const source = expressionEvidence(current.expression);
      if (source !== "plain") return source;
    }
    return typeEvidence(checker.getTypeAtLocation(current));
  }

  function directExpressionEvidence(node) {
    let current = node;
    while (ts.isNonNullExpression(current) ||
      ts.isParenthesizedExpression(current)) current = current.expression;
    if (ts.isAsExpression(current) || ts.isSatisfiesExpression(current) ||
      ts.isTypeAssertionExpression(current)) {
      const source = directExpressionEvidence(current.expression);
      if (source !== "plain") return source;
    }
    return directTypeEvidence(checker.getTypeAtLocation(current));
  }

  return Object.freeze({
    directExpressionEvidence,
    directTypeEvidence,
    expressionEvidence,
    typeContainsLibDomEvidence,
    typeEvidence,
    typeHasLibDomName,
    typeHasLibDomOrigin,
  });
}
