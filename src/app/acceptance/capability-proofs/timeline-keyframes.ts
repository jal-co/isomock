import type { ToolcraftCapabilityProofRecipe } from "./types";

export const timelineKeyframesCapabilityProof = Object.freeze({
  capabilityId: "timeline.keyframes",
  ownerId: "timeline",
  proof: Object.freeze({ kind: "timeline", mode: "keyframes" }),
} satisfies ToolcraftCapabilityProofRecipe);
