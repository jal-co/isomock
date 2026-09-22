import type { ToolcraftCapabilityProofRecipe } from "./types";

export const mediaSourceCapabilityProof = Object.freeze({
  capabilityId: "media.source",
  ownerId: "media-source",
  proof: Object.freeze({ kind: "media-source", persistenceSlice: "media" }),
} satisfies ToolcraftCapabilityProofRecipe);
