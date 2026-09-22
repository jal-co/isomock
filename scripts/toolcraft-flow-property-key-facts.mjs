const FACT_KEYS = new Set([
  "alternatives", "coverage", "dynamicId", "kind", "remainderDomain",
  "remainderEntry", "unbounded",
]);
const DOMAIN_KEYS = new Set(["finiteTypes", "typeIds", "unbounded"]);
const ALTERNATIVE_KEYS = Object.freeze({
  string: new Set(["id", "kind", "value"]),
  symbol: new Set(["id", "identity", "kind", "registryKey"]),
});

function closed(value, allowed, required = allowed) {
  const keys = Reflect.ownKeys(value ?? {});
  return keys.every((key) => typeof key === "string" && allowed.has(key)) &&
    [...required].every((key) => Object.hasOwn(value, key));
}

function validDomain(domain) {
  return closed(domain, DOMAIN_KEYS) && Array.isArray(domain.finiteTypes) &&
    Array.isArray(domain.typeIds) &&
    domain.finiteTypes.length === domain.typeIds.length &&
    domain.typeIds.every((id) => typeof id === "string") &&
    typeof domain.unbounded === "boolean";
}

function validAlternative(value) {
  const allowed = ALTERNATIVE_KEYS[value?.kind];
  if (!allowed || !closed(value, allowed) || typeof value.id !== "string") return false;
  return value.kind === "string" ? typeof value.value === "string"
    : value.identity && typeof value.identity === "object" &&
      (value.registryKey === undefined || typeof value.registryKey === "string");
}

export function assertToolcraftFlowPropertyKeyFact(value) {
  const required = new Set(["alternatives", "coverage", "kind", "unbounded"]);
  const coverage = value?.coverage;
  const ids = value?.alternatives?.map(({ id }) => id) ?? [];
  if (!closed(value, FACT_KEYS, required) || value.kind !== "PropertyKeyFact" ||
    !Array.isArray(value.alternatives) || !value.alternatives.every(validAlternative) ||
    new Set(ids).size !== ids.length || !closed(coverage, new Set(["string", "symbol"])) ||
    !validDomain(coverage.string) || !validDomain(coverage.symbol) ||
    typeof value.unbounded !== "boolean" || value.unbounded !== Boolean(
      coverage.string.unbounded || coverage.symbol.unbounded) ||
    [value.dynamicId, value.remainderEntry].some((item) =>
      item !== undefined && typeof item !== "string") ||
    value.remainderDomain !== undefined &&
      !["string", "symbol"].includes(value.remainderDomain)) {
    throw new TypeError("Invalid PropertyKeyFact");
  }
  return value;
}

function coverageKey(coverage) {
  return ["string", "symbol"].map((domain) => [domain,
    coverage[domain].unbounded, [...coverage[domain].typeIds].sort()]);
}

export function toolcraftFlowPropertyKeyFactKey(value) {
  assertToolcraftFlowPropertyKeyFact(value);
  const alternatives = value.alternatives.map(({ id, kind, registryKey, value: item }) =>
    [kind, id, registryKey, item]).sort((left, right) =>
    JSON.stringify(left).localeCompare(JSON.stringify(right)));
  return ["property-key-fact", alternatives, coverageKey(value.coverage),
    value.dynamicId, value.remainderDomain, value.remainderEntry, value.unbounded];
}
