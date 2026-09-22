export function isToolcraftGpuTechniqueRecord(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function hasExactToolcraftGpuTechniqueKeys(
  record: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const actualKeys = Reflect.ownKeys(record);
  return (
    actualKeys.length === keys.length &&
    keys.every((key) => Object.prototype.hasOwnProperty.call(record, key))
  );
}

export function validateToolcraftGpuExceptionShape(
  value: unknown,
  kinds: ReadonlySet<string>,
  path: string,
): Readonly<{ errors: readonly string[]; valid: boolean }> {
  if (
    !isToolcraftGpuTechniqueRecord(value) ||
    !hasExactToolcraftGpuTechniqueKeys(value, ["evidence", "kind"])
  ) {
    return { errors: [`${path} must contain exactly evidence and kind.`], valid: false };
  }

  const errors: string[] = [];
  const evidenceValid =
    typeof value.evidence === "string" &&
    value.evidence === value.evidence.trim() &&
    value.evidence.length >= 12;
  if (!evidenceValid) {
    errors.push(`${path} must provide trimmed evidence of at least 12 characters.`);
  }
  const kindValid = typeof value.kind === "string" && kinds.has(value.kind);
  if (!kindValid) {
    errors.push(`${path}.kind is not permitted for this GPU provider/backend.`);
  }

  return { errors, valid: evidenceValid && kindValid };
}
