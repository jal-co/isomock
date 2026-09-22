import type { ToolcraftCapabilityProofRecipe } from "./types";

export const model3dCapabilityProof = Object.freeze({
  capabilityId: "model.3d",
  ownerId: "model-3d",
  proof: Object.freeze({ kind: "model-3d" }),
} satisfies ToolcraftCapabilityProofRecipe);
