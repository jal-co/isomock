export type ToolcraftWorkloadSource =
  | {
      kind: "schema-target";
      target: string;
      workloadBoundary?: "minimum" | "maximum";
    }
  | { kind: "runtime-state"; path: string }
  | { kind: "external-input"; id: string }
  | { kind: "derived"; inputs: readonly string[] };

export type ToolcraftWorkloadDimension = {
  batchMax?: number;
  customMappingReason?: string;
  defaultValue: number;
  id: string;
  interactiveMax?: number;
  mapping: "direct" | "area" | "quadratic" | "custom";
  source: ToolcraftWorkloadSource;
  unit: string;
};

export type ToolcraftWorkloadEnvelope = {
  dimensions: readonly ToolcraftWorkloadDimension[];
};

export {
  TOOLCRAFT_PERFORMANCE_PROFILE_NAMES,
  isToolcraftPerformanceProfileName,
} from "../performance/profile-catalog";
export type { ToolcraftPerformanceProfileName } from "../performance/profile-catalog";
export type {
  ToolcraftRenderPassCost,
  ToolcraftRenderPassLifecycle,
} from "../rendering/renderer-pipeline-registration";
