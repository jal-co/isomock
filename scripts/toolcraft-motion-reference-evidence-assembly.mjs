import path from "node:path";

import {
  defineToolcraftMotionReferenceEvidence,
  writeCanonicalToolcraftMotionReferenceEvidence,
} from "../src/app/acceptance/motion-reference-evidence.mjs";
import {
  createToolcraftMotionReferenceGroupId,
  createToolcraftMotionReferencePlanSha256,
  createToolcraftMotionReferenceStudyId,
  createToolcraftSha256,
} from "./toolcraft-motion-reference-artifacts.mjs";
import {
  createToolcraftMotionReviewSelection,
  TOOLCRAFT_MOTION_OVERVIEW_FPS,
} from "./toolcraft-motion-reference-sampling.mjs";

function samplingInput(inspection, scan, options) {
  if (inspection.timingMode === "ordinal") return {
    input: {
      changeScores: scan.changeScores,
      frameCount: inspection.decodedFrameCount,
      loopSeamScore: scan.loopSeamScore,
      timingMode: "ordinal",
    },
    sourceIndices: Array.from({ length: inspection.decodedFrameCount }, (_, index) => index),
  };
  const sourceRange = { endSeconds: inspection.durationSeconds, startSeconds: 0 };
  const range = options.segment ?? sourceRange;
  const sourceIndices = inspection.frameTimes.flatMap((time, index) =>
    time >= range.startSeconds && time <= range.endSeconds ? [index] : []);
  if (sourceIndices.length === 0) {
    throw new TypeError("Toolcraft motion reference segment contains no decoded frames.");
  }
  return {
    input: {
      changeScores: sourceIndices.map((index, position) =>
        position === 0 && index > 0 ? 0 : scan.changeScores[index]),
      focusWindows: options.focus ?? [],
      frameTimes: sourceIndices.map((index) => inspection.frameTimes[index]),
      loopSeamScore: scan.loopSeamScore,
      ...(inspection.nominalFrameRate ? {
        nominalFrameRate: inspection.nominalFrameRate,
      } : {}),
      range,
      sourceRange,
      timingMode: "seconds",
    },
    sourceIndices,
  };
}

function remapSelection(selection, sourceIndices) {
  const globalIndex = (index) => sourceIndices[index];
  const events = selection.events.map((event) => {
    const frameIndices = event.frameIndices.map(globalIndex);
    const peakFrameIndex = globalIndex(event.peakFrameIndex);
    return {
      ...event,
      eventId: `motion-event:${event.kind}:${frameIndices.join("-")}`,
      frameIds: frameIndices.map((index) => `source-frame:${index}`),
      frameIndices,
      peakFrameId: `source-frame:${peakFrameIndex}`,
      peakFrameIndex,
    };
  });
  const eventIds = new Map(selection.events.map((event, index) =>
    [event.eventId, events[index].eventId]));
  return {
    ...selection,
    events,
    focusWindows: selection.focusWindows.map((focus) => ({
      ...focus, frameIndices: focus.frameIndices.map(globalIndex),
    })),
    ...(selection.kind === "selection" ? {
      overviewFrameIndices: selection.overviewFrameIndices.map(globalIndex),
      reviewFrameIndices: selection.reviewFrameIndices.map(globalIndex),
    } : {
      partitions: selection.partitions.map((partition) => ({
        ...partition,
        eventIds: partition.eventIds.map((id) => eventIds.get(id)),
        reviewFrameIndices: partition.reviewFrameIndices.map(globalIndex),
      })),
    }),
  };
}

