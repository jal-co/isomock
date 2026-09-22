import type { ResolvedToolcraftAppSchema } from "../schema/resolved-app-schema";
import type { ReadonlyToolcraftState } from "./readonly-state";
import type {
  ToolcraftCanvasState,
  ToolcraftHistoryPatch,
} from "./types";
import { toolcraftCanvasInfinityTarget } from "../schema/runtime-targets";
import { tagToolcraftCanvasStateHistoryPatch } from "./history-patch-metadata";

export { toolcraftCanvasInfinityTarget };

export type ToolcraftCanvasMode = "finite" | "infinite";

export type ToolcraftCanvasFrame =
  | Readonly<{ kind: "finite"; size: ToolcraftCanvasState["size"] }>
  | Readonly<{ kind: "infinite" }>;

export type ToolcraftCanvasRuntimeTargetRead =
  | Readonly<{ handled: false }>
  | Readonly<{ handled: true; value: boolean }>;

export function normalizeToolcraftCanvasMode(
  value: unknown,
): ToolcraftCanvasMode {
  return value === "infinite" ? "infinite" : "finite";
}

export function getToolcraftDefaultCanvasMode(
  canvas: ResolvedToolcraftAppSchema["canvas"],
): ToolcraftCanvasMode {
  return canvas.sizing.mode === "editable-output" &&
    canvas.sizing.defaultMode === "infinite"
    ? "infinite"
    : "finite";
}

export function getToolcraftCanvasFrame(
  canvas: ToolcraftCanvasState,
): ToolcraftCanvasFrame {
  return canvas.mode === "finite"
    ? Object.freeze({ kind: "finite", size: canvas.size })
    : Object.freeze({ kind: "infinite" });
}

export function readToolcraftCanvasRuntimeTarget(
  state: ReadonlyToolcraftState,
  target: string,
): ToolcraftCanvasRuntimeTargetRead {
  return target === toolcraftCanvasInfinityTarget
    ? { handled: true, value: state.canvas.mode === "infinite" }
    : { handled: false };
}

export function createToolcraftCanvasModePatch(
  canvas: ToolcraftCanvasState,
  mode: ToolcraftCanvasMode,
): ToolcraftHistoryPatch | null {
  if (canvas.mode === mode) {
    return null;
  }

  if (mode === "infinite") {
    return tagToolcraftCanvasStateHistoryPatch({
      after: { "canvas.mode": "infinite" },
      before: { "canvas.mode": "finite" },
      label: "Enable Infinity canvas",
    });
  }

  return tagToolcraftCanvasStateHistoryPatch({
    after: { "canvas.mode": "finite" },
    before: { "canvas.mode": "infinite" },
    label: "Disable Infinity canvas",
  });
}
