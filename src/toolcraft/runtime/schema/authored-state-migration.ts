import type { ToolcraftCanvasSize } from "./types";

export type ToolcraftAuthoredStateMigrationInput = Readonly<{
  source: "defaults" | "persistence" | "settings";
  sourceVersion: number;
  values: Readonly<Record<string, unknown>>;
  canvas: Readonly<{
    mode: "finite" | "infinite";
    size: Readonly<ToolcraftCanvasSize>;
  }>;
  /** Raw admitted timeline data, before canonical keyframe normalization. */
  timeline: Readonly<Record<string, unknown>> | undefined;
}>;

export type ToolcraftAuthoredStateMigrationResult = Readonly<{
  values: Readonly<Record<string, unknown>>;
  /** Omit to preserve the original timeline. Settings still require their portable timeline shape. */
  timeline?: Readonly<Record<string, unknown>>;
}>;

/** Pure, synchronous and idempotent. Throw to reject unsupported legacy authored data. */
export type ToolcraftAuthoredStateMigration = (
  input: ToolcraftAuthoredStateMigrationInput,
) => ToolcraftAuthoredStateMigrationResult;
