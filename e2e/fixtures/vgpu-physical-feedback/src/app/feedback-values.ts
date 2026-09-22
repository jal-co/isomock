export function getPhysicalFeedbackImpulse(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.min(1, Math.max(0.1, numeric)) : 0.35;
}

export function getPhysicalFeedbackRenderScale(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.min(2, Math.max(1, numeric)) : 2;
}

export function getPhysicalFeedbackBackground(value: unknown): string {
  if (typeof value === "string") return value;
  if (
    typeof value === "object" &&
    value !== null &&
    "hex" in value &&
    typeof value.hex === "string"
  ) {
    return value.hex;
  }
  return "#141F38";
}

export function getPhysicalFeedbackReplaySteps(timeSeconds: number): number {
  if (!Number.isFinite(timeSeconds)) return 1;
  return 1 + Math.min(24, Math.max(0, Math.floor(timeSeconds * 12)));
}
