function equalJsonValues(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key) =>
        Object.hasOwn(right, key) &&
        equalJsonValues(
          (left as Record<string, unknown>)[key],
          (right as Record<string, unknown>)[key],
        ),
    )
  );
}

// Codec read/write may reorder object keys. Array order and every saved value matter.
export function equalToolcraftPersistenceSnapshots(
  left: string | null,
  right: string | null,
): boolean {
  if (left === right) return true;
  if (left === null || right === null) return false;
  try {
    return equalJsonValues(JSON.parse(left), JSON.parse(right));
  } catch {
    return false;
  }
}
