import {
  TOOLCRAFT_CANVAS_RENDER_SCALE,
  type ResolvedToolcraftAppSchema,
  type ToolcraftPerformancePath,
} from "@/toolcraft/runtime";

import type {
  ToolcraftPerformanceCanvasBacking,
  ToolcraftPerformancePathAdapter,
} from "./performance-path-adapter-contract";

export type ToolcraftCompiledPerformancePathAdapter = Readonly<{
  adapter: ToolcraftPerformancePathAdapter;
  canvasBacking: ToolcraftPerformanceCanvasBacking | undefined;
  path: ToolcraftPerformancePath;
  testName: string;
}>;

type MatrixInput = Readonly<{
  adapters: readonly ToolcraftPerformancePathAdapter[];
  canvasBacking: ToolcraftPerformanceCanvasBacking | undefined;
  paths: readonly ToolcraftPerformancePath[];
  schema: ResolvedToolcraftAppSchema;
}>;

function compileCanvasBacking(canvasBacking: unknown): ToolcraftPerformanceCanvasBacking {
  if (typeof canvasBacking !== "object" || canvasBacking === null || Array.isArray(canvasBacking)) {
    throw new Error("Toolcraft performance canvas backing must be a non-null object.");
  }
  const keys = Reflect.ownKeys(canvasBacking);
  if (keys.length !== 1 || keys[0] !== "canvasSelector") {
    throw new Error('Toolcraft performance canvas backing must contain exactly one "canvasSelector" field.');
  }
  const descriptor = Object.getOwnPropertyDescriptor(canvasBacking, "canvasSelector");
  if (!descriptor || !("value" in descriptor)) {
    throw new Error("Toolcraft performance canvas backing canvasSelector must be a data property.");
  }
  const value = descriptor.value;
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) {
    throw new Error("Toolcraft performance canvas backing canvasSelector must be a non-empty trimmed string.");
  }
  return Object.freeze({ canvasSelector: value });
}

function compileCanvasBoundary({ canvasBacking, schema }: MatrixInput) {
  if (canvasBacking === undefined) {
    if (!schema.canvas.renderScale.enabled) return undefined;
    throw new Error("Toolcraft render-scale-enabled performance catalogs require one product canvas selector for 2x backing proof.");
  }
  if (!schema.canvas.renderScale.enabled) {
    throw new Error("Toolcraft performance canvas backing proof must be omitted when canvas render scale is disabled.");
  }
  return compileCanvasBacking(canvasBacking);
}

export function getToolcraftPerformancePathTestName(
  path: Pick<ToolcraftPerformancePath, "id">,
): string {
  return `browser perf: toolcraft path ${path.id}`;
}

export function getToolcraftPerformancePathSettleFrames(
  path: Pick<ToolcraftPerformancePath, "interaction">,
): number | undefined {
  return path.interaction === "animation-frame" || path.interaction === "export"
    ? undefined : 20;
}

const productOutcomeInteractions = new Set<ToolcraftPerformancePath["interaction"]>([
  "control-change", "control-drag", "mask-drag", "media-import",
  "timeline-playback", "timeline-scrub",
]);

export function compileToolcraftPerformancePathAdapterMatrix(
  input: MatrixInput,
): readonly ToolcraftCompiledPerformancePathAdapter[] {
  const canvasBacking = compileCanvasBoundary(input);
  const paths = [...input.paths].sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
  const pathIds = new Set(paths.map((path) => path.id));
  if (pathIds.size !== paths.length) {
    throw new Error("Toolcraft performance path matrix received duplicate canonical path ids.");
  }
  const adapters = new Map<string, ToolcraftPerformancePathAdapter>();
  for (const adapter of input.adapters) {
    if (adapters.has(adapter.pathId)) {
      throw new Error(`Toolcraft performance path matrix has a duplicate adapter for "${adapter.pathId}".`);
    }
    if (!pathIds.has(adapter.pathId)) {
      throw new Error(`Toolcraft performance path matrix has an orphan adapter for "${adapter.pathId}".`);
    }
    adapters.set(adapter.pathId, adapter);
  }
  const missing = paths.map((path) => path.id).filter((id) => !adapters.has(id));
  if (missing.length > 0) {
    throw new Error(`Toolcraft performance path matrix is missing adapter${missing.length === 1 ? "" : "s"} for: ${missing.join(", ")}.`);
  }
  for (const path of paths) {
    const adapter = adapters.get(path.id)!;
    if (adapter.preparationRenderScale !== undefined && (!canvasBacking ||
      !path.targets.includes("canvas.renderScale") || !Number.isFinite(adapter.preparationRenderScale) ||
      adapter.preparationRenderScale < TOOLCRAFT_CANVAS_RENDER_SCALE.min ||
      adapter.preparationRenderScale > TOOLCRAFT_CANVAS_RENDER_SCALE.max)) {
      throw new Error(`Toolcraft performance path "${path.id}" has an invalid preparation render scale.`);
    }
    if (path.interaction === "export" && !adapter.output) {
      throw new Error(`Toolcraft export performance path "${path.id}" requires a protected output completion adapter.`);
    }
    if (path.interaction !== "export" && adapter.output) {
      throw new Error(`Toolcraft non-export performance path "${path.id}" must use an interaction action.`);
    }
    if (productOutcomeInteractions.has(path.interaction) && !adapter.observeOutcome) {
      throw new Error(`Toolcraft performance path "${path.id}" requires an observable product outcome.`);
    }
  }
  return Object.freeze(paths.map((path) => Object.freeze({
    adapter: adapters.get(path.id)!, canvasBacking, path,
    testName: getToolcraftPerformancePathTestName(path),
  })));
}
