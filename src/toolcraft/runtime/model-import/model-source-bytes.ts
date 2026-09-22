import { failModelSourceBundle } from "./model-source-bundle-error";
import type { ModelSourceFileSnapshot } from "./model-source-path";

const arrayBufferByteLengthGetter = Object.getOwnPropertyDescriptor(
  ArrayBuffer.prototype,
  "byteLength",
)?.get;

function invalidSourceBuffer(): never {
  return failModelSourceBundle(
    "resource-unavailable",
    "source-file-buffer-invalid",
    "The browser returned an invalid source-file byte buffer.",
  );
}

function sourceSizeMismatch(): never {
  return failModelSourceBundle(
    "resource-unavailable",
    "source-file-size-mismatch",
    "The source-file byte length does not match its declared browser metadata.",
  );
}

function copyOwnedArrayBuffer(
  value: unknown,
  declaredByteLength: number,
): Uint8Array {
  if (!arrayBufferByteLengthGetter) return invalidSourceBuffer();

  let intrinsicByteLength: number;
  try {
    intrinsicByteLength = Reflect.apply(arrayBufferByteLengthGetter, value, []);
  } catch {
    return invalidSourceBuffer();
  }
  if (intrinsicByteLength !== declaredByteLength) return sourceSizeMismatch();

  try {
    const sourceView = new Uint8Array(value as ArrayBuffer);
    if (sourceView.byteLength !== intrinsicByteLength) {
      return invalidSourceBuffer();
    }
    const ownedBytes = new Uint8Array(intrinsicByteLength);
    ownedBytes.set(sourceView);
    if (ownedBytes.byteLength !== declaredByteLength) {
      return sourceSizeMismatch();
    }
    return ownedBytes;
  } catch {
    return invalidSourceBuffer();
  }
}

export async function readOwnedModelSourceBytes(
  source: ModelSourceFileSnapshot,
): Promise<Uint8Array> {
  let returnedBuffer: unknown;
  try {
    returnedBuffer = await source.read();
  } catch {
    return failModelSourceBundle(
      "resource-unavailable",
      "source-file-read-failed",
      "The browser could not read a selected source file.",
    );
  }

  const ownedBytes = copyOwnedArrayBuffer(returnedBuffer, source.size);
  returnedBuffer = undefined;
  return ownedBytes;
}

export function copyOwnedBytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}
