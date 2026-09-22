import type { ToolcraftSourceAssetFeedback } from "../../source-assets/source-asset-types";

export class ToolcraftGltfDecodeError
  extends Error
  implements ToolcraftSourceAssetFeedback
{
  readonly category: ToolcraftSourceAssetFeedback["category"];
  readonly code: string;

  constructor(
    category: ToolcraftSourceAssetFeedback["category"],
    code: string,
    message: string,
  ) {
    super(message);
    this.name = "ToolcraftGltfDecodeError";
    this.category = category;
    this.code = code;
  }
}

export function gltfDecodeFailure(
  category: ToolcraftSourceAssetFeedback["category"],
  code: string,
  message: string,
): never {
  throw new ToolcraftGltfDecodeError(category, code, message);
}

export function throwIfGltfDecodeAborted(signal: AbortSignal): void {
  if (!signal.aborted) return;
  throw signal.reason ?? new DOMException("Model decode was cancelled.", "AbortError");
}

export function gltfDecodeCheckpoint(
  signal: AbortSignal,
  index: number,
): void {
  if ((index & 1023) === 0) throwIfGltfDecodeAborted(signal);
}

export function checkedGltfTotal(
  current: number,
  additional: number,
  limit: number,
  code: string,
  label: string,
): number {
  if (
    !Number.isSafeInteger(current) ||
    !Number.isSafeInteger(additional) ||
    current < 0 ||
    additional < 0 ||
    current > limit - additional
  ) {
    return gltfDecodeFailure(
      "resource-limit",
      code,
      `${label} exceeds the configured ${limit}-byte limit.`,
    );
  }
  return current + additional;
}

export function checkedGltfScale(
  value: number,
  factor: number,
  code: string,
): number {
  if (
    !Number.isSafeInteger(value) ||
    !Number.isSafeInteger(factor) ||
    value < 0 ||
    factor < 0 ||
    (factor > 0 && value > Number.MAX_SAFE_INTEGER / factor)
  ) {
    return gltfDecodeFailure(
      "resource-limit",
      code,
      "glTF size metadata overflows safe integer arithmetic.",
    );
  }
  return value * factor;
}
