import { TOOLCRAFT_ARTIFACT_CAPABILITY_PROOFS_BY_ROLE } from "../export-artifact-coverage";
import type { ToolcraftCapabilityProofRecipe } from "./types";

const descriptor = TOOLCRAFT_ARTIFACT_CAPABILITY_PROOFS_BY_ROLE["export-video"];

export const videoExportCapabilityProof = Object.freeze({
  capabilityId: descriptor.capabilityId,
  ownerId: "artifact-export",
  proof: descriptor.proof,
} satisfies ToolcraftCapabilityProofRecipe);