function studyPlans(selection, options) {
  if (selection.kind === "selection") return [{
    eventIds: selection.events.map(({ eventId }) => eventId),
    focusWindows: selection.focusWindows,
    index: 0,
    overviewFrameIndices: selection.overviewFrameIndices,
    reviewFrameIndices: selection.reviewFrameIndices,
    ...(options.segment ? { segment: options.segment } : {}),
  }];
  const count = selection.partitions.length;
  const scope = options.segment ?? {
    endSeconds: selection.partitions.at(-1).endSeconds,
    startSeconds: selection.partitions[0].startSeconds,
  };
  return selection.partitions.map((partition) => {
    const membership = new Set(partition.reviewFrameIndices);
    return {
      eventIds: partition.eventIds,
      focusWindows: selection.focusWindows.filter(({ frameIndices }) =>
        frameIndices.every((index) => membership.has(index))),
      index: partition.index,
      overviewFrameIndices: selection.overviewFrameIndices.filter((index) =>
        membership.has(index)),
      partition: { count, index: partition.index, scope },
      reviewFrameIndices: partition.reviewFrameIndices,
      segment: { endSeconds: partition.endSeconds, startSeconds: partition.startSeconds },
    };
  });
}

export function createToolcraftMotionEvidenceReviewPlan(inspection, scan, options) {
  const sampling = samplingInput(inspection, scan, options);
  const selected = createToolcraftMotionReviewSelection(sampling.input);
  if (selected.kind === "error") throw new TypeError(
    selected.code === "ordinal-review-too-large" ?
      "Ordinal motion reference review above 120 frames is unsupported; declare authoritative timing or provide a bounded source." :
      `Motion reference review cannot be safely partitioned (${selected.code}).`,
  );
  const selection = remapSelection(selected, sampling.sourceIndices);
  const plans = studyPlans(selection, options);
  return {
    plans,
    selection,
    unionSourceFrameIndices: [...new Set(plans.flatMap(({ reviewFrameIndices }) =>
      reviewFrameIndices))].sort((left, right) => left - right),
  };
}

function timingAuthority(options) {
  if (!options.timing) return { authority: "decoded-timestamps" };
  return options.timing.authority === "declared-fps" ? {
    authority: "declared-fps", framesPerSecond: options.timing.framesPerSecond,
  } : {
    authority: "declared-timestamps",
    timestampsSha256: options.timing.timestampsSha256,
  };
}
function maximumFrameGap(frameTimes) {
  let maximum = 0;
  for (let index = 1; index < frameTimes.length; index += 1) {
    maximum = Math.max(maximum, frameTimes[index] - frameTimes[index - 1]);
  }
  return maximum;
}
function evidenceEvents(events, eventIds) {
  const selected = new Set(eventIds);
  return events.filter(({ eventId }) => selected.has(eventId)).map((event) => ({
    afterFrameId: event.frameIds.at(-1), beforeFrameId: event.frameIds[0],
    eventId: event.eventId, kind: event.kind, peakFrameId: event.peakFrameId,
    score: event.score, windowFrameIds: event.frameIds,
  }));
}
function identitySeed(inspection, sourceSha256, segment, timing) {
  return {
    evidenceVersion: 1,
    ...(inspection.sourceGrid ? { sourceGrid: inspection.sourceGrid } : {}),
    ...(segment ? { segment } : {}),
    sourceKind: inspection.sourceKind,
    sourceSha256,
    ...(inspection.timingMode === "seconds" ? { timing } : {}),
    timingMode: inspection.timingMode,
  };
}
function evidenceFocus(focusWindows, reviewedFrames) {
  return focusWindows.map((focus) => {
    const frames = reviewedFrames.filter(({ timeSeconds }) =>
      timeSeconds >= focus.startSeconds && timeSeconds <= focus.endSeconds);
    return {
      endSeconds: focus.endSeconds,
      frameIds: frames.map(({ frameId }) => frameId),
      sourceFrameEndIndex: frames.at(-1).sourceFrameIndex,
      sourceFrameStartIndex: frames[0].sourceFrameIndex,
      startSeconds: focus.startSeconds,
    };
  });
}

