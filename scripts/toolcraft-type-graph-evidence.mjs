const DEFAULT_MAX_DEPTH = 24;
const DEFAULT_MAX_VISITS = 256;

export function createToolcraftTypeGraphEvidence({
  childrenOf,
  classify,
  dangerous,
  maxDepth = DEFAULT_MAX_DEPTH,
  maxVisits = DEFAULT_MAX_VISITS,
  safe,
  unknown,
}) {
  const rootCache = new Map();
  function merge(values) {
    return values.includes(dangerous) ? dangerous
      : values.includes(unknown) ? unknown : safe;
  }

  return function inspectTypeGraph(type) {
    if (rootCache.has(type)) return rootCache.get(type);
    const memo = new Map();
    const state = { count: 0 };
    function inspect(candidate, remaining, visiting) {
      if (!candidate) return unknown;
      const direct = classify(candidate);
      if (direct) return direct;
      if (remaining <= 0 || state.count >= maxVisits) return unknown;
      const cached = memo.get(candidate)?.get(remaining);
      if (cached) return cached;
      if (visiting.has(candidate)) return safe;
      state.count += 1;
      const nextVisiting = new Set(visiting).add(candidate);
      const result = merge(childrenOf(candidate).map((child) =>
        inspect(child, remaining - 1, nextVisiting)
      ));
      if (result !== unknown) {
        const byBudget = memo.get(candidate) ?? new Map();
        byBudget.set(remaining, result);
        memo.set(candidate, byBudget);
      }
      return result;
    }
    const result = inspect(type, maxDepth, new Set());
    rootCache.set(type, result);
    return result;
  };
}
