import type {
  ToolcraftMotionReferenceEvidence,
  ToolcraftReferenceInput,
} from "../src/app/acceptance/reference-study-types";

export type ToolcraftMotionReferenceStudyId = `motion-v1-${string}`;
export type ToolcraftMotionReferenceId = `motion-reference-v1-${string}`;
export type ToolcraftMotionReferenceGroupId = `motion-group-v1-${string}`;
export type ToolcraftMotionReferenceScope = Readonly<
  | { endFrameExclusive: number; startFrameIndex: number }
  | { endSeconds: number; startSeconds: number }
>;

export function createToolcraftSha256(bytes: Uint8Array): string;
export function createToolcraftMotionReferenceIdentitySha256(
  value: unknown,
): string;
export function createToolcraftMotionReferencePlanSha256(
  evidences: readonly ToolcraftMotionReferenceEvidence[],
): string;
export function createToolcraftMotionReferenceStudyId(
  evidence: ToolcraftMotionReferenceEvidence,
): ToolcraftMotionReferenceStudyId;
export function createToolcraftMotionReferenceId(
  evidence: ToolcraftMotionReferenceEvidence,
): ToolcraftMotionReferenceId;
export function createToolcraftMotionReferenceGroupId(
  evidence: ToolcraftMotionReferenceEvidence,
  scope: ToolcraftMotionReferenceScope,
): ToolcraftMotionReferenceGroupId;
export function getToolcraftMotionReferenceEvidenceGroupErrors(
  evidences: readonly ToolcraftMotionReferenceEvidence[],
): string[];
export function getToolcraftMotionReferenceArtifactErrors(options: {
  referenceInputs: readonly ToolcraftReferenceInput[];
  rootDir: string;
}): Promise<string[]>;
