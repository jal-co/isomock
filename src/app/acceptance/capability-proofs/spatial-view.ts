import type { ToolcraftCapabilityProofRecipe } from "./types";

export const spatialViewCapabilityProof = Object.freeze({
  capabilityId: "spatial.view",
  ownerId: "spatial-view",
  proof: Object.freeze({ kind: "spatial-view" }),
} satisfies ToolcraftCapabilityProofRecipe);
