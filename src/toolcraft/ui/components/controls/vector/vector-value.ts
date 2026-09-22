export function clamp(value: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, value));
}

export function normalizeVectorCoordinate(value: string | undefined): string {
  return typeof value === "string" && value.trim() ? value : "0.00";
}

export function formatVectorPadCoordinate(value: string | undefined): string {
  const parsedValue = Number.parseFloat(normalizeVectorCoordinate(value));

  if (!Number.isFinite(parsedValue)) {
    return "0.00";
  }

  const roundedValue = Math.abs(parsedValue) < 0.005 ? 0 : clamp(parsedValue, -1, 1);

  return roundedValue.toFixed(2);
}

export function parseVectorCoordinateDraft(value: string): string | null {
  const draft = value.trim().replace("−", "-");
  if (!/^[+-]?(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:[eE][+-]?\d+)?$/.test(draft)) return null;
  const number = Number(draft.replace(",", "."));
  return Number.isFinite(number) ? clamp(number, -1, 1).toFixed(2) : null;
}
