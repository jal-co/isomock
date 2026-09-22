import {
  createToolcraftMotionAnalysisGraph,
  createToolcraftMotionAnalysisOutputArguments,
} from "./toolcraft-motion-reference-analysis-protocol.mjs";

function fail(message) {
  throw new TypeError(`Invalid Toolcraft image filter graph input: ${message}`);
}

function validateIndices(inspection, indices) {
  if (!inspection || !Array.isArray(inspection.frames) ||
      !Array.isArray(indices) || indices.length === 0 ||
      indices.some((index) => !Number.isInteger(index) || index < 0 ||
        index >= inspection.frames.length)) {
    fail("source frame indices must identify inspected frames");
  }
}

function sequenceGraph(inspection, indices) {
  if (inspection.sourceKind === "frame-sequence") {
    const args = indices.flatMap((index) => ["-i", inspection.frames[index].sourceLocator]);
    if (indices.length === 1) return { args, graph: "[0:v]null[sequence]" };
    const labels = indices.map((_, inputIndex) => `[${inputIndex}:v]`).join("");
    return { args, graph: `${labels}concat=n=${indices.length}:v=1:a=0[sequence]` };
  }
  if (inspection.sourceKind !== "contact-sheet") fail("source kind is unsupported");
  if (typeof inspection.inputPath !== "string" || inspection.inputPath.length === 0) {
    fail("contact-sheet input path is required");
  }
  const args = ["-i", inspection.inputPath];
  const crops = indices.map((index, inputIndex) => {
    const { column, row } = inspection.frames[index].cell;
    return `[0:v]crop=w=${inspection.width}:h=${inspection.height}:` +
      `x=${column * inspection.width}:y=${row * inspection.height}[cell${inputIndex}]`;
  });
  if (indices.length === 1) {
    return { args, graph: `${crops[0]};[cell0]null[sequence]` };
  }
  const labels = indices.map((_, inputIndex) => `[cell${inputIndex}]`).join("");
  return {
    args,
    graph: `${crops.join(";")};${labels}concat=n=${indices.length}:v=1:a=0[sequence]`,
  };
}

function timestampExpression(frameTimes) {
  if (frameTimes.length === 1) return `${frameTimes[0]}/TB`;
  let expression = `${frameTimes.at(-1)}/TB`;
  for (let index = frameTimes.length - 2; index >= 0; index -= 1) {
    expression = `if(eq(N,${index}),${frameTimes[index]}/TB,${expression})`;
  }
  return `'${expression}'`;
}

function analysisTimeline(inspection, indices, timelineMode) {
  if (timelineMode === "loop-seam" || inspection.timingMode === "ordinal") {
    return "[sequence]settb=AVTB,setpts=N/TB[timed]";
  }
  if (timelineMode !== "source") fail("analysis timeline mode is unsupported");
  const frameTimes = indices.map((index) => inspection.frameTimes[index]);
  if (frameTimes.some((value) => typeof value !== "number" || !Number.isFinite(value))) {
    fail("authoritative frame timestamps must be finite");
  }
  return `[sequence]settb=AVTB,setpts=${timestampExpression(frameTimes)}[timed]`;
}

export function createToolcraftMotionImageAnalysisArguments({
  indices,
  inspection,
  timelineMode = "source",
}) {
  validateIndices(inspection, indices);
  const sequence = sequenceGraph(inspection, indices);
  const graph = `${sequence.graph};${analysisTimeline(
    inspection, indices, timelineMode,
  )};${createToolcraftMotionAnalysisGraph("[timed]", inspection.hasAlpha)}`;
  return [
    "-loglevel", "error", "-nostats", ...sequence.args,
    "-filter_complex", graph,
    ...createToolcraftMotionAnalysisOutputArguments(inspection.hasAlpha),
  ];
}

export function createToolcraftMotionImageMaterializeArguments({
  inspection,
  outputPattern,
  sourceFrameIndices,
}) {
  validateIndices(inspection, sourceFrameIndices);
  if (typeof outputPattern !== "string" || outputPattern.length === 0) {
    fail("a materialized PNG output pattern is required");
  }
  const sequence = sequenceGraph(inspection, sourceFrameIndices);
  return [
    "-loglevel", "error", ...sequence.args,
    "-filter_complex", `${sequence.graph};` +
      "[sequence]settb=AVTB,setpts=N/TB[materialized]",
    "-map", "[materialized]", "-fps_mode", "vfr",
    "-start_number", "0", outputPattern,
  ];
}
