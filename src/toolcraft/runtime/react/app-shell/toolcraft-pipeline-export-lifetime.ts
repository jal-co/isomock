import type { ToolcraftRendererPipelineRuntimeOwner } from "../../rendering/renderer-pipeline-runtime-owner";

/** Registration replacement cancels old exports, but cannot destroy resources they still use. */
export function createToolcraftPipelineExportLifetime(
  owner: ToolcraftRendererPipelineRuntimeOwner,
) {
  const exports = new Set<() => void>();
  let retired = false;
  const cancelExports = (): void => {
    for (const cancel of [...exports]) cancel();
  };
  return {
    cancelExports,
    retain(cancel: () => void): () => void {
      if (retired)
        throw new Error("The export renderer registration has been replaced.");
      const releaseOwner = owner.acquire();
      // Each lease is distinct even when two callers have the same cancel callback.
      const cancelExport = () => cancel();
      exports.add(cancelExport);
      let released = false;
      return () => {
        if (released) return;
        released = true;
        exports.delete(cancelExport);
        releaseOwner();
        if (retired && exports.size === 0) owner.disposeAutomatically();
      };
    },
    retire(): void {
      if (retired) return;
      retired = true;
      cancelExports();
      if (exports.size === 0) owner.disposeAutomatically();
    },
  };
}
