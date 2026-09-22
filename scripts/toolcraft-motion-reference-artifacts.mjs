import { createHash } from "node:crypto";
import fs from "node:fs/promises";

import {
  getToolcraftMotionReferenceEvidenceErrors,
  writeCanonicalToolcraftMotionReferenceEvidence,
} from "../src/app/acceptance/motion-reference-evidence.mjs";
import { resolveToolcraftRootResourcePath } from "./toolcraft-source-inventory.mjs";

const encoder = new TextEncoder();

export function createToolcraftSha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
function sortJson(value) {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort()
      .map((key) => [key, sortJson(value[key])]));
  }
  return value;
}
function serializeIdentity(value) {
  return JSON.stringify(sortJson(value));
}
export function createToolcraftMotionReferenceIdentitySha256(value) {
  return createToolcraftSha256(encoder.encode(serializeIdentity(value)));
}
export function createToolcraftMotionReferencePlanSha256(evidences) {
  const eventIds = [...new Set(evidences.flatMap(({ detectedEvents }) =>
    detectedEvents.map(({ eventId }) => eventId)))].sort();
  const focusIdentities = [...new Set(evidences.flatMap(({ focusWindows }) =>
    focusWindows.map((focus) => serializeIdentity({
      endSeconds: focus.endSeconds,
      frameIds: focus.frameIds,
      sourceFrameEndIndex: focus.sourceFrameEndIndex,
      sourceFrameStartIndex: focus.sourceFrameStartIndex,
      startSeconds: focus.startSeconds,
    }))))].sort();
  return createToolcraftMotionReferenceIdentitySha256({
    eventIds,
    focusWindows: focusIdentities.map((identity) => JSON.parse(identity)),
    ranges: evidences.map(({ segment }) => segment),
    reviewedMemberships: evidences.map(({ reviewedFrames }) =>
      reviewedFrames.map(({ frameId, sourceFrameIndex, sourceSha256 }) => ({
        frameId,
        sourceFrameIndex,
        sourceSha256,
      }))),
  });
}
function canonicalSourceIdentity(evidence) {
  return {
    evidenceVersion: evidence.evidenceVersion,
    ...(evidence.sourceGrid === undefined ? {} : { sourceGrid: evidence.sourceGrid }),
    sourceKind: evidence.sourceKind,
    sourceSha256: evidence.sourceSha256,
    ...(evidence.timingMode === "seconds" ? { timing: evidence.timing } : {}),
    timingMode: evidence.timingMode,
  };
}
function canonicalStudyIdentity(evidence) {
  return {
    ...canonicalSourceIdentity(evidence),
    ...(evidence.segment === undefined ? {} : { segment: evidence.segment }),
  };
}
export function createToolcraftMotionReferenceStudyId(evidence) {
  return `motion-v1-${createToolcraftMotionReferenceIdentitySha256(canonicalStudyIdentity(evidence))}`;
}
export function createToolcraftMotionReferenceId(evidence) {
  return `motion-reference-v1-${createToolcraftMotionReferenceIdentitySha256(canonicalSourceIdentity(evidence))}`;
}
export function createToolcraftMotionReferenceGroupId(evidence, scope) {
  return `motion-group-v1-${createToolcraftMotionReferenceIdentitySha256({
    ...canonicalSourceIdentity(evidence), scope,
  })}`;
}
function describeError(error) {
  return error instanceof Error ? error.message : String(error);
}
function validateStudyPaths(study, errors) {
  const expectedEvidencePath =
    `src/app/reference-studies/${study.studyId}/evidence.json`;
  if (study.evidencePath !== expectedEvidencePath) {
    errors.push(`Motion reference study "${study.studyId}" evidencePath must use its canonical study directory.`);
  }
}
async function readRootResource(resourcePath, rootDir, label, errors) {
  let absolutePath;
  try {
    absolutePath = resolveToolcraftRootResourcePath(resourcePath, rootDir);
  } catch (error) {
    errors.push(`${label} violates the Toolcraft root boundary: ${describeError(error)}`);
    return;
  }
  try {
    return await fs.readFile(absolutePath);
  } catch (error) {
    errors.push(`${label} could not be read: ${describeError(error)}`);
  }
}
function validateIdentity(study, input, errors) {
  const evidence = study.evidence;
  const derivedStudyId = createToolcraftMotionReferenceStudyId(evidence);
  if (study.studyId !== derivedStudyId || evidence.studyId !== derivedStudyId) {
    errors.push(`Motion reference studyId must equal the canonical evidence identity ${derivedStudyId}; received study "${study.studyId}" and evidence "${String(evidence.studyId)}".`);
  }
  const derivedReferenceId = createToolcraftMotionReferenceId(evidence);
  if (input.referenceId !== derivedReferenceId) {
    errors.push(`Motion reference input referenceId must equal its canonical source identity ${derivedReferenceId}; received "${input.referenceId}".`);
  }
  return serializeIdentity(canonicalSourceIdentity(evidence));
}
async function validateEvidenceFile(study, rootDir, embeddedCanonical, errors) {
  const label = `Motion reference study "${study.studyId}" evidence.json`;
  const bytes = await readRootResource(study.evidencePath, rootDir, label, errors);
  if (!bytes) return;
  const raw = bytes.toString("utf8");
  let fileEvidence;
  try {
    fileEvidence = JSON.parse(raw);
  } catch {
    errors.push(`${label} must contain valid JSON.`);
    return;
  }
  const fileErrors = getToolcraftMotionReferenceEvidenceErrors(fileEvidence);
  if (fileErrors.length > 0) {
    errors.push(...fileErrors.map((error) => `${label}: ${error}`));
    return;
  }
  const fileCanonical = writeCanonicalToolcraftMotionReferenceEvidence(fileEvidence);
  if (embeddedCanonical !== undefined && fileCanonical !== embeddedCanonical) {
    errors.push(`Motion reference study "${study.studyId}" embedded evidence must match evidence.json.`);
  }
  if (raw !== fileCanonical) {
    errors.push(`${label} must use the canonical serialization.`);
  }
  const sheetLabel = `Motion reference study "${study.studyId}" contact sheet`;
  const sheetBytes = await readRootResource(
    fileEvidence.contactSheet.path, rootDir, sheetLabel, errors,
  );
  if (sheetBytes && createToolcraftSha256(sheetBytes) !==
      fileEvidence.contactSheet.sha256) {
    errors.push(`${sheetLabel} SHA-256 does not match evidence.json.`);
  }
}
function sameRange(left, right) {
  return left?.startSeconds === right?.startSeconds &&
    left?.endSeconds === right?.endSeconds;
}
function validateGroupMembership(groupId, records, errors) {
  const ordered = [...records].sort((left, right) =>
    left.partition.index - right.partition.index);
  const count = ordered[0].partition.count;
  const actualIndices = ordered.map(({ partition }) => partition.index);
  if (ordered.length !== count || actualIndices.some((value, index) =>
    value !== index)) {
    errors.push(`Motion reference partition "${groupId}" must contain indices 0..${count - 1} exactly.`);
  }
  const scope = ordered[0].partition.scope;
  let previousEnd = scope.startSeconds;
  for (const { evidence, partition } of ordered) {
    if (partition.count !== count || !sameRange(partition.scope, scope)) {
      errors.push(`Motion reference partition "${groupId}" must share one count and scope.`);
    }
    if (!evidence.segment || evidence.segment.startSeconds !== previousEnd ||
        evidence.segment.endSeconds <= evidence.segment.startSeconds) {
      errors.push(`Motion reference partition "${groupId}" segments must be ordered, contiguous, and non-overlapping.`);
    }
    previousEnd = evidence.segment?.endSeconds;
  }
  if (previousEnd !== scope.endSeconds) {
    errors.push(`Motion reference partition "${groupId}" segments must cover the complete declared scope.`);
  }
  return ordered;
}
function validateReviewUnits(groupId, ordered, errors) {
  const unitIds = new Set();
  for (const { evidence } of ordered) {
    for (const frame of evidence.reviewedFrames) {
      const unitId = `frame:${frame.sourceFrameIndex}`;
      if (unitIds.has(unitId)) errors.push(
        `Motion reference partition "${groupId}" contains duplicate review unit ${unitId}.`,
      );
      unitIds.add(unitId);
    }
    for (const event of evidence.detectedEvents) {
      const unitId = `event:${event.eventId}`;
      if (unitIds.has(unitId)) errors.push(
        `Motion reference partition "${groupId}" contains duplicate review unit ${unitId}.`,
      );
      unitIds.add(unitId);
    }
    for (const focus of evidence.focusWindows) {
      const unitId = `focus:${serializeIdentity(focus)}`;
      if (unitIds.has(unitId)) errors.push(
        `Motion reference partition "${groupId}" contains duplicate review unit ${unitId}.`,
      );
      unitIds.add(unitId);
    }
  }
}
function validatePartitionGroups(records, errors) {
  const groups = new Map();
  for (const record of records) {
    if (!record.partition) continue;
    groups.set(record.partition.groupId, [
      ...(groups.get(record.partition.groupId) ?? []), record,
    ]);
  }
  for (const [groupId, group] of groups) {
    const ordered = validateGroupMembership(groupId, group, errors);
    const sourceIdentities = new Set(ordered.map(({ sourceIdentity }) => sourceIdentity));
    if (sourceIdentities.size !== 1) {
      errors.push(`Motion reference partition "${groupId}" must share one source identity.`);
    }
    const scope = ordered[0].partition.scope;
    const expectedGroupId = createToolcraftMotionReferenceGroupId(
      ordered[0].evidence, scope,
    );
    if (groupId !== expectedGroupId) {
      errors.push(`Motion reference partition groupId must equal canonical source identity and scope ${expectedGroupId}.`);
    }
    validateReviewUnits(groupId, ordered, errors);
    const planSha256 = createToolcraftMotionReferencePlanSha256(
      ordered.map(({ evidence }) => evidence),
    );
    for (const { partition } of ordered) {
      if (partition.planSha256 !== planSha256) {
        errors.push(`Motion reference partition "${groupId}" planSha256 must match the canonical partition plan ${planSha256}.`);
      }
    }
  }
}

