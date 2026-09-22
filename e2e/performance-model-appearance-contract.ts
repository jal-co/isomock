export const TOOLCRAFT_MODEL_APPEARANCE_PERFORMANCE_PASSES = Object.freeze([
  Object.freeze({ execution: "worker", id: "package-extraction" }),
  Object.freeze({ execution: "worker", id: "canonical-decode" }),
  Object.freeze({ execution: "main-thread", id: "model-presentation" }),
  Object.freeze({ execution: "main-thread", id: "canvas-orbit" }),
  Object.freeze({ execution: "main-thread", id: "export" }),
  Object.freeze({ execution: "main-thread", id: "resource-cleanup" }),
] as const);

export type ToolcraftModelAppearancePerformancePassId =
  typeof TOOLCRAFT_MODEL_APPEARANCE_PERFORMANCE_PASSES[number]["id"];
