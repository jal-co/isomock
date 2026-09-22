export function getToolcraftPersistedValueTargets(
  defaults: Record<string, unknown>,
  additionalValueTargets: readonly string[],
): readonly string[] {
  return [...new Set([...Object.keys(defaults), ...additionalValueTargets])];
}
