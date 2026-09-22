import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createToolcraftMotionReferenceGroupId,
  createToolcraftMotionReferenceIdentitySha256,
  createToolcraftMotionReferenceId,
  createToolcraftMotionReferencePlanSha256,
  createToolcraftMotionReferenceStudyId,
  createToolcraftSha256,
  getToolcraftMotionReferenceArtifactErrors,
  getToolcraftMotionReferenceEvidenceGroupErrors,
} from "./toolcraft-motion-reference-artifacts.mjs";
import {
  writeCanonicalToolcraftMotionReferenceEvidence,
} from "../src/app/acceptance/motion-reference-evidence.mjs";

const encoder = new TextEncoder();
const hex = (character) => character.repeat(64);
function sortJson(value) {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value && typeof value === "object") return Object.fromEntries(
    Object.keys(value).sort().map((key) => [key, sortJson(value[key])]),
  );
  return value;
}
const hashValue = (value) => createToolcraftSha256(
  encoder.encode(JSON.stringify(sortJson(value))),
);
function sourceIdentity() {
  return {
    evidenceVersion: 1,
    sourceKind: "video",
    sourceSha256: hex("a"),
    timing: { authority: "decoded-timestamps" },
    timingMode: "seconds",
  };
}
function studyId(segment) {
  return `motion-v1-${hashValue({ ...sourceIdentity(), ...(segment ? { segment } : {}) })}`;
}
function createEvidence({ index = 0, partition, segment } = {}) {
  const id = studyId(segment);
  const indices = segment ? (index === 0 ? [0, 1, 2, 3, 4] : [5, 6, 7, 8]) :
    [0, 1, 2];
  const reviewedFrames = indices.map((sourceFrameIndex, position) => ({
    cell: { column: position, row: 0 },
    frameId: `source-frame:${sourceFrameIndex}`,
    sourceFrameIndex,
    sourceLocator: `reference.mp4#frame=${sourceFrameIndex}`,
    sourceSha256: hex("a"),
    timeSeconds: segment ?
      segment.startSeconds + position *
        (segment.endSeconds - segment.startSeconds) / Math.max(1, indices.length - 1) :
      sourceFrameIndex,
  }));
  const detectedEvents = index === 0 ? [{
    afterFrameId: "source-frame:2",
    beforeFrameId: "source-frame:0",
    eventId: "motion-event:change:0-1-2",
    kind: "change",
    peakFrameId: "source-frame:1",
    score: 0.75,
    windowFrameIds: ["source-frame:0", "source-frame:1", "source-frame:2"],
  }, ...(segment ? [{
    afterFrameId: "source-frame:4",
    beforeFrameId: "source-frame:2",
    eventId: "motion-event:change:2-3-4",
    kind: "change",
    peakFrameId: "source-frame:3",
    score: 0.5,
    windowFrameIds: ["source-frame:2", "source-frame:3", "source-frame:4"],
  }] : [])] : [];
  const focusWindows = index === 0 && segment ? [{
    endSeconds: 1,
    frameIds: ["source-frame:0", "source-frame:1", "source-frame:2"],
    sourceFrameEndIndex: 2,
    sourceFrameStartIndex: 0,
    startSeconds: 0,
  }, {
    endSeconds: 2,
    frameIds: ["source-frame:0", "source-frame:1", "source-frame:2",
      "source-frame:3", "source-frame:4"],
    sourceFrameEndIndex: 4,
    sourceFrameStartIndex: 0,
    startSeconds: 0,
  }] : [];
  return {
    changeMetric: "max-yuva-diff-v1",
    contactSheet: {
      columns: reviewedFrames.length,
      height: 100,
      path: `src/app/reference-studies/${id}/contact-sheet.png`,
      rows: 1,
      sha256: hex("0"),
      width: 300,
    },
    decodedFrameCount: segment ? 9 : 5,
    detectedEvents,
    durationSeconds: 4,
    evidenceVersion: 1,
    ffmpegVersion: "ffmpeg 8.0",
    ffprobeVersion: "ffprobe 8.0",
    focusWindows,
    height: 180,
    maximumSourceFrameGapSeconds: 1,
    overviewFrameIds: reviewedFrames.map(({ frameId }) => frameId),
    overviewTargetFps: 1,
    ...(partition ? { reviewPartition: partition } : {}),
    reviewedFrames,
    scannedFrameCount: segment ? 9 : 5,
    ...(segment ? { segment } : {}),
    sourceBasename: "reference.mp4",
    sourceKind: "video",
    sourceSha256: hex("a"),
    studyId: id,
    timing: { authority: "decoded-timestamps" },
    timingMode: "seconds",
    width: 320,
  };
}
function planHash(evidences) {
  return createToolcraftMotionReferencePlanSha256(evidences);
}

