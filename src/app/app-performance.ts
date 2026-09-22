import {
  defineToolcraftPerformance,
  type ToolcraftEnvelopePerformanceConfig,
} from "@/toolcraft/runtime";

export const appPerformance: ToolcraftEnvelopePerformanceConfig =
  defineToolcraftPerformance({
    rendererStrategy: "none",
    scenarios: [],
    usesCustomRenderer: false,
    workloadEnvelope: { dimensions: [] },
  });
