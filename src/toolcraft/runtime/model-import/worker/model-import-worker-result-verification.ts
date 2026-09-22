export type ToolcraftModelWorkerAsyncSha256 = (
  value: ArrayBuffer | Uint8Array<ArrayBuffer>,
) => Promise<string>;

function digestHex(bytes: ArrayBuffer): string {
  let result = "";
  for (const value of new Uint8Array(bytes)) {
    result += value.toString(16).padStart(2, "0");
  }
  return result;
}

/** Browser WebCrypto performs all geometry/plan-sized hashing off the event turn. */
export const sha256ToolcraftModelWorkerBytes:
ToolcraftModelWorkerAsyncSha256 = async (value) => {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error("WebCrypto SHA-256 is unavailable for model worker verification.");
  }
  const digest = await subtle.digest("SHA-256", value);
  return `sha256:${digestHex(digest)}`;
};
