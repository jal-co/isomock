import type {
  ToolcraftPerformanceCanvasBacking,
  ToolcraftPerformancePathAdapter,
} from "./performance-path-adapter-contract";

export const appPerformanceCanvasBacking:
  | ToolcraftPerformanceCanvasBacking
  | undefined = undefined;

export const appPerformancePathAdapters =
  [] as const satisfies readonly ToolcraftPerformancePathAdapter[];
