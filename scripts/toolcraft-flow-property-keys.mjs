import { createToolcraftPropertyKeyIdentities } from
  "./toolcraft-flow-property-key-identities.mjs";
import { exact } from "./toolcraft-flow-facts.mjs";
import { toolcraftFlowRegistryText } from "./toolcraft-flow-registry-keys.mjs";
import { registerToolcraftFlowSymbolNode } from "./toolcraft-flow-state-keys.mjs";
const MAX_PROPERTY_KEY_ALTERNATIVES = 16;
export function createToolcraftFlowPropertyKeys({ checker, index, ts }) {
  const dynamicIds = new WeakMap();
  const freshSymbols = new WeakMap();
  let nextDynamicId = 0;
  const { coverageDomain, coverageIntersects, domainForType, emptyCoverage,
    keyForIdentity, keyForType, mergeCoverage, registrySymbol, stringKey,
    symbolKey } =
    createToolcraftPropertyKeyIdentities({ checker, index, ts });
  function exactKey(value, source) {
    const node = index.unwrap(value);
    const known = keyForIdentity(node);
    if (known) return known;
    if (ts.isStringLiteralLike(node) || ts.isNumericLiteral(node)) {
      return stringKey(node.text);
    }
    const type = checker.getTypeAtLocation(source ?? node);
    if ((type.flags & ts.TypeFlags.UniqueESSymbol) === 0) return undefined;
    const declaration = type.symbol?.valueDeclaration ?? type.symbol?.declarations?.[0];
    return symbolKey(declaration ?? node);
  }

  function symbolFor(fact) {
    const values = fact?.kind === "exact" ? fact.values : [];
    const keys = values.flatMap((value) => {
      const node = index.unwrap(value);
      const literal = toolcraftFlowRegistryText(value, { index, ts });
      const texts = literal !== undefined ? [literal]
        : variantsOf(checker.getTypeAtLocation(node)).flatMap((type) =>
            typeof type.value === "string" || typeof type.value === "number"
              ? [String(type.value)] : []);
      return texts.map(registrySymbol);
    });
    return keys.length > 0 ? exact(keys.map(({ identity }) => identity)) : undefined;
  }

  function freshSymbol(source) {
    const site = source && index.unwrap(source);
    const known = site && freshSymbols.get(site);
    if (known) return exact([known]);
    const identity = ts.factory.createIdentifier("__toolcraft_fresh_symbol");
    registerToolcraftFlowSymbolNode(identity);
    symbolKey(identity);
    if (site) freshSymbols.set(site, identity);
    return exact([identity]);
  }
  function variantsOf(type) {
    return type?.isUnionOrIntersection?.() ? type.types : type ? [type] : [];
  }
  function coverageFor(type, omitted, exactFact) {
    if (exactFact || !type) return emptyCoverage();
    const variants = variantsOf(type);
    const unknown = variants.some((variant) =>
      (variant.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) !== 0);
    const broad = { string: false, symbol: false };
    for (const variant of variants) {
      const domain = domainForType(variant);
      if (domain && !keyForType(variant)) broad[domain] = true;
    }
    const omittedDomains = new Set(omitted.map(({ kind }) => kind));
    return Object.freeze({
      string: coverageDomain(omittedDomains.has("string") ? [type] : [],
        unknown || broad.string),
      symbol: coverageDomain(omittedDomains.has("symbol") ? [type] : [],
        unknown || broad.symbol),
    });
  }

  function coverageForSource(source) {
    const type = source && checker.getTypeAtLocation(index.unwrap(source));
    const unknown = variantsOf(type).some((variant) =>
      (variant.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) !== 0);
    return type ? Object.freeze({
      string: coverageDomain(unknown ? [] : [type], unknown),
      symbol: coverageDomain(unknown ? [] : [type], unknown),
    }) : Object.freeze({
      string: coverageDomain([], true), symbol: coverageDomain([], true),
    });
  }

  function fromFact(fact, source) {
    const factValues = fact?.kind === "exact" ? fact.values : [];
    const exactEntries = factValues
      .map((value) => exactKey(value, source)).filter(Boolean);
    const type = source && checker.getTypeAtLocation(index.unwrap(source));
    const typedEntries = variantsOf(type).map(keyForType).filter(Boolean);
    const completeExact = factValues.length > 0 &&
      exactEntries.length === factValues.length;
    const candidates = completeExact ? exactEntries : [...exactEntries, ...typedEntries];
    const all = [...new Map(candidates.map((key) =>
      [key.id, key])).values()];
    const alternatives = all.slice(0, MAX_PROPERTY_KEY_ALTERNATIVES);
    const omitted = all.slice(MAX_PROPERTY_KEY_ALTERNATIVES);
    const coverage = coverageFor(type, omitted,
      omitted.length === 0 && exactEntries.length > 0);
    const noEvidence = alternatives.length === 0 &&
      !coverage.string.unbounded && !coverage.symbol.unbounded &&
      coverage.string.finiteTypes.length === 0 &&
      coverage.symbol.finiteTypes.length === 0;
    const unknownFact = fact?.kind !== "exact" && variantsOf(type).length === 0;
    const fallback = noEvidence && unknownFact ? Object.freeze({
      string: coverageDomain([], true), symbol: coverageDomain([], true),
    }) : coverage;
    const sourceNode = source && index.unwrap(source);
    const sourceSymbol = sourceNode && checker.getSymbolAtLocation(sourceNode);
    const dynamicOwner = sourceSymbol ?? sourceNode;
    let dynamicId = dynamicOwner && dynamicIds.get(dynamicOwner);
    if (dynamicOwner && !dynamicId) {
      dynamicId = `dynamic-key:${nextDynamicId += 1}`;
      dynamicIds.set(dynamicOwner, dynamicId);
    }
    return Object.freeze({ alternatives: Object.freeze(alternatives),
      coverage: fallback, kind: "PropertyKeyFact",
      dynamicId, unbounded: fallback.string.unbounded || fallback.symbol.unbounded });
  }

  function staticFact(value) {
    return Object.freeze({ alternatives: Object.freeze([stringKey(value)]),
      coverage: emptyCoverage(), kind: "PropertyKeyFact", unbounded: false });
  }

  function keyId(key) {
    return key?.id ?? "unbounded-key";
  }

  function typeContains(type, key) {
    return variantsOf(type).some((variant) => {
      const exact = keyForType(variant);
      if (exact) return exact.id === key.id;
      const domain = domainForType(variant);
      if (domain === key.kind) return true;
      return key.kind === "string" && (Boolean(
        checker.getPropertyOfType(variant, key.value),
      ) || Boolean(checker.getIndexTypeOfType(
        variant, /^\d+$/u.test(key.value) ? ts.IndexKind.Number : ts.IndexKind.String,
      )));
    });
  }

  function coverageContains(coverage, key) {
    const domain = coverage?.[key?.kind];
    return Boolean(domain?.unbounded || domain?.finiteTypes?.some((type) =>
      typeContains(type, key)));
  }

  function contains(keyFact, key) {
    return Boolean(keyFact?.alternatives?.some(({ id }) => id === key?.id) ||
      coverageContains(keyFact?.coverage, key));
  }

  function hasCoverage(keyFact) {
    return Boolean(keyFact?.coverage && ["string", "symbol"].some((domain) =>
      keyFact.coverage[domain].unbounded ||
      keyFact.coverage[domain].finiteTypes.length > 0));
  }

  function typeMayContain(source, member) {
    if (!source || typeof member !== "string") return false;
    const type = checker.getTypeAtLocation(index.unwrap(source));
    const indexKind = /^\d+$/u.test(member)
      ? ts.IndexKind.Number : ts.IndexKind.String;
    return variantsOf(type).some((candidate) =>
      (candidate.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) !== 0 ||
      Boolean(checker.getPropertyOfType(candidate, member)) ||
      Boolean(checker.getIndexTypeOfType(candidate, indexKind))
    );
  }

  return Object.freeze({ contains, coverageContains, coverageForSource,
    coverageIntersects,
    emptyCoverage, fromFact, hasCoverage, keyId, mergeCoverage, staticFact,
    freshSymbol, stringKey, symbolFor, typeMayContain });
}
