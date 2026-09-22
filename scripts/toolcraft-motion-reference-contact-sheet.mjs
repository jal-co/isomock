import { runToolcraftMotionStage } from "./toolcraft-motion-reference-stage.mjs";
import {
  TOOLCRAFT_MOTION_REFERENCE_STAGES,
} from "./toolcraft-motion-reference-stage-registry.mjs";

function fail(message) {
  throw new TypeError(`Invalid Toolcraft motion reference contact sheet: ${message}`);
}

function validateInput({ execute, frames, outputPath, sourceHeight, sourceWidth }) {
  if (typeof execute !== "function") fail("an executor is required");
  if (!Array.isArray(frames) || frames.length === 0) fail("at least one frame is required");
  if (!Number.isInteger(sourceWidth) || sourceWidth <= 0 ||
      !Number.isInteger(sourceHeight) || sourceHeight <= 0) {
    fail("positive integer source dimensions are required");
  }
  if (typeof outputPath !== "string" || outputPath.length === 0) {
    fail("an output PNG path is required");
  }
  const seen = new Set();
  frames.forEach((frame) => {
    if (!Number.isInteger(frame?.sourceFrameIndex) || frame.sourceFrameIndex < 0) {
      fail("every sourceFrameIndex must be a nonnegative integer");
    }
    if (seen.has(frame.sourceFrameIndex)) fail("sourceFrameIndex values must be unique");
    seen.add(frame.sourceFrameIndex);
    if (typeof frame.path !== "string" || frame.path.length === 0) {
      fail("every normalized PNG record must have a path");
    }
    if (typeof frame.sourceLocator !== "string" || frame.sourceLocator.length === 0) {
      fail("every normalized PNG record must have a source locator");
    }
  });
}

function createLayout(frameCount, sourceWidth, sourceHeight) {
  const sourceAspectRatio = sourceWidth / sourceHeight;
  const columns = Math.ceil(Math.sqrt(frameCount * sourceAspectRatio));
  const rows = Math.ceil(frameCount / columns);
  const initialCellWidth = Math.min(480, sourceWidth);
  const initialCellHeight = Math.max(1,
    Math.round(initialCellWidth / sourceAspectRatio));
  const initialWidth = columns * initialCellWidth;
  const initialHeight = rows * initialCellHeight;
  const scale = Math.min(1, 6000 / initialWidth, 6000 / initialHeight);
  const cellWidth = Math.max(1, Math.floor(initialCellWidth * scale));
  const cellHeight = Math.max(1, Math.floor(initialCellHeight * scale));
  return {
    cellHeight,
    cellWidth,
    columns,
    height: rows * cellHeight,
    rows,
    width: columns * cellWidth,
  };
}

function createCells(frames, layout) {
  return frames.map(({ sourceFrameIndex }, ordinal) => {
    const column = ordinal % layout.columns;
    const row = Math.floor(ordinal / layout.columns);
    return {
      column,
      frameId: `source-frame:${sourceFrameIndex}`,
      height: layout.cellHeight,
      row,
      sourceFrameIndex,
      width: layout.cellWidth,
      x: column * layout.cellWidth,
      y: row * layout.cellHeight,
    };
  });
}

function filterGraph(frames, cells, layout) {
  const barHeight = Math.min(28, layout.cellHeight);
  const barY = layout.cellHeight - barHeight;
  const labelX = Math.min(8, layout.cellWidth - 1);
  const prepared = frames.map((frame, index) => {
    const label = `source-frame\\:${frame.sourceFrameIndex}`;
    return `[${index}:v]scale=${layout.cellWidth}:${layout.cellHeight}:` +
      "force_original_aspect_ratio=decrease," +
      `pad=${layout.cellWidth}:${layout.cellHeight}:(ow-iw)/2:(oh-ih)/2:black,` +
      `drawbox=x=0:y=${barY}:w=${layout.cellWidth}:h=${barHeight}:` +
      "color=black@0.65:t=fill," +
      `drawtext=text='${label}':x=${labelX}:y=${barY}:` +
      "fontcolor=white:fontsize=16" +
      `[frame${index}]`;
  });
  if (frames.length === 1) return `${prepared[0]};[frame0]null[sheet]`;
  const inputs = frames.map((_, index) => `[frame${index}]`).join("");
  const positions = cells.map(({ x, y }) => `${x}_${y}`).join("|");
  return `${prepared.join(";")};${inputs}xstack=inputs=${frames.length}:` +
    `layout=${positions}:fill=black[sheet]`;
}

export async function createToolcraftMotionReferenceContactSheet(input) {
  validateInput(input);
  const layout = createLayout(
    input.frames.length, input.sourceWidth, input.sourceHeight,
  );
  const cells = createCells(input.frames, layout);
  const args = [
    "-loglevel", "error",
    ...input.frames.flatMap(({ path }) => ["-i", path]),
    "-filter_complex", filterGraph(input.frames, cells, layout),
    "-map", "[sheet]", "-frames:v", "1", "-y", input.outputPath,
  ];
  await runToolcraftMotionStage(input.execute, {
    args,
    binary: "ffmpeg",
    stage: TOOLCRAFT_MOTION_REFERENCE_STAGES.contactSheet,
  });
  return {
    cells,
    columns: layout.columns,
    height: layout.height,
    outputPath: input.outputPath,
    rows: layout.rows,
    width: layout.width,
  };
}
