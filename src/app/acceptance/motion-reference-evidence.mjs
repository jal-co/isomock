import {
  validateToolcraftMotionReferenceTimingAndWindows,
} from "./motion-reference-evidence-windows.mjs";
import {
  hasExactKeys,
  isRecord,
  isSha256,
  isStudyId,
  nonemptyString,
  nonnegativeInteger,
  positiveInteger,
  requireValue,
} from "./motion-reference-evidence-validation.mjs";

const SOURCE_KINDS = new Set([
  "contact-sheet", "frame-sequence", "gif", "screen-recording", "video",
]);
function validateContactSheet(sheet, evidence, errors) {
  const label = "motion reference evidence contactSheet";
  if (!hasExactKeys(sheet,
    ["columns", "height", "path", "rows", "sha256", "width"], [], label, errors)) return;
  requireValue(positiveInteger(sheet.columns), `${label}.columns must be a positive safe integer.`, errors);
  requireValue(positiveInteger(sheet.rows), `${label}.rows must be a positive safe integer.`, errors);
  requireValue(positiveInteger(sheet.width), `${label}.width must be a positive safe integer.`, errors);
  requireValue(positiveInteger(sheet.height), `${label}.height must be a positive safe integer.`, errors);
  requireValue(isSha256(sheet.sha256), `${label}.sha256 must be a lowercase SHA-256 hash.`, errors);
  requireValue(
    sheet.path === `src/app/reference-studies/${evidence.studyId}/contact-sheet.png`,
    `${label}.path must name the contact sheet in the canonical study directory.`, errors,
  );
}
function validateSource(evidence, errors) {
  requireValue(SOURCE_KINDS.has(evidence.sourceKind),
    "motion reference evidence sourceKind is unsupported.", errors);
  requireValue(isSha256(evidence.sourceSha256),
    "motion reference evidence sourceSha256 must be a lowercase SHA-256 hash.", errors);
  requireValue(nonemptyString(evidence.sourceBasename) &&
    !/[\\/]/u.test(evidence.sourceBasename),
  "motion reference evidence sourceBasename must be a basename.", errors);
  if (evidence.sourceKind === "contact-sheet") {
    if (hasExactKeys(evidence.sourceGrid, ["columns", "rows"], [],
      "motion reference evidence sourceGrid", errors)) {
      requireValue(positiveInteger(evidence.sourceGrid.columns) &&
        positiveInteger(evidence.sourceGrid.rows),
      "motion reference evidence sourceGrid dimensions must be positive safe integers.", errors);
    }
  }
}
function validateFrames(evidence, errors) {
  if (!Array.isArray(evidence.reviewedFrames)) {
    errors.push("motion reference evidence reviewedFrames must be an array.");
    return new Map();
  }
  requireValue(evidence.reviewedFrames.length > 0 && evidence.reviewedFrames.length <= 120,
    "motion reference evidence must contain between 1 and at most 120 reviewed frames.", errors);
  const frames = new Map();
  let previousIndex = -1;
  for (const [position, frame] of evidence.reviewedFrames.entries()) {
    const label = `motion reference evidence reviewedFrames[${position}]`;
    const keys = ["cell", "frameId", "sourceFrameIndex", "sourceLocator", "sourceSha256",
      ...(evidence.timingMode === "seconds" ? ["timeSeconds"] : [])];
    if (!hasExactKeys(frame, keys, [], label, errors)) continue;
    if (hasExactKeys(frame.cell, ["column", "row"], [], `${label}.cell`, errors)) {
      requireValue(nonnegativeInteger(frame.cell.column) && nonnegativeInteger(frame.cell.row),
        `${label}.cell coordinates must be nonnegative safe integers.`, errors);
      requireValue(frame.cell.column === position % evidence.contactSheet?.columns &&
        frame.cell.row === Math.floor(position / evidence.contactSheet?.columns),
      `${label}.cell must follow canonical contact-sheet order.`, errors);
    }
    requireValue(nonnegativeInteger(frame.sourceFrameIndex) &&
      frame.sourceFrameIndex < evidence.decodedFrameCount &&
      frame.sourceFrameIndex > previousIndex,
      `${label}.sourceFrameIndex must be in strictly increasing order.`, errors);
    requireValue(frame.frameId === `source-frame:${frame.sourceFrameIndex}`,
      `${label}.frameId must be canonical for its sourceFrameIndex.`, errors);
    requireValue(nonemptyString(frame.sourceLocator), `${label}.sourceLocator must be nonempty.`, errors);
    requireValue(frame.sourceSha256 === evidence.sourceSha256 && isSha256(frame.sourceSha256),
      `${label}.sourceSha256 must match the evidence source hash.`, errors);
    previousIndex = frame.sourceFrameIndex;
    if (frames.has(frame.frameId)) errors.push(`${label}.frameId is duplicated.`);
    frames.set(frame.frameId, frame);
  }
  if (positiveInteger(evidence.contactSheet?.columns)) {
    requireValue(evidence.contactSheet.rows ===
      Math.ceil(evidence.reviewedFrames.length / evidence.contactSheet.columns),
    "motion reference evidence contactSheet.rows must fit reviewedFrames exactly.", errors);
  }
  return frames;
}

