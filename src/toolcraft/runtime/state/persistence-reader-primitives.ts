import { isToolcraftFiniteNumber, isToolcraftPersistenceRecord } from "./persistence-shared";
import type { ToolcraftCanvasState } from "./types";

export function readPoint(value: unknown): { x: number; y: number } | undefined {
  if (
    !isToolcraftPersistenceRecord(value) ||
    !isToolcraftFiniteNumber(value.x) ||
    !isToolcraftFiniteNumber(value.y)
  ) {
    return undefined;
  }

  return { x: value.x, y: value.y };
}

export function readCanvasSize(value: unknown): ToolcraftCanvasState["size"] | undefined {
  if (
    !isToolcraftPersistenceRecord(value) ||
    !isToolcraftFiniteNumber(value.width) ||
    !isToolcraftFiniteNumber(value.height) ||
    value.unit !== "px"
  ) {
    return undefined;
  }

  return { height: value.height, unit: "px", width: value.width };
}