export function getToolcraftMotionReferenceEvidenceGroupErrors(evidences) {
  const errors = [];
  const records = [];
  const sourceIdentities = new Set();
  for (const evidence of evidences) {
    const evidenceErrors = getToolcraftMotionReferenceEvidenceErrors(evidence);
    if (evidenceErrors.length > 0) {
      errors.push(...evidenceErrors);
      continue;
    }
    const derivedStudyId = createToolcraftMotionReferenceStudyId(evidence);
    if (evidence.studyId !== derivedStudyId) {
      errors.push(`Motion reference studyId must equal the canonical evidence identity ${derivedStudyId}.`);
    }
    const sourceIdentity = serializeIdentity(canonicalSourceIdentity(evidence));
    sourceIdentities.add(sourceIdentity);
    records.push({
      evidence,
      partition: evidence.reviewPartition,
      sourceIdentity,
    });
  }
  if (sourceIdentities.size > 1) {
    errors.push("Motion reference evidence group must share one source identity.");
  }
  const partitionCount = records.filter(({ partition }) => partition).length;
  if ((partitionCount > 0 && partitionCount !== records.length) ||
      (partitionCount === 0 && records.length !== 1)) {
    errors.push("Motion reference evidence group must be one unpartitioned study or one complete partition set.");
  }
  validatePartitionGroups(records, errors);
  return errors;
}

