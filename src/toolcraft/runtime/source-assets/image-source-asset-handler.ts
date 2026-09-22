import {
  isToolcraftImageFile,
  readImportedImageFile,
} from "./media-file";
import { createToolcraftMediaResourceRef } from "./media-resource-ref";
import {
  doesToolcraftControlAcceptBatch,
} from "./file-source-asset-handler";
import { prepareToolcraftSourceAssetBatch } from "./source-asset-batch-preparation";
import type {
  ToolcraftPreparedSourceAssetRecord,
  ToolcraftSourceAssetHandler,
} from "./source-asset-types";
import { defaultToolcraftSceneElementFrame } from "../state/scene-element-frame";

function throwIfAborted(signal: AbortSignal): void {
  if (!signal.aborted) {
    return;
  }

  const error = new Error("Source asset import was cancelled");
  error.name = "AbortError";
  throw error;
}

export const toolcraftImageSourceAssetHandler: ToolcraftSourceAssetHandler<
  "image",
  ToolcraftPreparedSourceAssetRecord<"image">
> = {
  kind: "image",
  match: (batch, control) => {
    if (
      control.type !== "fileDrop" ||
      control.assetKind === "file" ||
      control.assetKind === "model" ||
      !doesToolcraftControlAcceptBatch(control, batch) ||
      !batch.files.every(isToolcraftImageFile)
    ) {
      return null;
    }

    return {
      handlerKind: "image",
      rootFileNames: batch.files.map((file) => file.name),
      specificity: 100,
    };
  },
  plan: (batch, control, claim) => ({
    claim,
    logicalAssetCount: batch.files.length,
    replaceExisting: control.multiple !== true,
    target: batch.target ?? control.target,
  }),
  prepare: async (context) => {
    let completedCount = 0;
    const stagedResourceRefs = new Set<string>();
    context.reportOperation({ phase: "decoding", progress: 0 });
    const assets = await prepareToolcraftSourceAssetBatch(
      context.batch.files,
      context.signal,
      async (file, signal) => {
        throwIfAborted(signal);
        const imported = await readImportedImageFile(
          file,
          context.canvasFrame.kind === "finite"
            ? context.canvasFrame.size
            : defaultToolcraftSceneElementFrame.size,
          signal,
        );
        throwIfAborted(signal);

        if (!imported) {
          throw new Error(`Could not decode image file "${file.name}".`);
        }

        const mimeType = file.type || "image/*";
        const resourceRef = createToolcraftMediaResourceRef(
          "image",
          imported.bytes,
        );
        await context.stageResource(resourceRef, imported.bytes, {
          contentType: mimeType,
          durable: true,
        });
        stagedResourceRefs.add(resourceRef);

        completedCount += 1;
        context.reportOperation({
          phase: "decoding",
          progress: completedCount / context.batch.files.length,
        });

        return {
          assetKind: "image" as const,
          fileName: file.name,
          sourcePaths: [file.webkitRelativePath || file.name],
          lifecycle: "ready" as const,
          mimeType,
          position: context.batch.position
            ? { ...context.batch.position }
            : { x: 0, y: 0 },
          sourceSize: imported.size,
          resourceRef,
          ...(context.plan.sourceTarget
            ? { sourceTarget: context.plan.sourceTarget }
            : {}),
        };
      },
    );

    return {
      assets,
      stagedResourceRefs: Object.freeze([...stagedResourceRefs].sort()),
    };
  },
};
