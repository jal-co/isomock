import { isToolcraftDangerousDomCapabilityName } from
  "./toolcraft-dom-host-capabilities.mjs";
import { toolcraftDomEvidenceRisk } from
  "./toolcraft-dom-evidence-tokens.mjs";
import { createToolcraftDomBoundedTypeReader } from
  "./toolcraft-dom-bounded-type-reader.mjs";
import { toolcraftDomEvidenceToken } from
  "./toolcraft-dom-evidence-tokens.mjs";

const LIB_DOM_DECLARATION = /\/lib\.dom(?:\.iterable)?\.d\.[cm]?ts$/u;
const MAX_SUMMARY_DEPTH = 48;
const MAX_SUMMARY_VISITS = 256;

const RANK = Object.freeze({ dangerous: 2, safe: 0, unknown: 1 });

function mergeFacts(facts, role) {
  const risk = facts.reduce((highest, fact) =>
    RANK[fact] > RANK[highest] ? fact : highest, "safe");
  const token = risk === "dangerous" ? "dangerous"
    : risk === "unknown" ? role === "source" ? "exhaustedSource"
      : "exhaustedTarget" : "safe";
  return Object.freeze({ risk, type: toolcraftDomEvidenceToken(token) });
}

export function createToolcraftDomSummaryWalker({ checker, reader, ts }) {
  const caches = Object.freeze({ source: new Map(), target: new Map() });
  const boundedReader = reader ?? createToolcraftDomBoundedTypeReader({
    checker, ts,
  });

  function declaredInDom(type) {
    return (type?.symbol?.declarations ?? []).some((declaration) =>
      LIB_DOM_DECLARATION.test(
        declaration.getSourceFile().fileName.replaceAll("\\", "/"),
      )
    );
  }

  function symbolType(symbol) {
    const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0];
    return declaration && checker.getTypeOfSymbolAtLocation(symbol, declaration);
  }

  function children(type, role) {
    const result = [];
    // Standard array methods contain unconstrained callback parameters. Their
    // capabilities come from the element types, not those generic signatures.
    const symbol = type.symbol ?? type.target?.symbol;
    const isStandardDeclaration = declaration => /\/lib\.es(?:5|\d{4}[^/]*)\.d\.[cm]?ts$/u.test(
        declaration.getSourceFile().fileName.replaceAll("\\", "/"),
      );
    const standardArray = ["Array", "ReadonlyArray"].includes(symbol?.getName?.()) &&
      (symbol.declarations ?? []).some(isStandardDeclaration);
    if (standardArray || checker.isTupleType(type)) {
      const elements = boundedReader.typeArgumentsOf(type, role);
      if (elements.kind === "exhausted") return [elements.evidence];
      const augmented = boundedReader.summaryPropertiesOf(type, role);
      if (augmented.kind === "exhausted") return [augmented.evidence];
      return [...elements.values, ...augmented.values.filter(property =>
        !(property.declarations ?? []).every(isStandardDeclaration)
      ).map(symbolType).filter(Boolean)];
    }
    const constraint = (type.flags & ts.TypeFlags.TypeParameter) !== 0
      ? checker.getBaseConstraintOfType(type) : undefined;
    if (constraint) result.push(constraint);
    if ((type.flags & (ts.TypeFlags.Object | ts.TypeFlags.TypeParameter)) === 0) {
      return result;
    }
    const collections = [
      boundedReader.bounded(type.aliasTypeArguments ?? [], role),
      boundedReader.baseTypesOf(type, role),
      boundedReader.typeArgumentsOf(type, role),
    ];
    if (collections.some(({ kind }) => kind === "exhausted")) {
      result.push(toolcraftDomEvidenceToken(
        role === "source" ? "exhaustedSource" : "exhaustedTarget",
      ));
    }
    for (const collection of collections) result.push(...collection.values);
    for (const kind of [ts.IndexKind.String, ts.IndexKind.Number]) {
      const indexed = checker.getIndexTypeOfType(type, kind);
      if (indexed) result.push(indexed);
    }
    const properties = boundedReader.summaryPropertiesOf(type, role);
    if (properties.kind === "exhausted") result.push(properties.evidence);
    for (const property of properties.values) {
      const nested = symbolType(property);
      if (nested) result.push(nested);
    }
    const signatures = boundedReader.signaturesOf(type, role);
    if (signatures.kind === "exhausted") result.push(signatures.evidence);
    for (const { signature } of signatures.values) {
      result.push(checker.getReturnTypeOfSignature(signature));
      const parameters = boundedReader.parametersOf(signature, role);
      if (parameters.kind === "exhausted") result.push(parameters.evidence);
      for (const parameter of parameters.values) {
        const nested = symbolType(parameter);
        if (nested) result.push(nested);
      }
    }
    return result;
  }

  function directRisk(type, role) {
    const evidence = toolcraftDomEvidenceRisk(type);
    if (evidence) return evidence;
    if (!type || (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) !== 0) {
      return "unknown";
    }
    if (role === "source" && declaredInDom(type)) return "dangerous";
    if (role === "target") {
      const properties = boundedReader.summaryPropertiesOf(type, role);
      if (properties.values.some((property) =>
        isToolcraftDangerousDomCapabilityName(property.getName())
      )) return "dangerous";
      if (properties.kind === "exhausted") return "unknown";
    }
    return "safe";
  }

  function summarize(types, role) {
    const context = { visits: 0 };
    function inspect(type, remaining, visiting) {
      const direct = directRisk(type, role);
      if (direct !== "safe") return direct;
      if (remaining <= 0 || context.visits >= MAX_SUMMARY_VISITS) return "unknown";
      const cached = caches[role].get(type)?.get(remaining);
      if (cached) return cached;
      if (visiting.has(type)) return "safe";
      context.visits += 1;
      const variants = boundedReader.variantsOf(type, role);
      if (variants.kind === "exhausted") return "unknown";
      const nested = variants.values.flatMap((member) => children(member, role));
      const risks = nested.map((child) => inspect(
        child, remaining - 1, new Set(visiting).add(type),
      ));
      const result = mergeFacts(risks, role).risk;
      const byBudget = caches[role].get(type) ?? new Map();
      byBudget.set(remaining, result);
      caches[role].set(type, byBudget);
      return result;
    }
    const bounded = boundedReader.bounded(types, role);
    const facts = bounded.values.map((type) => inspect(
      type, MAX_SUMMARY_DEPTH, new Set(),
    ));
    if (bounded.kind === "exhausted") facts.push("unknown");
    return mergeFacts(facts, role);
  }

  return Object.freeze({ summarize });
}
