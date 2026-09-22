export function normalizeToolcraftAdditionalValueTargets(
  targets: readonly string[] | undefined,
): readonly string[] {
  const normalizedTargets = new Set<string>();

  for (const target of targets ?? []) {
    const normalizedTarget = target.trim();

    if (normalizedTarget) {
      normalizedTargets.add(normalizedTarget);
    }
  }

  return Object.freeze([...normalizedTargets]);
}
