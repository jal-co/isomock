const MAX_COVERAGE_TYPES = 8;
export function createToolcraftPropertyKeyIdentities({ checker, index, ts }) {
  const registry = new Map();
  const strings = new Map();
  const symbols = new WeakMap();
  let nextSymbol = 0;

  function stringKey(value) {
    const text = String(value);
    let key = strings.get(text);
    if (!key) {
      key = Object.freeze({ id: `string:${text.length}:${text}`,
        kind: "string", value: text });
      strings.set(text, key);
    }
    return key;
  }

  function symbolKey(value, registryKey) {
    const identity = index.unwrap(value);
    let key = symbols.get(identity);
    if (!key) {
      key = Object.freeze({ id: registryKey
          ? `symbol-for:${registryKey.length}:${registryKey}`
          : `symbol:${nextSymbol += 1}`,
        identity, kind: "symbol", registryKey });
      symbols.set(identity, key);
    }
    return key;
  }

  function registrySymbol(text) {
    let key = registry.get(text);
    if (!key) {
      const identity = ts.factory.createIdentifier(
        `__toolcraft_symbol_for_${registry.size + 1}`,
      );
      key = symbolKey(identity, text);
      registry.set(text, key);
    }
    return key;
  }

  function keyForIdentity(value) {
    return symbols.get(index.unwrap(value));
  }

  function keyForType(type) {
    if (typeof type?.value === "string" || typeof type?.value === "number") {
      return stringKey(type.value);
    }
    if ((type?.flags & ts.TypeFlags.UniqueESSymbol) === 0) return undefined;
    const declaration = type.symbol?.valueDeclaration ?? type.symbol?.declarations?.[0];
    return declaration ? symbolKey(declaration) : undefined;
  }

  function domainForType(type) {
    if ((type?.flags & (ts.TypeFlags.StringLike | ts.TypeFlags.NumberLike)) !== 0) {
      return "string";
    }
    if ((type?.flags & ts.TypeFlags.ESSymbolLike) !== 0) return "symbol";
  }

  function coverageDomain(finiteTypes = [], unbounded = false) {
    const identity = (type) => Number.isInteger(type?.id)
      ? `type:${type.id}` : checker.typeToString(type);
    const unique = new Map(finiteTypes.map((type) => [identity(type), type]));
    const retained = [...unique.entries()].sort(([left], [right]) =>
      left.localeCompare(right)).slice(0, MAX_COVERAGE_TYPES);
    return Object.freeze({ finiteTypes: Object.freeze(retained.map(([, type]) =>
      type)), typeIds: Object.freeze(retained.map(([id]) => id)),
      unbounded: unbounded || unique.size > MAX_COVERAGE_TYPES });
  }

  function emptyCoverage() {
    const domain = () => coverageDomain();
    return Object.freeze({ string: domain(), symbol: domain() });
  }

  function coverageIntersects(left, right, kind) {
    const first = left?.[kind], second = right?.[kind];
    if (!first || !second) return false;
    if (first.unbounded || second.unbounded) return true;
    const ids = new Set(first.typeIds ?? []);
    return (second.typeIds ?? []).some((id) => ids.has(id));
  }

  function mergeCoverage(left = emptyCoverage(), right = emptyCoverage()) {
    return Object.freeze({
      string: coverageDomain([...left.string.finiteTypes,
        ...right.string.finiteTypes], left.string.unbounded || right.string.unbounded),
      symbol: coverageDomain([...left.symbol.finiteTypes,
        ...right.symbol.finiteTypes], left.symbol.unbounded || right.symbol.unbounded),
    });
  }

  return Object.freeze({ coverageDomain, coverageIntersects, domainForType,
    emptyCoverage, keyForIdentity, keyForType, mergeCoverage, registrySymbol,
    stringKey, symbolKey });
}
