import { isToolcraftFiniteNumber, isToolcraftPersistenceRecord } from "./persistence-shared";
import { readCanvasSize, readPoint } from "./persistence-reader-primitives";
import type { ToolcraftCanvasState } from "./types";

export function readCanvas(value: unknown): Partial<ToolcraftCanvasState> | undefined {
  if (!isToolcraftPersistenceRecord(value)) {
    return undefined;
  }

  const canvas: Partial<ToolcraftCanvasState> = {};
  const offset = readPoint(value.offset);
  const size = readCanvasSize(value.size);

  if (value.mode === "finite" || value.mode === "infinite") {
    canvas.mode = value.mode;
  }

  if (offset) {
    canvas.offset = offset;
  }

  if (size) {
    canvas.size = size;
  }

  if (isToolcraftFiniteNumber(value.zoom)) {
    canvas.zoom = value.zoom;
  }

  return Object.keys(canvas).length > 0 ? canvas : undefined;
}
