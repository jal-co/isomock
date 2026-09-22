import type { ToolcraftRendererStrategy } from "./performance-types";

export type UnknownRecord = Record<string, unknown>;

export const rendererStrategies = new Set<ToolcraftRendererStrategy>([
  "none",
  "dom",
  "svg",
  "canvas-2d",
  "webgl",
  "webgpu",
]);

export function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isTrimmedNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value === value.trim();
}

export function isFinitePositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function formatValue(value: unknown): string {
  try {
    return String(value);
  } catch {
    return "<unprintable>";
  }
}

export function stableWorkloadEntries(
  value: unknown,
): readonly (readonly [string, number])[] {
  if (!isRecord(value)) {
    return [];
  }
  return Object.entries(value)
    .filter((entry): entry is [string, number] => typeof entry[1] === "number")
    .sort(([left], [right]) => compareCodeUnits(left, right));
}

export function workloadsEqual(left: unknown, right: unknown): boolean {
  const leftEntries = stableWorkloadEntries(left);
  const rightEntries = stableWorkloadEntries(right);
  return (
    leftEntries.length === rightEntries.length &&
    leftEntries.every(
      ([key, value], index) =>
        key === rightEntries[index]?.[0] && value === rightEntries[index]?.[1],
    )
  );
}

export function formatWorkload(
  workload: Readonly<Record<string, number>>,
): string {
  return JSON.stringify(Object.fromEntries(stableWorkloadEntries(workload)));
}
