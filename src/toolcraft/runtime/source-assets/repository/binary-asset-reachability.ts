import type { ToolcraftBinaryAssetRepositoryEntry } from "./binary-asset-repository";

export function expandToolcraftBinaryAssetReachability(
  rootRefs: ReadonlySet<string>,
  entries: Iterable<ToolcraftBinaryAssetRepositoryEntry>,
): ReadonlySet<string> {
  const entryByRef = new Map(
    [...entries].map((entry) => [entry.ref, entry] as const),
  );
  const reachable = new Set(rootRefs);
  const pending = [...rootRefs];

  while (pending.length > 0) {
    const ref = pending.pop()!;
    const entry = entryByRef.get(ref);
    if (!entry) continue;

    for (const dependency of entry.dependencies) {
      if (reachable.has(dependency)) continue;
      reachable.add(dependency);
      pending.push(dependency);
    }
  }

  return new Set([...reachable].sort());
}
