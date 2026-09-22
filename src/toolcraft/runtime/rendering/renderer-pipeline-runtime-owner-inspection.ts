import type { ToolcraftRendererPipelineRuntimeOwner } from "./renderer-pipeline-runtime-owner";

const retainedGenerationReaders = new WeakMap<
  ToolcraftRendererPipelineRuntimeOwner,
  () => number
>();

export function registerRendererPipelineRuntimeOwnerInspection(
  owner: ToolcraftRendererPipelineRuntimeOwner,
  readRetainedGenerationCount: () => number,
): void {
  retainedGenerationReaders.set(owner, readRetainedGenerationCount);
}

export function getRetainedRendererPipelineRuntimeGenerationCount(
  owner: ToolcraftRendererPipelineRuntimeOwner,
): number {
  const read = retainedGenerationReaders.get(owner);
  if (!read) {
    throw new Error("Renderer pipeline runtime owner inspection is unavailable.");
  }
  return read();
}
