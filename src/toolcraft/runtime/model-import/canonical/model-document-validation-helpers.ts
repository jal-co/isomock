export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function isDenseArray(value: unknown): value is readonly unknown[] {
  if (!Array.isArray(value)) {
    return false;
  }

  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) {
      return false;
    }
  }

  return true;
}

export function isNonemptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

