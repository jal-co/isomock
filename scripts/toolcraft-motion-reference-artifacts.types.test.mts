import type {
  ToolcraftMotionReferenceEvidence,
  ToolcraftReferenceInput,
} from "../src/app/acceptance/reference-study-types";
import {
  createToolcraftMotionReferenceGroupId,
  createToolcraftMotionReferenceId,
  createToolcraftMotionReferenceIdentitySha256,
  createToolcraftMotionReferencePlanSha256,
  createToolcraftMotionReferenceStudyId,
  createToolcraftSha256,
  getToolcraftMotionReferenceArtifactErrors,
  getToolcraftMotionReferenceEvidenceGroupErrors,
  type ToolcraftMotionReferenceGroupId,
  type ToolcraftMotionReferenceId,
  type ToolcraftMotionReferenceScope,
  type ToolcraftMotionReferenceStudyId,
} from "./toolcraft-motion-reference-artifacts.mjs";

declare const evidence: ToolcraftMotionReferenceEvidence;
declare const evidences: readonly ToolcraftMotionReferenceEvidence[];
declare const referenceInputs: readonly ToolcraftReferenceInput[];

const digest: string = createToolcraftSha256(new Uint8Array());
const identityDigest: string = createToolcraftMotionReferenceIdentitySha256({
  digest,
});
const planDigest: string = createToolcraftMotionReferencePlanSha256(evidences);
const studyId: ToolcraftMotionReferenceStudyId =
  createToolcraftMotionReferenceStudyId(evidence);
const referenceId: ToolcraftMotionReferenceId =
  createToolcraftMotionReferenceId(evidence);
const groupId: ToolcraftMotionReferenceGroupId =
  createToolcraftMotionReferenceGroupId(evidence, {
    endSeconds: 1,
    startSeconds: 0,
  });
const ordinalScope: ToolcraftMotionReferenceScope = {
  endFrameExclusive: 12,
  startFrameIndex: 0,
};
const errors: Promise<string[]> = getToolcraftMotionReferenceArtifactErrors({
  referenceInputs,
  rootDir: "/toolcraft-app",
});
const groupErrors: string[] =
  getToolcraftMotionReferenceEvidenceGroupErrors(evidences);

void [digest, errors, groupErrors, groupId, identityDigest, ordinalScope, planDigest,
  referenceId, studyId];