export async function getToolcraftMotionReferenceArtifactErrors({
  referenceInputs,
  rootDir,
}) {
  if (referenceInputs.length === 0) return [];
  const errors = [];
  for (const input of referenceInputs) {
    const records = [];
    const inputSourceIdentities = new Set();
    for (const study of input.studies) {
      validateStudyPaths(study, errors);
      const embeddedErrors = getToolcraftMotionReferenceEvidenceErrors(study.evidence);
      let embeddedCanonical;
      if (embeddedErrors.length === 0) {
        if (study.evidence.studyId !== study.studyId) {
          errors.push(`Motion reference study "${study.studyId}" must match embedded evidence studyId "${study.evidence.studyId}".`);
        }
        const sourceIdentity = validateIdentity(study, input, errors);
        inputSourceIdentities.add(sourceIdentity);
        embeddedCanonical = writeCanonicalToolcraftMotionReferenceEvidence(study.evidence);
        records.push({
          evidence: study.evidence,
          partition: study.evidence.reviewPartition,
          sourceIdentity,
        });
      } else {
        errors.push(...embeddedErrors.map((error) =>
          `Motion reference study "${study.studyId}" embedded evidence: ${error}`));
      }
      await validateEvidenceFile(study, rootDir, embeddedCanonical, errors);
    }
    if (inputSourceIdentities.size > 1) {
      errors.push(`Motion reference input "${input.referenceId}" studies must share one source identity.`);
    }
    validatePartitionGroups(records, errors);
  }
  return errors;
}
