export type AnyRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is AnyRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function asString(value: unknown, fallback = ""): string {
  if (typeof value === "string") {
    return value;
  }

  return typeof value === "number" && Number.isFinite(value) ? String(value) : fallback;
}

export function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function asNumberArray(
  value: unknown,
  fallback: readonly number[],
): readonly number[] {
  return Array.isArray(value) && value.every((item) => typeof item === "number")
    ? value
    : fallback;
}