test("exports one canonical authority for source, study, and group identities", () => {
  const segment = { endSeconds: 2, startSeconds: 0 };
  const evidence = createEvidence({ segment });
  const scope = { endSeconds: 4, startSeconds: 0 };
  assert.equal(createToolcraftMotionReferenceId(evidence),
    `motion-reference-v1-${hashValue(sourceIdentity())}`);
  assert.equal(createToolcraftMotionReferenceStudyId(evidence), studyId(segment));
  assert.equal(createToolcraftMotionReferenceGroupId(evidence, scope),
    `motion-group-v1-${hashValue({ ...sourceIdentity(), scope })}`);
});
async function createFixture(context, { partitioned = false } = {}) {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "toolcraft-motion-artifacts-"));
  context.after(() => fs.rm(rootDir, { force: true, recursive: true }));
  let evidences;
  if (partitioned) {
    const scope = { endSeconds: 4, startSeconds: 0 };
    const segments = [
      { endSeconds: 2, startSeconds: 0 },
      { endSeconds: 4, startSeconds: 2 },
    ];
    const groupId = `motion-group-v1-${hashValue({ ...sourceIdentity(), scope })}`;
    evidences = segments.map((segment, index) => createEvidence({ index, segment }));
    const sharedPlanHash = planHash(evidences);
    evidences.forEach((evidence, index) => {
      evidence.reviewPartition = {
        count: 2,
        groupId,
        index,
        planSha256: sharedPlanHash,
        scope,
      };
    });
  } else {
    evidences = [createEvidence()];
  }
  const studies = [];
  const sheetPaths = [];
  for (const [index, evidence] of evidences.entries()) {
    const sheetBytes = encoder.encode(`sheet-${index}`);
    evidence.contactSheet.sha256 = createToolcraftSha256(sheetBytes);
    const directory = path.join(rootDir, "src/app/reference-studies", evidence.studyId);
    await fs.mkdir(directory, { recursive: true });
    const evidencePath = path.join(directory, "evidence.json");
    const sheetPath = path.join(directory, "contact-sheet.png");
    await fs.writeFile(evidencePath, writeCanonicalToolcraftMotionReferenceEvidence(evidence));
    await fs.writeFile(sheetPath, sheetBytes);
    studies.push({
      evidence,
      evidencePath: path.posix.join("src/app/reference-studies", evidence.studyId, "evidence.json"),
      events: [],
      phases: [],
      studyId: evidence.studyId,
    });
    sheetPaths.push(sheetPath);
  }
  const referenceInputs = [{
    behaviors: [],
    kind: "motion-reference",
    referenceId: `motion-reference-v1-${hashValue(sourceIdentity())}`,
    studies,
  }];
  return { evidences, referenceInputs, rootDir, sheetPaths };
}

test("verifies canonical evidence and exact contact-sheet content hashes", async (context) => {
  const fixture = await createFixture(context);
  assert.equal(createToolcraftSha256(encoder.encode("sheet-0")),
    fixture.evidences[0].contactSheet.sha256);
  assert.deepEqual(await getToolcraftMotionReferenceArtifactErrors(fixture), []);
});

test("exports pure complete-group validation for publication inventory", async (context) => {
  const fixture = await createFixture(context, { partitioned: true });
  assert.deepEqual(getToolcraftMotionReferenceEvidenceGroupErrors(
    fixture.evidences,
  ), []);
  assert.match(getToolcraftMotionReferenceEvidenceGroupErrors(
    fixture.evidences.slice(0, 1),
  ).join("\n"), /indices 0\.\.1 exactly/iu);
});

test("reports missing and modified contact sheets", async (context) => {
  const missing = await createFixture(context);
  await fs.rm(missing.sheetPaths[0]);
  assert.match((await getToolcraftMotionReferenceArtifactErrors(missing)).join("\n"),
    /contact sheet.*read|ENOENT/iu);

  const modified = await createFixture(context);
  await fs.writeFile(modified.sheetPaths[0], "modified");
  assert.match((await getToolcraftMotionReferenceArtifactErrors(modified)).join("\n"),
    /contact sheet.*SHA-256/iu);
});

test("rejects wrong directories and embedded/file evidence mismatches", async (context) => {
  const wrongDirectory = await createFixture(context);
  wrongDirectory.referenceInputs[0].studies[0].evidencePath =
    "src/app/reference-studies/wrong/evidence.json";
  assert.match((await getToolcraftMotionReferenceArtifactErrors(wrongDirectory)).join("\n"),
    /canonical study directory/iu);

  const mismatch = await createFixture(context);
  mismatch.referenceInputs[0].studies[0].evidence.width += 1;
  assert.match((await getToolcraftMotionReferenceArtifactErrors(mismatch)).join("\n"),
    /embedded evidence.*evidence.json/iu);
});

