import type { ToolcraftCapabilityProofRecipe } from "./types";

export const timelinePlaybackCapabilityProof = Object.freeze({
  capabilityId: "timeline.playback",
  ownerId: "timeline",
  proof: Object.freeze({ kind: "timeline", mode: "playback" }),
} satisfies ToolcraftCapabilityProofRecipe);
