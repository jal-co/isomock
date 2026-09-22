import type { ToolcraftCanvasSize } from "../schema/types";

export type ToolcraftImportedImageFile = {
  bytes: Uint8Array;
  size: ToolcraftCanvasSize;
};

export type ToolcraftImportedFile = {
  bytes: Uint8Array;
};

function createAbortError(): Error {
  const error = new Error("Media file reading was cancelled");
  error.name = "AbortError";
  return error;
}

export async function readToolcraftFileBytes(
  file: File,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  if (signal?.aborted) {
    throw createAbortError();
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  if (signal?.aborted) {
    throw createAbortError();
  }

  return bytes;
}

function readImageBytesSize(
  bytes: Uint8Array,
  contentType: string,
  signal?: AbortSignal,
): Promise<ToolcraftCanvasSize | null> {
  if (signal?.aborted) {
    return Promise.reject(createAbortError());
  }
  if (typeof Image === "undefined") {
    return Promise.resolve(null);
  }

  if (typeof URL.createObjectURL !== "function") {
    return Promise.resolve(null);
  }

  const blobBytes = new Uint8Array(bytes);
  const objectUrl = URL.createObjectURL(
    new Blob([blobBytes.buffer], { type: contentType }),
  );

  return new Promise((resolve, reject) => {
    const image = new Image();
    let resolved = false;
    let fallbackTimeout: number | undefined;
    const jsdomFallback =
      typeof navigator !== "undefined" &&
      navigator.userAgent.toLowerCase().includes("jsdom");
    const cleanup = (): void => {
      if (fallbackTimeout !== undefined) {
        window.clearTimeout(fallbackTimeout);
        fallbackTimeout = undefined;
      }
      image.removeEventListener("error", handleError);
      image.removeEventListener("load", handleLoad);
      signal?.removeEventListener("abort", handleAbort);
      URL.revokeObjectURL(objectUrl);
    };
    const finish = (size: ToolcraftCanvasSize | null): void => {
      if (resolved) {
        return;
      }

      resolved = true;
      cleanup();
      resolve(size);
    };
    const handleAbort = (): void => {
      if (resolved) {
        return;
      }

      resolved = true;
      cleanup();
      image.src = "";
      reject(createAbortError());
    };
    const handleLoad = (): void => {
      const width = Math.round(image.naturalWidth || image.width);
      const height = Math.round(image.naturalHeight || image.height);

      finish(
        width > 0 && height > 0
          ? {
              height,
              unit: "px",
              width,
            }
          : null,
      );
    };
    const handleError = (): void => finish(null);

    fallbackTimeout = window.setTimeout(
      () => finish(null),
      jsdomFallback ? 0 : 5000,
    );
    image.addEventListener("error", handleError);
    image.addEventListener("load", handleLoad);
    signal?.addEventListener("abort", handleAbort, { once: true });
    image.src = objectUrl;
  });
}

export function isToolcraftImageFile(file: File): boolean {
  return (
    file.type.startsWith("image/") ||
    /\.(avif|gif|heic|heif|jpe?g|png|svg|tiff?|webp)$/i.test(file.name)
  );
}

export async function readImportedFile(
  file: File,
  signal?: AbortSignal,
): Promise<ToolcraftImportedFile | null> {
  return { bytes: await readToolcraftFileBytes(file, signal) };
}

export async function readImportedImageFile(
  file: File,
  fallbackSize: ToolcraftCanvasSize,
  signal?: AbortSignal,
): Promise<ToolcraftImportedImageFile | null> {
  const bytes = await readToolcraftFileBytes(file, signal);

  return {
    bytes,
    size:
      (await readImageBytesSize(bytes, file.type || "image/*", signal)) ??
      fallbackSize,
  };
}
