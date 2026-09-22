import type { ToolcraftCapabilityProofRecipe } from "./types";

export const canvasEditingCapabilityProof = Object.freeze({
  capabilityId: "canvas.editing",
  ownerId: "canvas-editing",
  proof: Object.freeze({ kind: "canvas-editing" }),
} satisfies ToolcraftCapabilityProofRecipe);