export function getToolcraftMotionReferenceEvidenceErrors(value) {
  const errors = [];
  const timingMode = value?.timingMode;
  const sourceKind = value?.sourceKind;
  const required = ["changeMetric", "contactSheet", "decodedFrameCount", "detectedEvents",
    "evidenceVersion", "ffmpegVersion", "ffprobeVersion", "focusWindows", "height",
    "overviewFrameIds", "reviewedFrames", "scannedFrameCount", "sourceBasename",
    "sourceKind", "sourceSha256", "studyId", "timingMode", "width",
    ...(sourceKind === "contact-sheet" ? ["sourceGrid"] : []),
    ...(timingMode === "seconds" ? ["durationSeconds", "maximumSourceFrameGapSeconds",
      "overviewTargetFps", "timing"] : [])];
  const optional = timingMode === "seconds" ?
    ["nominalFrameRate", "reviewPartition", "segment"] : [];
  if (!hasExactKeys(value, required, optional, "motion reference evidence", errors)) return errors;
  requireValue(value.evidenceVersion === 1, "motion reference evidence evidenceVersion must be 1.", errors);
  requireValue(value.changeMetric === "max-yuva-diff-v1", "motion reference evidence changeMetric is invalid.", errors);
  requireValue(isStudyId(value.studyId), "motion reference evidence studyId must match motion-v1-<64 lowercase hex>.", errors);
  requireValue(positiveInteger(value.decodedFrameCount) && positiveInteger(value.scannedFrameCount),
    "motion reference evidence frame counts must be positive safe integers.", errors);
  requireValue(value.decodedFrameCount === value.scannedFrameCount,
    "motion reference evidence decodedFrameCount must equal scannedFrameCount.", errors);
  requireValue(positiveInteger(value.width) && positiveInteger(value.height),
    "motion reference evidence dimensions must be positive safe integers.", errors);
  requireValue(nonemptyString(value.ffmpegVersion) && nonemptyString(value.ffprobeVersion),
    "motion reference evidence tool versions must be nonempty.", errors);
  requireValue(value.timingMode === "ordinal" || value.timingMode === "seconds",
    "motion reference evidence timingMode is invalid.", errors);
  validateSource(value, errors);
  validateContactSheet(value.contactSheet, value, errors);
  const frames = validateFrames(value, errors);
  validateToolcraftMotionReferenceTimingAndWindows(value, frames, errors);
  return errors;
}

function deepFreeze(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}
export function defineToolcraftMotionReferenceEvidence(value) {
  const errors = getToolcraftMotionReferenceEvidenceErrors(value);
  if (errors.length > 0) throw new TypeError(`Invalid Toolcraft motion reference evidence:\n${errors.join("\n")}`);
  return deepFreeze(value);
}
function sortJson(value) {
  if (Array.isArray(value)) return value.map(sortJson);
  if (isRecord(value)) return Object.fromEntries(Object.keys(value).sort()
    .map((key) => [key, sortJson(value[key])]));
  return value;
}
export function writeCanonicalToolcraftMotionReferenceEvidence(evidence) {
  return `${JSON.stringify(sortJson(evidence), null, 2)}\n`;
}
