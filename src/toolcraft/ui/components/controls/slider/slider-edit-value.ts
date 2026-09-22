const numberPattern = "[-+−]?(?:\\d+(?:[.,]\\d*)?|[.,]\\d+)(?:[eE][-+]?\\d+)?";

/** Strict numeric editing: never salvage a number from malformed input. */
export function parseSliderEditValue(draft: string, pair: boolean, unit?: string): number[] | undefined {
  const suffix = unit?.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const token = `(${numberPattern})${suffix ? `(?:\\s*${suffix})?` : ""}`;
  const pattern = pair ? `^\\s*${token}\\s*(?:/|[-‐‑‒–—−])\\s*${token}\\s*$` : `^\\s*${token}\\s*$`;
  const match = draft.match(new RegExp(pattern, "u"));
  if (!match) return undefined;
  const values = match.slice(1).map(value => Number(value.replace("−", "-").replace(",", ".")));
  return values.every(Number.isFinite) ? values : undefined;
}
