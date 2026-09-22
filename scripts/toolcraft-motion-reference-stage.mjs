import {
  requireToolcraftMotionReferenceStage,
} from "./toolcraft-motion-reference-stage-registry.mjs";

export class ToolcraftMotionReferenceInputError extends Error {
  constructor(correction, cause) {
    if (typeof correction !== "string" || correction.length === 0 ||
        correction.length > 140 || correction.includes("\n")) {
      throw new TypeError("A bounded single-line motion reference correction is required.");
    }
    super(`Invalid Toolcraft motion reference input. ${correction}`, { cause });
    this.correction = correction;
    this.name = "ToolcraftMotionReferenceInputError";
  }
}

export function createToolcraftMotionInputError(correction, cause) {
  if (cause instanceof ToolcraftMotionReferenceInputError) return cause;
  return new ToolcraftMotionReferenceInputError(correction, cause);
}

export class ToolcraftMotionReferenceStageError extends Error {
  constructor(stageDescriptor, message, cause) {
    const descriptor = requireToolcraftMotionReferenceStage(stageDescriptor);
    super(`Toolcraft motion reference ${descriptor.name} failed: ${message}`, { cause });
    this.action = descriptor.action;
    this.name = "ToolcraftMotionReferenceStageError";
    this.stage = descriptor.name;
  }
}

export function createToolcraftMotionStageError(stageDescriptor, error) {
  if (error instanceof ToolcraftMotionReferenceInputError) return error;
  if (error instanceof ToolcraftMotionReferenceStageError) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new ToolcraftMotionReferenceStageError(stageDescriptor, message, error);
}

export async function runToolcraftMotionStage(execute, request) {
  const descriptor = requireToolcraftMotionReferenceStage(request.stage);
  const processRequest = { ...request, stage: descriptor.name };
  let result;
  try {
    result = await execute(processRequest);
  } catch (error) {
    throw createToolcraftMotionStageError(descriptor, error);
  }
  if (result?.exitCode !== undefined && result.exitCode !== 0) {
    throw createToolcraftMotionStageError(descriptor,
      result.error ?? new Error(`process exited with code ${result.exitCode}`));
  }
  return result ?? {};
}

export function parseToolcraftMotionStage(stageDescriptor, parse) {
  try {
    return parse();
  } catch (error) {
    throw createToolcraftMotionStageError(stageDescriptor, error);
  }
}

export function formatToolcraftMotionReferenceError(error) {
  if (error instanceof ToolcraftMotionReferenceInputError) {
    return `Motion reference input is invalid. ${error.correction}`;
  }
  if (error instanceof ToolcraftMotionReferenceStageError) {
    return `Motion reference ${error.stage} failed. ${error.action}`;
  }
  return "Motion reference preprocessing failed. Check the command arguments and source accessibility, then retry.";
}