test("rejects malformed and noncanonical evidence JSON", async (context) => {
  const malformed = await createFixture(context);
  await fs.writeFile(path.join(malformed.rootDir,
    malformed.referenceInputs[0].studies[0].evidencePath), "{broken");
  assert.match((await getToolcraftMotionReferenceArtifactErrors(malformed)).join("\n"),
    /valid JSON/iu);

  const noncanonical = await createFixture(context);
  const evidencePath = path.join(noncanonical.rootDir,
    noncanonical.referenceInputs[0].studies[0].evidencePath);
  const parsed = JSON.parse(await fs.readFile(evidencePath, "utf8"));
  await fs.writeFile(evidencePath, `${JSON.stringify(parsed)}\n`);
  assert.match((await getToolcraftMotionReferenceArtifactErrors(noncanonical)).join("\n"),
    /canonical serialization/iu);
});

test("returns string errors for scalar and null embedded and file evidence", async (context) => {
  for (const value of [null, 7, []]) {
    const embedded = await createFixture(context);
    embedded.referenceInputs[0].studies[0].evidence = value;
    let embeddedErrors;
    await assert.doesNotReject(async () => {
      embeddedErrors = await getToolcraftMotionReferenceArtifactErrors(embedded);
    });
    assert.ok(embeddedErrors.length > 0);
    assert.ok(embeddedErrors.every((error) => typeof error === "string"));

    const onDisk = await createFixture(context);
    await fs.writeFile(path.join(onDisk.rootDir,
      onDisk.referenceInputs[0].studies[0].evidencePath), `${JSON.stringify(value)}\n`);
    let fileErrors;
    await assert.doesNotReject(async () => {
      fileErrors = await getToolcraftMotionReferenceArtifactErrors(onDisk);
    });
    assert.ok(fileErrors.length > 0);
    assert.ok(fileErrors.every((error) => typeof error === "string"));
  }
});

test("anchors identity and partition plan hashes to fixed canonical payloads", () => {
  const focusA = {
    endSeconds: 1,
    frameIds: ["source-frame:0", "source-frame:1"],
    sourceFrameEndIndex: 1,
    sourceFrameStartIndex: 0,
    startSeconds: 0,
  };
  const focusB = {
    endSeconds: 3,
    frameIds: ["source-frame:2", "source-frame:3"],
    sourceFrameEndIndex: 3,
    sourceFrameStartIndex: 2,
    startSeconds: 2,
  };
  const evidences = [{
    detectedEvents: [{ eventId: "motion-event:change:4-5-6" },
      { eventId: "motion-event:change:0-1-2" }],
    focusWindows: [focusB, focusA],
    reviewedFrames: [{
      frameId: "source-frame:0", sourceFrameIndex: 0, sourceSha256: hex("a"),
    }],
    segment: { endSeconds: 2, startSeconds: 0 },
  }, {
    detectedEvents: [{ eventId: "motion-event:change:0-1-2" }],
    focusWindows: [focusA],
    reviewedFrames: [{
      frameId: "source-frame:7", sourceFrameIndex: 7, sourceSha256: hex("b"),
    }],
    segment: { endSeconds: 4, startSeconds: 2 },
  }];
  assert.equal(createToolcraftMotionReferenceIdentitySha256(sourceIdentity()),
    "a7ae52bf55a62efac7a95f61df736a80d02a2e22a89ead0cd47610b80115df1a");
  assert.equal(createToolcraftMotionReferencePlanSha256(evidences),
    "dcd8a5082f80abf9017186730daed5d0bd464298dc1a3df648431d82c9095641");
});

test("canonicalizes event and equal-start focus permutations as unordered unions", () => {
  const first = createEvidence({ index: 0, segment: { endSeconds: 2, startSeconds: 0 } });
  const second = createEvidence({ index: 1, segment: { endSeconds: 4, startSeconds: 2 } });
  const expected = planHash([first, second]);
  first.detectedEvents.reverse();
  first.focusWindows.reverse();
  assert.equal(planHash([first, second]), expected);
});

test("accepts event and equal-start focus permutations without changing a group plan", async (context) => {
  const fixture = await createFixture(context, { partitioned: true });
  const evidence = fixture.evidences[0];
  const expected = evidence.reviewPartition.planSha256;
  evidence.detectedEvents.reverse();
  evidence.focusWindows.reverse();
  assert.equal(planHash(fixture.evidences), expected);
  await fs.writeFile(path.join(fixture.rootDir,
    fixture.referenceInputs[0].studies[0].evidencePath),
  writeCanonicalToolcraftMotionReferenceEvidence(evidence));
  assert.deepEqual(await getToolcraftMotionReferenceArtifactErrors(fixture), []);
});

