import type { ToolcraftControlSchema } from "../schema/types";
import { readImportedFile } from "./media-file";
import { createToolcraftMediaResourceRef } from "./media-resource-ref";
import { prepareToolcraftSourceAssetBatch } from "./source-asset-batch-preparation";
import type {
  ToolcraftPreparedSourceAssetRecord,
  ToolcraftSourceAssetBatch,
  ToolcraftSourceAssetHandler,
} from "./source-asset-types";

function getFileExtension(file: File): string {
  const match = /\.([a-z0-9]+)$/iu.exec(file.name);

  return match?.[1]?.toLowerCase() ?? "";
}

function throwIfAborted(signal: AbortSignal): void {
  if (!signal.aborted) {
    return;
  }

  const error = new Error("Source asset import was cancelled");
  error.name = "AbortError";
  throw error;
}

export function doesToolcraftControlAcceptFile(
  control: ToolcraftControlSchema,
  file: File,
): boolean {
  const accept = control.accept?.trim();

  if (!accept) {
    return true;
  }

  const extension = getFileExtension(file);
  const mimeType = file.type.toLowerCase();

  return accept.split(",").some((rawToken) => {
    const token = rawToken.trim().toLowerCase();

    if (!token) {
      return false;
    }
    if (token.startsWith(".")) {
      return token.slice(1) === extension;
    }
    if (token.endsWith("/*")) {
      return mimeType.startsWith(token.slice(0, -1));
    }
    if (token.includes("/")) {
      return mimeType === token;
    }

    return token === extension;
  });
}

export function doesToolcraftControlAcceptBatch(
  control: ToolcraftControlSchema,
  batch: ToolcraftSourceAssetBatch,
): boolean {
  return (
    batch.files.length > 0 &&
    (control.multiple === true || batch.files.length === 1) &&
    batch.files.every((file) => doesToolcraftControlAcceptFile(control, file))
  );
}

export const toolcraftFileSourceAssetHandler: ToolcraftSourceAssetHandler<
  "file",
  ToolcraftPreparedSourceAssetRecord<"file">
> = {
  kind: "file",
  match: (batch, control) => {
    if (
      control.type !== "fileDrop" ||
      control.assetKind !== "file" ||
      !doesToolcraftControlAcceptBatch(control, batch)
    ) {
      return null;
    }

    return {
      handlerKind: "file",
      rootFileNames: batch.files.map((file) => file.name),
      specificity: 1,
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
    context.reportOperation({ phase: "staging", progress: 0 });
    const assets = await prepareToolcraftSourceAssetBatch(
      context.batch.files,
      context.signal,
      async (file, signal) => {
        throwIfAborted(signal);
        const imported = await readImportedFile(file, signal);
        throwIfAborted(signal);

        if (!imported) {
          throw new Error(`Could not read source file "${file.name}".`);
        }

        const mimeType = file.type || "application/octet-stream";
        const resourceRef = createToolcraftMediaResourceRef(
          "file",
          imported.bytes,
        );
        await context.stageResource(resourceRef, imported.bytes, {
          contentType: mimeType,
          durable: true,
        });
        stagedResourceRefs.add(resourceRef);

        completedCount += 1;
        context.reportOperation({
          phase: "staging",
          progress: completedCount / context.batch.files.length,
        });

        return {
          assetKind: "file" as const,
          fileName: file.name,
          sourcePaths: [file.webkitRelativePath || file.name],
          lifecycle: "ready" as const,
          mimeType,
          position: { x: 0, y: 0 },
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
