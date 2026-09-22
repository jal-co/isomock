export type ToolcraftArtifactDecodedImage = Readonly<{
  source: CanvasImageSource;
  dispose: () => void;
}>;

export type ToolcraftArtifactImageDecoder = (
  bytes: Uint8Array,
  mimeType: string,
  signal: AbortSignal,
) => Promise<ToolcraftArtifactDecodedImage>;

/** Browser-default orientation/color decoding, matching the live image path. */
export const decodeToolcraftArtifactImage: ToolcraftArtifactImageDecoder = (
  bytes,
  mimeType,
  signal,
) => {
  signal.throwIfAborted();
  const image = new Image();
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes).buffer], { type: mimeType }));
  return new Promise((resolve, reject) => {
    let disposed = false;
    const detach = () => {
      image.onload = null;
      image.onerror = null;
      signal.removeEventListener("abort", abort);
    };
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      detach();
      image.src = "";
      URL.revokeObjectURL(url);
    };
    const abort = () => {
      dispose();
      reject(signal.reason);
    };
    image.onload = () => {
      detach();
      resolve({ dispose, source: image });
    };
    image.onerror = () => {
      dispose();
      reject(new Error("Could not decode the source image for export."));
    };
    signal.addEventListener("abort", abort, { once: true });
    image.src = url;
  });
};
