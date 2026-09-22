import path from "node:path";

function fail(message) {
  throw new TypeError(`Invalid Toolcraft motion review output: ${message}`);
}

function validateOutputDirectory(outputDirectory) {
  if (typeof outputDirectory !== "string" || outputDirectory.length === 0) {
    fail("an output directory is required");
  }
}

export function validateToolcraftMotionReviewFrameIndices(indices, frameCount) {
  if (!Number.isInteger(frameCount) || frameCount <= 0 ||
      !Array.isArray(indices) || indices.length === 0) {
    fail("at least one review frame index and a positive frame count are required");
  }
  indices.forEach((index, position) => {
    if (!Number.isInteger(index) || index < 0 || index >= frameCount ||
        (position > 0 && index <= indices[position - 1])) {
      fail("review frame indices must be unique, ordered, and in range");
    }
  });
}

export function createToolcraftMotionReviewOutputPattern(outputDirectory) {
  validateOutputDirectory(outputDirectory);
  return path.join(outputDirectory, "review-%06d.png");
}

export function createToolcraftMotionReviewOutputPath(outputDirectory, ordinal) {
  validateOutputDirectory(outputDirectory);
  if (!Number.isInteger(ordinal) || ordinal < 0) {
    fail("a nonnegative review output ordinal is required");
  }
  return path.join(outputDirectory,
    `review-${String(ordinal).padStart(6, "0")}.png`);
}
