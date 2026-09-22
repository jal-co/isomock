export const TOOLCRAFT_MODEL_WORKER_SNAPSHOT_CHUNK_BYTES = 1024 * 1024;

export type ToolcraftModelWorkerYieldToHost = () => Promise<void>;

export type ToolcraftModelWorkerBufferSource = Readonly<{
  byteLength: number;
  bytes: Uint8Array;
}>;

export type ToolcraftModelWorkerBufferCopies =
  | Promise<readonly ArrayBuffer[] | undefined>
  | readonly ArrayBuffer[]
  | undefined;

const arrayBufferByteLengthGetter = Object.getOwnPropertyDescriptor(
  ArrayBuffer.prototype,
  "byteLength",
)?.get;
const typedArrayPrototype = Object.getPrototypeOf(Uint8Array.prototype) as object;
const typedArrayBufferGetter = Object.getOwnPropertyDescriptor(
  typedArrayPrototype,
  "buffer",
)?.get;
const typedArrayByteLengthGetter = Object.getOwnPropertyDescriptor(
  typedArrayPrototype,
  "byteLength",
)?.get;
const typedArrayByteOffsetGetter = Object.getOwnPropertyDescriptor(
  typedArrayPrototype,
  "byteOffset",
)?.get;
const typedArrayTagGetter = Object.getOwnPropertyDescriptor(
  typedArrayPrototype,
  Symbol.toStringTag,
)?.get;

function inspectArrayBuffer(value: unknown): ToolcraftModelWorkerBufferSource | undefined {
  if (!arrayBufferByteLengthGetter) return undefined;
  try {
    const byteLength = Reflect.apply(arrayBufferByteLengthGetter, value, []) as number;
    if (!Number.isSafeInteger(byteLength) || byteLength <= 0) return undefined;
    const bytes = new Uint8Array(value as ArrayBuffer);
    if (bytes.byteLength !== byteLength) return undefined;
    return Object.freeze({ byteLength, bytes });
  } catch {
    return undefined;
  }
}

function inspectUint8Array(value: unknown): ToolcraftModelWorkerBufferSource | undefined {
  if (!typedArrayBufferGetter || !typedArrayByteLengthGetter ||
      !typedArrayByteOffsetGetter || !typedArrayTagGetter ||
      !arrayBufferByteLengthGetter) return undefined;
  try {
    if (Reflect.apply(typedArrayTagGetter, value, []) !== "Uint8Array") return undefined;
    const buffer = Reflect.apply(typedArrayBufferGetter, value, []) as ArrayBuffer;
    const byteLength = Reflect.apply(typedArrayByteLengthGetter, value, []) as number;
    const byteOffset = Reflect.apply(typedArrayByteOffsetGetter, value, []) as number;
    const bufferByteLength = Reflect.apply(
      arrayBufferByteLengthGetter,
      buffer,
      [],
    ) as number;
    if (!Number.isSafeInteger(byteLength) || byteLength <= 0 ||
        !Number.isSafeInteger(byteOffset) || byteOffset < 0 ||
        !Number.isSafeInteger(bufferByteLength) ||
        byteOffset > bufferByteLength - byteLength) return undefined;
    return Object.freeze({
      byteLength,
      bytes: new Uint8Array(buffer, byteOffset, byteLength),
    });
  } catch {
    return undefined;
  }
}

export function inspectToolcraftModelWorkerArrayBuffer(
  value: unknown,
): ToolcraftModelWorkerBufferSource | undefined {
  return inspectArrayBuffer(value);
}

export function inspectToolcraftModelWorkerBuffer(
  value: unknown,
): ToolcraftModelWorkerBufferSource | undefined {
  return inspectArrayBuffer(value) ?? inspectUint8Array(value);
}

function assertSourceReadable(source: ToolcraftModelWorkerBufferSource): void {
  if (source.bytes.byteLength !== source.byteLength) {
    throw new Error("A model worker snapshot source became unreadable.");
  }
}

function copySmallBuffers(
  sources: readonly ToolcraftModelWorkerBufferSource[],
  isCurrent: () => boolean,
): readonly ArrayBuffer[] | undefined {
  const copies: ArrayBuffer[] = [];
  for (const source of sources) {
    if (!isCurrent()) return undefined;
    assertSourceReadable(source);
    const destination = new Uint8Array(source.byteLength);
    destination.set(source.bytes);
    copies.push(destination.buffer);
  }
  return Object.freeze(copies);
}

async function copyLargeBuffers(
  sources: readonly ToolcraftModelWorkerBufferSource[],
  isCurrent: () => boolean,
  yieldToHost: ToolcraftModelWorkerYieldToHost,
): Promise<readonly ArrayBuffer[] | undefined> {
  const copies: ArrayBuffer[] = [];
  let bytesUntilYield = TOOLCRAFT_MODEL_WORKER_SNAPSHOT_CHUNK_BYTES;
  for (let sourceIndex = 0; sourceIndex < sources.length; sourceIndex += 1) {
    const source = sources[sourceIndex]!;
    if (!isCurrent()) return undefined;
    assertSourceReadable(source);
    const destination = new Uint8Array(source.byteLength);
    copies.push(destination.buffer);
    let offset = 0;
    while (offset < source.byteLength) {
      if (!isCurrent()) return undefined;
      assertSourceReadable(source);
      const copyByteLength = Math.min(
        bytesUntilYield,
        source.byteLength - offset,
      );
      destination.set(
        source.bytes.subarray(offset, offset + copyByteLength),
        offset,
      );
      offset += copyByteLength;
      bytesUntilYield -= copyByteLength;
      const hasMore = offset < source.byteLength || sourceIndex < sources.length - 1;
      if (bytesUntilYield === 0 && hasMore) {
        await yieldToHost();
        if (!isCurrent()) return undefined;
        bytesUntilYield = TOOLCRAFT_MODEL_WORKER_SNAPSHOT_CHUNK_BYTES;
      }
    }
  }
  return Object.freeze(copies);
}

export function copyToolcraftModelWorkerBuffers(
  sources: readonly ToolcraftModelWorkerBufferSource[],
  totalByteLength: number,
  isCurrent: () => boolean,
  yieldToHost: ToolcraftModelWorkerYieldToHost,
): ToolcraftModelWorkerBufferCopies {
  if (!isCurrent()) return undefined;
  return totalByteLength <= TOOLCRAFT_MODEL_WORKER_SNAPSHOT_CHUNK_BYTES
    ? copySmallBuffers(sources, isCurrent)
    : copyLargeBuffers(sources, isCurrent, yieldToHost);
}

function yieldWithMessageChannel(): Promise<void> | undefined {
  if (typeof MessageChannel !== "function") return undefined;
  try {
    return new Promise((resolve) => {
      const channel = new MessageChannel();
      channel.port1.onmessage = () => {
        channel.port1.close();
        channel.port2.close();
        resolve();
      };
      channel.port2.postMessage(undefined);
    });
  } catch {
    return undefined;
  }
}

export async function yieldToToolcraftModelWorkerHost(): Promise<void> {
  const scheduler = (globalThis as Readonly<{
    scheduler?: Readonly<{ yield?: () => Promise<void> }>;
  }>).scheduler;
  if (typeof scheduler?.yield === "function") {
    try {
      await Reflect.apply(scheduler.yield, scheduler, []);
      return;
    } catch {
      // Fall through to a broadly supported macrotask boundary.
    }
  }
  const channelYield = yieldWithMessageChannel();
  if (channelYield) {
    await channelYield;
    return;
  }
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}
