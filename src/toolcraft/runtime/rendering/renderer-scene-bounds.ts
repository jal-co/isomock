import type { ToolcraftRenderPassSceneBounds } from "./renderer-pipeline-types";

export function normalizeRendererSceneBounds(value: unknown): ToolcraftRenderPassSceneBounds {
  if (!value || typeof value !== "object") throw new Error("Renderer sceneBounds must be an object.");
  const bounds = value as Record<string, unknown>;
  if (bounds.kind === "intrinsic" && typeof bounds.reason === "string" && bounds.reason.trim()) {
    return Object.freeze({ kind: "intrinsic", reason: bounds.reason });
  }
  if (bounds.kind === "content" && Array.isArray(bounds.proofIds) && bounds.proofIds.length > 0 &&
      bounds.proofIds.every(id => typeof id === "string" && id.length > 0 && id.trim() === id) &&
      new Set(bounds.proofIds).size === bounds.proofIds.length) {
    return Object.freeze({ kind: "content", proofIds: Object.freeze([...bounds.proofIds]) });
  }
  throw new Error("Renderer sceneBounds requires intrinsic output with a reason, or content with unique non-empty proofIds.");
}
