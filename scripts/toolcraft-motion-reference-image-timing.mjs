import fs from "node:fs/promises";

import { createToolcraftSha256 } from "./toolcraft-motion-reference-artifacts.mjs";
import { createToolcraftMotionInputError } from "./toolcraft-motion-reference-stage.mjs";

function fail(message, cause) {
  throw createToolcraftMotionInputError(message, cause);
}

function validateIntrinsic(inspection) {
  if (!inspection || !Number.isSafeInteger(inspection.decodedFrameCount) ||
      inspection.decodedFrameCount <= 0 || inspection.timingMode !== "ordinal" ||
      !["contact-sheet", "frame-sequence"].includes(inspection.sourceKind) ||
      Object.hasOwn(inspection, "frameTimes") || Object.hasOwn(inspection, "timing")) {
    fail("Apply declared timing only to an intrinsic ordinal inspected image source.");
  }
}

function strictTimestamps(value, count) {
  if (!Array.isArray(value) || value.length !== count) {
    fail("Provide one finite, strictly increasing timestamp per inspected image frame.");
  }
  if (count < 2) {
    fail("Provide at least two declared timestamps to derive duration and cadence, or use --fps for a one-frame image source.");
  }
  value.forEach((timestamp, index) => {
    if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) {
      fail("Provide one finite, strictly increasing timestamp per inspected image frame.");
    }
    if (index > 0 && timestamp <= value[index - 1]) {
      fail("Provide one finite, strictly increasing timestamp per inspected image frame.");
    }
  });
  const origin = value[0];
  return value.map((timestamp) => timestamp - origin);
}

async function declaredTimestamps(filePath, count, readFile) {
  let bytes;
  let document;
  try {
    bytes = await readFile(filePath);
    document = JSON.parse(bytes.toString("utf8"));
  } catch (error) {
    fail("Provide a readable timestamps JSON file with one finite, strictly increasing value per frame.", error);
  }
  return {
    authority: "declared-timestamps",
    frameTimes: strictTimestamps(document, count),
    timestampsSha256: createToolcraftSha256(bytes),
  };
}

export async function applyToolcraftMotionDeclaredImageTiming(
  inspection,
  declaration,
  { readFile = fs.readFile } = {},
) {
  validateIntrinsic(inspection);
  if (declaration.framesPerSecond === undefined && !declaration.timestampsFile) {
    return inspection;
  }
  if (declaration.framesPerSecond !== undefined && declaration.timestampsFile) {
    fail("Choose exactly one timing authority for images: --fps or --timestamps-file.");
  }
  let timing;
  if (declaration.framesPerSecond !== undefined) {
    const rate = declaration.framesPerSecond;
    if (!(rate > 0) || !Number.isFinite(rate)) {
      fail("Provide --fps as a positive finite number.");
    }
    timing = {
      authority: "declared-fps",
      frameTimes: Array.from({ length: inspection.decodedFrameCount },
        (_, index) => index / rate),
      framesPerSecond: rate,
    };
  } else {
    timing = await declaredTimestamps(
      declaration.timestampsFile, inspection.decodedFrameCount, readFile,
    );
  }
  const lastFrameTime = timing.frameTimes.at(-1);
  const tail = timing.authority === "declared-fps" ?
    1 / timing.framesPerSecond : lastFrameTime - timing.frameTimes.at(-2);
  return {
    ...inspection,
    durationSeconds: lastFrameTime + tail,
    frameTimes: timing.frameTimes,
    ...(timing.authority === "declared-fps" ? {
      nominalFrameRate: timing.framesPerSecond,
    } : {}),
    timing,
    timingMode: "seconds",
  };
}
