import type {
  ResolvedProductModulePlan,
  ResolvedToolcraftAppSchema,
  ToolcraftArtifactExportActionRole,
  ToolcraftPersistableStateSlice,
  ToolcraftProductCapabilityId,
  ToolcraftTimelineMode,
} from "@/toolcraft/runtime";

import type { ToolcraftPersistenceCoverageResult } from "../runtime-coverage";
import type {
  ToolcraftComponentAcceptance,
  ToolcraftExportArtifactCoverage,
  ToolcraftProductReadiness,
  ToolcraftVisibleControl,
} from "../types";

export type ToolcraftCapabilityProofOwnerId =
  | "artifact-export"
  | "canvas-editing"
  | "layers"
  | "masks"
  | "media-source"
  | "model-3d"
  | "spatial-view"
  | "timeline";

type ToolcraftCapabilityProofDescriptorByOwner = {
  "artifact-export": Readonly<{
    coverage: ToolcraftExportArtifactCoverage;
    kind: "artifact-export";
    role: ToolcraftArtifactExportActionRole;
  }>;
  "canvas-editing": Readonly<{ kind: "canvas-editing" }>;
  layers: Readonly<{ kind: "layers" }>;
  masks: Readonly<{ kind: "masks" }>;
  "media-source": Readonly<{
    kind: "media-source";
    persistenceSlice: ToolcraftPersistableStateSlice;
  }>;
  "model-3d": Readonly<{ kind: "model-3d" }>;
  "spatial-view": Readonly<{ kind: "spatial-view" }>;
  timeline: Readonly<{
    kind: "timeline";
    mode: "keyframes" | "playback";
  }>;
};

export type ToolcraftCapabilityProofRecipe = {
  [OwnerId in ToolcraftCapabilityProofOwnerId]: Readonly<{
    capabilityId: ToolcraftProductCapabilityId;
    ownerId: OwnerId;
    proof: ToolcraftCapabilityProofDescriptorByOwner[OwnerId];
  }>;
}[ToolcraftCapabilityProofOwnerId];
export type ToolcraftCapabilityProofCatalog = Readonly<
  Record<ToolcraftProductCapabilityId, ToolcraftCapabilityProofRecipe>
>;

export type ToolcraftCapabilityProofValidationContext = Readonly<{
  acceptance: readonly ToolcraftComponentAcceptance[];
  controls: readonly ToolcraftVisibleControl[];
  layersEnabled: boolean;
  persistence: ToolcraftPersistenceCoverageResult;
  productReadiness: ToolcraftProductReadiness;
  schema: ResolvedToolcraftAppSchema;
  timelineMode: ToolcraftTimelineMode | null;
}>;

export type ToolcraftCapabilityProofOwnerInput = Readonly<{
  activeCapabilities: readonly ToolcraftProductCapabilityId[];
  context: ToolcraftCapabilityProofValidationContext;
  recipes: readonly ToolcraftCapabilityProofRecipe[];
}>;

export type ToolcraftCapabilityProofOwner = (
  input: ToolcraftCapabilityProofOwnerInput,
) => readonly string[];

export type ToolcraftCapabilityProofOwnerRegistry = Readonly<
  Record<ToolcraftCapabilityProofOwnerId, ToolcraftCapabilityProofOwner>
>;

export type ToolcraftCapabilityProofValidationInput = Readonly<{
  context: ToolcraftCapabilityProofValidationContext;
  plan: ResolvedProductModulePlan;
}>;