test("recomputes study and reference identities", async (context) => {
  const wrongReference = await createFixture(context);
  wrongReference.referenceInputs[0].referenceId = `motion-reference-v1-${hex("f")}`;
  assert.match((await getToolcraftMotionReferenceArtifactErrors(wrongReference)).join("\n"),
    /referenceId.*source identity/iu);

  const wrongStudy = await createFixture(context);
  const study = wrongStudy.referenceInputs[0].studies[0];
  study.studyId = `motion-v1-${hex("e")}`;
  study.evidence.studyId = study.studyId;
  study.evidence.contactSheet.path =
    `src/app/reference-studies/${study.studyId}/contact-sheet.png`;
  assert.match((await getToolcraftMotionReferenceArtifactErrors(wrongStudy)).join("\n"),
    /studyId/iu);
});

test("checks complete partition membership, group identity, and plan hashes", async (context) => {
  const incomplete = await createFixture(context, { partitioned: true });
  incomplete.referenceInputs[0].studies = incomplete.referenceInputs[0].studies.slice(0, 1);
  assert.match((await getToolcraftMotionReferenceArtifactErrors(incomplete)).join("\n"),
    /indices 0\.\.1 exactly/iu);

  const forged = await createFixture(context, { partitioned: true });
  forged.evidences.forEach((evidence) => { evidence.reviewPartition.planSha256 = hex("f"); });
  assert.match((await getToolcraftMotionReferenceArtifactErrors(forged)).join("\n"),
    /planSha256.*canonical partition plan/iu);

  const duplicate = await createFixture(context, { partitioned: true });
  duplicate.referenceInputs[0].studies[1].evidence.reviewPartition.index = 0;
  assert.match((await getToolcraftMotionReferenceArtifactErrors(duplicate)).join("\n"),
    /indices 0\.\.1 exactly/iu);

  const duplicatedUnit = await createFixture(context, { partitioned: true });
  const secondEvidence = duplicatedUnit.referenceInputs[0].studies[1].evidence;
  secondEvidence.reviewedFrames[0].sourceFrameIndex = 2;
  secondEvidence.reviewedFrames[0].frameId = "source-frame:2";
  secondEvidence.overviewFrameIds[0] = "source-frame:2";
  assert.match((await getToolcraftMotionReferenceArtifactErrors(duplicatedUnit)).join("\n"),
    /duplicate review unit frame:2/iu);

  const missingOrdinaryFrame = await createFixture(context, { partitioned: true });
  const missingEvidence = missingOrdinaryFrame.referenceInputs[0].studies[1].evidence;
  missingEvidence.reviewedFrames.pop();
  missingEvidence.overviewFrameIds.pop();
  missingEvidence.contactSheet.columns = missingEvidence.reviewedFrames.length;
  await fs.writeFile(
    path.join(missingOrdinaryFrame.rootDir,
      missingOrdinaryFrame.referenceInputs[0].studies[1].evidencePath),
    writeCanonicalToolcraftMotionReferenceEvidence(missingEvidence),
  );
  assert.match(
    (await getToolcraftMotionReferenceArtifactErrors(missingOrdinaryFrame)).join("\n"),
    /planSha256.*canonical partition plan/iu,
  );
});

test("rejects root escapes and symlinked artifacts", async (context) => {
  const lexical = await createFixture(context);
  lexical.referenceInputs[0].studies[0].evidencePath = "../outside/evidence.json";
  assert.match((await getToolcraftMotionReferenceArtifactErrors(lexical)).join("\n"),
    /root boundary/iu);

  const linked = await createFixture(context);
  const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), "toolcraft-motion-outside-"));
  context.after(() => fs.rm(outsideDir, { force: true, recursive: true }));
  await fs.writeFile(path.join(outsideDir, "evidence.json"), "{}\n");
  const linkPath = path.join(linked.rootDir, "src/app/reference-studies/linked");
  try {
    await fs.symlink(outsideDir, linkPath);
  } catch (error) {
    if (["EACCES", "ENOSYS", "EPERM"].includes(error?.code)) {
      context.skip(`symbolic links are unavailable: ${error.code}`);
      return;
    }
    throw error;
  }
  linked.referenceInputs[0].studies[0].evidencePath =
    "src/app/reference-studies/linked/evidence.json";
  assert.match((await getToolcraftMotionReferenceArtifactErrors(linked)).join("\n"),
    /root boundary/iu);
});

test("returns immediately when there are no reference inputs", async () => {
  assert.deepEqual(await getToolcraftMotionReferenceArtifactErrors({
    referenceInputs: [],
    rootDir: "/path/that/does/not/exist",
  }), []);
});
