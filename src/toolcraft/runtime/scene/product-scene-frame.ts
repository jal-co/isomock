import type { ReadonlyToolcraftState } from "../state/readonly-state";
import {
  resolveToolcraftProductSceneBounds,
  type ToolcraftProductSceneBoundsProvider,
  type ToolcraftSceneRect,
} from "./scene-bounds";

export type ToolcraftProductSceneFrame =
  | Readonly<{ kind: "ready"; rect: ToolcraftSceneRect }>
  | Readonly<{ kind: "empty" | "unavailable"; rect: null }>;

export function resolveToolcraftProductSceneFrame({
  boundsProvider,
  fallbackRect,
  state,
}: Readonly<{
  boundsProvider?: ToolcraftProductSceneBoundsProvider;
  fallbackRect?: ToolcraftSceneRect;
  state: ReadonlyToolcraftState;
}>): ToolcraftProductSceneFrame {
  if (!boundsProvider) {
    return fallbackRect
      ? { kind: "ready", rect: fallbackRect }
      : { kind: "unavailable", rect: null };
  }

  try {
    const result = resolveToolcraftProductSceneBounds(
      boundsProvider({ state }),
    );
    return result.ok
      ? { kind: "ready", rect: result.bounds }
      : {
          kind: result.code === "empty-scene" ? "empty" : "unavailable",
          rect: null,
        };
  } catch {
    return { kind: "unavailable", rect: null };
  }
}

export function toolcraftProductSceneFramesEqual(
  previous: ToolcraftProductSceneFrame,
  next: ToolcraftProductSceneFrame,
): boolean {
  if (previous.kind !== next.kind) return false;
  if (previous.kind !== "ready" || next.kind !== "ready") return true;

  return (
    Object.is(previous.rect.height, next.rect.height) &&
    Object.is(previous.rect.width, next.rect.width) &&
    Object.is(previous.rect.x, next.rect.x) &&
    Object.is(previous.rect.y, next.rect.y)
  );
}
