import type { ToolcraftSourceAssetFeedback } from "./source-asset-types";

export function createToolcraftSourceAssetFeedback(
  code: string,
  message: string,
  category: ToolcraftSourceAssetFeedback["category"] = "resource-unavailable",
): ToolcraftSourceAssetFeedback {
  return Object.freeze({ category, code, message });
}

export function getToolcraftSourceAssetErrorMessage(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "The source asset import could not be completed.";
}

export function getToolcraftSourceAssetFeedback(
  error: unknown,
  fallbackCode: string,
): ToolcraftSourceAssetFeedback {
  if (typeof error === "object" && error !== null) {
    const candidate = error as Partial<ToolcraftSourceAssetFeedback>;
    if (
      typeof candidate.category === "string" &&
      typeof candidate.code === "string" &&
      typeof candidate.message === "string"
    ) {
      return Object.freeze({
        category: candidate.category as ToolcraftSourceAssetFeedback["category"],
        code: candidate.code,
        message: candidate.message,
      });
    }
  }

  return createToolcraftSourceAssetFeedback(
    fallbackCode,
    getToolcraftSourceAssetErrorMessage(error),
  );
}
