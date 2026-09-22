export type ToolcraftPresentationResourceHandle = {
  release: () => void;
  url: string;
};

export type ToolcraftSourceAssetPresentationResources = {
  dispose: () => void;
  retain: (
    resourceRef: string,
    contentType: string,
  ) => Promise<ToolcraftPresentationResourceHandle>;
};

type PresentationResourceEntry = {
  abortController: AbortController;
  count: number;
  releaseResourceRef: () => void;
  url?: string;
  urlPromise: Promise<string>;
};

export function createToolcraftSourceAssetPresentationResources({
  createObjectUrl,
  resolveResource,
  retainResourceRef,
  revokeObjectUrl = (url: string) => URL.revokeObjectURL(url),
}: {
  createObjectUrl?: (blob: Blob) => string;
  resolveResource: (
    ref: string,
    options: Readonly<{ signal: AbortSignal }>,
  ) => Promise<Uint8Array | null>;
  retainResourceRef: (ref: string) => () => void;
  revokeObjectUrl?: (url: string) => void;
}): ToolcraftSourceAssetPresentationResources {
  const entries = new Map<string, PresentationResourceEntry>();
  let disposed = false;

  const releaseEntry = (
    resourceRef: string,
    entry: PresentationResourceEntry,
  ): void => {
    entry.count -= 1;

    if (entry.count > 0 || entries.get(resourceRef) !== entry) {
      return;
    }

    entries.delete(resourceRef);
    entry.abortController.abort();
    entry.releaseResourceRef();

    if (entry.url?.startsWith("blob:")) {
      revokeObjectUrl(entry.url);
    }
  };

  return {
    dispose() {
      if (disposed) {
        return;
      }

      disposed = true;

      for (const [resourceRef, entry] of entries) {
        entry.count = 1;
        releaseEntry(resourceRef, entry);
      }
    },
    async retain(resourceRef, contentType) {
      if (disposed) {
        throw new Error("Source asset presentation resources are disposed.");
      }

      let entry = entries.get(resourceRef);

      if (entry) {
        entry.count += 1;
      } else {
        const abortController = new AbortController();
        const releaseResourceRef = retainResourceRef(resourceRef);
        const nextEntry: PresentationResourceEntry = {
          abortController,
          count: 1,
          releaseResourceRef,
          urlPromise: Promise.resolve(""),
        };
        nextEntry.urlPromise = resolveResource(resourceRef, {
          signal: abortController.signal,
        }).then((bytes) => {
          if (!bytes) {
            throw new Error(`Binary media resource "${resourceRef}" is unavailable.`);
          }

          const blobBytes = new Uint8Array(bytes);
          const url = createObjectUrl
            ? createObjectUrl(
                new Blob([blobBytes.buffer], { type: contentType }),
              )
            : typeof URL.createObjectURL === "function"
              ? URL.createObjectURL(
                  new Blob([blobBytes.buffer], { type: contentType }),
                )
              : `data:${contentType};base64,${btoa(
                  String.fromCharCode(...blobBytes),
                )}`;

          if (disposed || abortController.signal.aborted) {
            if (url.startsWith("blob:")) {
              revokeObjectUrl(url);
            }
            throw new Error("Source asset presentation resource was released.");
          }

          nextEntry.url = url;
          return url;
        });
        entries.set(resourceRef, nextEntry);
        entry = nextEntry;
      }

      try {
        const url = await entry.urlPromise;
        let released = false;

        return {
          release: () => {
            if (released) {
              return;
            }

            released = true;
            releaseEntry(resourceRef, entry);
          },
          url,
        };
      } catch (error) {
        releaseEntry(resourceRef, entry);
        throw error;
      }
    },
  };
}