async function stageOne(input, plan) {
  const { dependencies, inspection, materializedByIndex, options, scan,
    selection, sourceSha256, stagingRoot } = input;
  const timing = inspection.timingMode === "seconds" ? timingAuthority(options) : undefined;
  const seed = identitySeed(inspection, sourceSha256, plan.segment, timing);
  const studyId = createToolcraftMotionReferenceStudyId(seed);
  const stagingDirectory = path.join(stagingRoot, studyId);
  await dependencies.fileSystem.mkdir(stagingDirectory);
  const frames = plan.reviewFrameIndices.map((index) => materializedByIndex.get(index));
  const sheetPath = path.join(stagingDirectory, "contact-sheet.png");
  const sheet = await dependencies.createContactSheet({
    execute: dependencies.execute, frames, outputPath: sheetPath,
    sourceHeight: inspection.height, sourceWidth: inspection.width,
  });
  const reviewedFrames = frames.map((frame, index) => ({
    cell: { column: sheet.cells[index].column, row: sheet.cells[index].row },
    frameId: `source-frame:${frame.sourceFrameIndex}`,
    sourceFrameIndex: frame.sourceFrameIndex, sourceLocator: frame.sourceLocator,
    sourceSha256,
    ...(inspection.timingMode === "seconds" ? {
      timeSeconds: inspection.frameTimes[frame.sourceFrameIndex],
    } : {}),
  }));
  const overviewSet = new Set(plan.overviewFrameIndices);
  const overviewFrameIds = reviewedFrames.filter(({ sourceFrameIndex }, index) =>
    overviewSet.has(sourceFrameIndex) || index === 0 || index === reviewedFrames.length - 1)
    .map(({ frameId }) => frameId);
  const relativeDirectory = path.posix.join("src/app/reference-studies", studyId);
  return {
    raw: {
      changeMetric: scan.changeMetric,
      contactSheet: {
        columns: sheet.columns, height: sheet.height,
        path: path.posix.join(relativeDirectory, "contact-sheet.png"),
        rows: sheet.rows,
        sha256: createToolcraftSha256(await dependencies.fileSystem.readFile(sheetPath)),
        width: sheet.width,
      },
      decodedFrameCount: inspection.decodedFrameCount,
      detectedEvents: evidenceEvents(selection.events, plan.eventIds),
      evidenceVersion: 1, ffmpegVersion: inspection.ffmpegVersion,
      ffprobeVersion: inspection.ffprobeVersion,
      focusWindows: inspection.timingMode === "seconds" ?
        evidenceFocus(plan.focusWindows, reviewedFrames) : [],
      height: inspection.height, overviewFrameIds, reviewedFrames,
      scannedFrameCount: scan.scannedFrameCount,
      sourceBasename: inspection.sourceBasename, sourceKind: inspection.sourceKind,
      sourceSha256, studyId, timingMode: inspection.timingMode, width: inspection.width,
      ...(inspection.sourceGrid ? { sourceGrid: inspection.sourceGrid } : {}),
      ...(inspection.timingMode === "seconds" ? {
        durationSeconds: inspection.durationSeconds,
        maximumSourceFrameGapSeconds: maximumFrameGap(inspection.frameTimes),
        ...(inspection.nominalFrameRate ? { nominalFrameRate: inspection.nominalFrameRate } : {}),
        overviewTargetFps: TOOLCRAFT_MOTION_OVERVIEW_FPS,
        ...(plan.partition ? { reviewPartition: {
          ...plan.partition,
          groupId: createToolcraftMotionReferenceGroupId(seed, plan.partition.scope),
          planSha256: "0".repeat(64),
        } } : {}),
        ...(plan.segment ? { segment: plan.segment } : {}), timing,
      } : {}),
    },
    stagingDirectory,
  };
}

export async function stageToolcraftMotionReferenceEvidences(input) {
  const records = [];
  for (const plan of input.review.plans) records.push(await stageOne({
    ...input, selection: input.review.selection,
  }, plan));
  if (records.length > 1) {
    const planSha256 = createToolcraftMotionReferencePlanSha256(
      records.map(({ raw }) => raw),
    );
    records.forEach(({ raw }) => { raw.reviewPartition.planSha256 = planSha256; });
  }
  return Promise.all(records.map(async ({ raw, stagingDirectory }) => {
    const evidence = defineToolcraftMotionReferenceEvidence(raw);
    await input.dependencies.fileSystem.writeFile(
      path.join(stagingDirectory, "evidence.json"),
      writeCanonicalToolcraftMotionReferenceEvidence(evidence),
    );
    return { evidence, stagingDirectory };
  }));
}
