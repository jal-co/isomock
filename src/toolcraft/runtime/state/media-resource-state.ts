import type { ToolcraftBinaryMediaKind } from "../source-assets/media-resource-ref";
import type { ToolcraftMediaResourceState } from "./types";

export function cloneToolcraftMediaResourceState(
  _kind: ToolcraftBinaryMediaKind,
  source: ToolcraftMediaResourceState,
): ToolcraftMediaResourceState {
  if (source.lifecycle === "unavailable") {
    return {
      error: { ...source.error },
      lifecycle: "unavailable",
      resourceRef: source.resourceRef,
    };
  }

  return {
    lifecycle: source.lifecycle,
    resourceRef: source.resourceRef,
  };
}
