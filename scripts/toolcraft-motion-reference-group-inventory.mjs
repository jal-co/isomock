import fs from "node:fs/promises";
import path from "node:path";

import {
  defineToolcraftMotionReferenceEvidence,
  writeCanonicalToolcraftMotionReferenceEvidence,
} from "../src/app/acceptance/motion-reference-evidence.mjs";
import {
  createToolcraftMotionReferenceGroupId,
  createToolcraftMotionReferenceId,
  createToolcraftMotionReferenceStudyId,
  createToolcraftSha256,
  getToolcraftMotionReferenceEvidenceGroupErrors,
} from "./toolcraft-motion-reference-artifacts.mjs";
import {
  requireToolcraftMotionReferenceStudiesRoot,
} from "./toolcraft-motion-reference-roots.mjs";

function fail(message, cause) {
  throw new Error(`Toolcraft motion reference group inventory failed: ${message}`, {
    cause,
  });
}

function publicationScope(evidence) {
  if (evidence.reviewPartition) return evidence.reviewPartition.scope;
  if (evidence.timingMode === "seconds") return evidence.segment ?? {
    endSeconds: evidence.durationSeconds,
    startSeconds: 0,
  };
  return {
    endFrameExclusive: evidence.decodedFrameCount,
    startFrameIndex: 0,
  };
}

function publicationGroupId(evidence) {
  const expected = createToolcraftMotionReferenceGroupId(
    evidence, publicationScope(evidence),
  );
  if (evidence.reviewPartition && evidence.reviewPartition.groupId !== expected) {
    fail("partition group identity does not match its canonical source scope");
  }
  return expected;
}

export function defineToolcraftMotionReferencePublicationGroup(evidences) {
  if (!Array.isArray(evidences) || evidences.length === 0) {
    fail("a nonempty new evidence group is required");
  }
  const errors = getToolcraftMotionReferenceEvidenceGroupErrors(evidences);
  if (errors.length > 0) fail(errors.join("\n"));
  const referenceIds = new Set(evidences.map(createToolcraftMotionReferenceId));
  const groupIds = new Set(evidences.map(publicationGroupId));
  if (referenceIds.size !== 1 || groupIds.size !== 1) {
    fail("new evidence must form exactly one complete canonical source group");
  }
  return {
    groupId: groupIds.values().next().value,
    referenceId: referenceIds.values().next().value,
    studyIds: evidences.map(({ studyId }) => studyId).sort(),
  };
}

async function checkedRegularFile(fileSystem, filePath, label) {
  const file = await fileSystem.lstat(filePath).catch((error) => {
    fail(`${label} is missing or unreadable`, error);
  });
  if (!file.isFile() || file.isSymbolicLink()) {
    fail(`${label} must be a direct regular file, not a link`);
  }
  return fileSystem.readFile(filePath);
}

async function readStudy(fileSystem, referenceStudiesRoot, entry) {
  if (!entry.isDirectory() || entry.isSymbolicLink()) {
    fail(`unexplained reference study entry: ${entry.name}`);
  }
  const directory = path.join(referenceStudiesRoot, entry.name);
  const names = (await fileSystem.readdir(directory)).sort();
  if (names.join("\0") !== "contact-sheet.png\0evidence.json") {
    fail(`reference study ${entry.name} must contain exactly its evidence and contact sheet`);
  }
  const evidenceBytes = await checkedRegularFile(
    fileSystem, path.join(directory, "evidence.json"), `${entry.name}/evidence.json`,
  );
  let raw;
  try {
    raw = JSON.parse(evidenceBytes.toString("utf8"));
  } catch (error) {
    fail(`${entry.name}/evidence.json must contain strict JSON`, error);
  }
  let evidence;
  try {
    evidence = defineToolcraftMotionReferenceEvidence(raw);
  } catch (error) {
    fail(`${entry.name}/evidence.json is not canonical evidence`, error);
  }
  if (evidenceBytes.toString("utf8") !==
      writeCanonicalToolcraftMotionReferenceEvidence(evidence) ||
      evidence.studyId !== entry.name ||
      createToolcraftMotionReferenceStudyId(evidence) !== entry.name) {
    fail(`reference study ${entry.name} does not match its canonical identity`);
  }
  const sheet = await checkedRegularFile(fileSystem,
    path.join(directory, "contact-sheet.png"), `${entry.name}/contact-sheet.png`);
  if (createToolcraftSha256(sheet) !== evidence.contactSheet.sha256) {
    fail(`reference study ${entry.name} contact-sheet hash is invalid`);
  }
  return {
    evidence,
    groupId: publicationGroupId(evidence),
    referenceId: createToolcraftMotionReferenceId(evidence),
    studyId: evidence.studyId,
  };
}

export async function discoverToolcraftMotionReferencePreviousGroup({
  evidences,
  fileSystem = fs,
  referenceStudiesRoot,
  rootDir,
}) {
  await requireToolcraftMotionReferenceStudiesRoot({
    fileSystem, referenceStudiesRoot, rootDir,
  });
  const authority = defineToolcraftMotionReferencePublicationGroup(evidences);
  const entries = await fileSystem.readdir(referenceStudiesRoot, { withFileTypes: true });
  const records = [];
  for (const entry of [...entries].sort((left, right) =>
    left.name.localeCompare(right.name))) {
    records.push(await readStudy(fileSystem, referenceStudiesRoot, entry));
  }
  const previous = records.filter((record) =>
    record.referenceId === authority.referenceId &&
    record.groupId === authority.groupId);
  if (previous.length > 0) {
    const errors = getToolcraftMotionReferenceEvidenceGroupErrors(
      previous.map(({ evidence }) => evidence),
    );
    if (errors.length > 0) fail(errors.join("\n"));
  }
  return {
    obsoleteStudyIds: previous
      .filter(({ studyId }) => !authority.studyIds.includes(studyId))
      .map(({ studyId }) => studyId),
  };
}
