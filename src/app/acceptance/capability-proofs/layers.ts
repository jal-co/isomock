import type { ToolcraftCapabilityProofRecipe } from "./types";

export const layersCapabilityProof = Object.freeze({
  capabilityId: "layers.management",
  ownerId: "layers",
  proof: Object.freeze({ kind: "layers" }),
} satisfies ToolcraftCapabilityProofRecipe);
