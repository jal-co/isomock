import { collectToolcraftReachableResourceRefs } from "../source-assets/repository/resource-reachability";
import type { ToolcraftImageAsset } from "../state/types";
import {
  decodeToolcraftArtifactImage,
  type ToolcraftArtifactDecodedImage,
  type ToolcraftArtifactImageDecoder,
} from "./artifact-export-image";
import type { ToolcraftArtifactReadonly, ToolcraftArtifactSnapshot } from "./artifact-export-snapshot";

export type ToolcraftArtifactExportResources = Readonly<{
  dispose: () => Promise<void>;
  loadImage: (asset: ToolcraftArtifactReadonly<ToolcraftImageAsset>) => Promise<CanvasImageSource>;
}>;

export type ToolcraftArtifactExportResourceOptions = Readonly<{
  decodeImage?: ToolcraftArtifactImageDecoder;
  resolveResource?: (ref: string, options: Readonly<{ signal: AbortSignal }>) => Promise<Uint8Array | null>;
  retainResourceRef?: (ref: string) => () => void;
  signal: AbortSignal;
  state: ToolcraftArtifactSnapshot;
}>;

function releaseAll(releases: readonly (() => void)[]): unknown[] {
  const errors: unknown[] = [];
  for (const release of [...releases].reverse()) {
    try { release(); } catch (error) { errors.push(error); }
  }
  return errors;
}

/** One accepted export owns these references and decoded sources until actual settlement. */
export function createToolcraftArtifactExportResources({
  decodeImage = decodeToolcraftArtifactImage,
  resolveResource,
  retainResourceRef,
  signal,
  state,
}: ToolcraftArtifactExportResourceOptions): ToolcraftArtifactExportResources {
  signal.throwIfAborted();
  const releases: Array<() => void> = [];
  const refs = collectToolcraftReachableResourceRefs({ state });
  try {
    for (const ref of refs) {
      if (!retainResourceRef) throw new Error("Export cannot retain source resources.");
      releases.push(retainResourceRef(ref));
    }
  } catch (error) {
    const cleanupErrors = releaseAll(releases);
    if (cleanupErrors.length) throw new AggregateError([error, ...cleanupErrors], "Export resource admission failed.");
    throw error;
  }
  const images = new Map<string, Promise<ToolcraftArtifactDecodedImage>>();
  let disposal: Promise<void> | undefined;

  return {
    dispose: () => {
      if (disposal) return disposal;
      disposal = (async () => {
        const loaded = await Promise.allSettled(images.values());
        const imageReleases = loaded.flatMap((result) => result.status === "fulfilled" ? [result.value.dispose] : []);
        const errors = [...releaseAll(imageReleases), ...releaseAll(releases)];
        images.clear();
        if (errors.length) throw new AggregateError(errors, "Export resource cleanup failed.");
      })();
      return disposal;
    },
    loadImage: async (asset) => {
      signal.throwIfAborted();
      if (disposal) throw new Error("Export resources have been released.");
      if (asset.lifecycle !== "ready") throw new Error(`Could not load ${asset.fileName} for export.`);
      // Decoding currently has one browser-default mode; geometry never belongs in this key.
      const key = JSON.stringify([asset.resourceRef, asset.mimeType, "browser-default"]);
      let image = images.get(key);
      if (!image) {
        // Install the Promise before invoking a resolver that can re-enter this session.
        image = Promise.resolve().then(async () => {
          signal.throwIfAborted();
          if (!resolveResource) throw new Error("Export cannot resolve source images.");
          const bytes = await resolveResource(asset.resourceRef, { signal });
          signal.throwIfAborted();
          if (!bytes) throw new Error(`Could not load ${asset.fileName} for export.`);
          return decodeImage(bytes, asset.mimeType, signal);
        });
        images.set(key, image);
      }
      const decoded = await image;
      signal.throwIfAborted();
      if (disposal) throw new Error("Export resources have been released.");
      return decoded.source;
    },
  };
}
