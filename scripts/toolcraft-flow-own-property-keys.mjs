function arrayIndex(value) {
  if (typeof value !== "string" || !/^(0|[1-9]\d*)$/u.test(value)) return;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 && number < 4_294_967_295 &&
    String(number) === value ? number : undefined;
}
export function canonicalOwnPropertyKeyOrder(keys) {
  const indices = [], strings = [], symbols = [];
  for (const key of keys) {
    if (typeof key !== "string") symbols.push(key);
    else if (arrayIndex(key) !== undefined) indices.push(key);
    else strings.push(key);
  }
  indices.sort((left, right) => Number(left) - Number(right));
  return Object.freeze([...indices, ...strings, ...symbols]);
}
function domainCoverage(coverage, domain, propertyKeys) {
  const empty = propertyKeys.emptyCoverage();
  return Object.freeze({
    string: domain === "string" ? coverage.string : empty.string,
    symbol: domain === "symbol" ? coverage.symbol : empty.symbol,
  });
}
function represented(coverage, domain) {
  return coverage?.[domain]?.unbounded ||
    coverage?.[domain]?.finiteTypes?.length > 0;
}
function mayBePresent(descriptor) {
  return !descriptor?.alternatives ||
    descriptor.alternatives.some(({ kind }) => kind !== "absent");
}
function tailCoverage(remainder, domain, propertyKeys) {
  const total = remainder.coverage?.[domain];
  if (!total) return;
  const finiteTypes = [...(total.finiteTypes ?? [])];
  const typeIds = [...(total.typeIds ?? [])];
  if (!total.unbounded && finiteTypes.length === 0) return;
  const coverage = propertyKeys.emptyCoverage();
  return Object.freeze({ ...coverage, [domain]: Object.freeze({
    finiteTypes: Object.freeze(finiteTypes), typeIds: Object.freeze(typeIds),
    unbounded: total.unbounded,
  }) });
}
function entryCursors(remainder, propertyKeys) {
  const entries = [...(remainder.entries ?? [])].sort((left, right) =>
    left.order - right.order || left.id.localeCompare(right.id));
  const presentEntries = entries.filter(({ descriptor }) => mayBePresent(descriptor));
  const cursors = [];
  for (const domain of ["string", "symbol"]) {
    for (const entry of presentEntries) if (represented(entry.coverage, domain)) {
      const coverage = domainCoverage(entry.coverage, domain, propertyKeys);
      cursors.push(Object.freeze({ alternatives: Object.freeze([]), coverage,
        dynamicId: entry.id, kind: "PropertyKeyFact", remainderEntry: entry.id,
        unbounded: coverage[domain].unbounded }));
    }
    const coverage = tailCoverage(remainder, domain, propertyKeys);
    if (coverage) {
      cursors.push(Object.freeze({ alternatives: Object.freeze([]), coverage,
        kind: "PropertyKeyFact", remainderDomain: domain,
        unbounded: coverage[domain].unbounded }));
    }
  }
  return cursors;
}
export function createToolcraftOwnPropertyKeys({ memory, propertyKeys }) {
  function snapshot(sourceFact, state) {
    return memory.ownDescriptorsFromFact(sourceFact, state).map((owner) => {
      const exact = canonicalOwnPropertyKeyOrder([...owner.descriptors]
        .filter(([, descriptor]) => mayBePresent(descriptor))
        .map(([key]) => key));
      const entries = entryCursors(owner.propertyRemainder, propertyKeys);
      const indices = exact.filter((key) => typeof key === "string" &&
        arrayIndex(key) !== undefined);
      const exactStrings = exact.filter((key) => typeof key === "string" &&
        arrayIndex(key) === undefined).map((cursor, position) => ({ cursor,
          domain: "string", order: owner.descriptors.get(cursor)?.insertionOrder ??
            position + 1 }));
      const exactSymbols = exact.filter((key) => typeof key !== "string")
        .map((cursor, position) => ({ cursor, domain: "symbol",
          order: owner.descriptors.get(cursor)?.insertionOrder ??
            position + 1 }));
      const remainderCursors = entries.map((cursor) => ({ cursor,
        domain: represented(cursor.coverage, "string") ? "string" : "symbol",
        order: owner.propertyRemainder.entries.find(({ id }) =>
          id === cursor.remainderEntry)?.order ?? Number.MAX_SAFE_INTEGER }));
      const ordered = [...exactStrings, ...exactSymbols, ...remainderCursors]
        .sort((left, right) => left.domain.localeCompare(right.domain) ||
          left.order - right.order || String(left.cursor?.dynamicId ?? left.cursor)
            .localeCompare(String(right.cursor?.dynamicId ?? right.cursor)));
      return Object.freeze({ cursors: Object.freeze([
        ...indices, ...ordered.map(({ cursor }) => cursor),
      ]), entries, ownerFact: owner.ownerFact, state });
    });
  }
  return Object.freeze({ snapshot });
}
