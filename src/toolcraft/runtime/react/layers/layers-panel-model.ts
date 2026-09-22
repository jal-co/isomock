import type { ToolcraftLayer } from "../../state/types";

export type LayerDropPlacement = "after" | "before";

export const layerDepthIndentPx = 20;

export function getLayerDisplayName(layer: ToolcraftLayer): string {
  const displayName = layer.displayName?.trim();

  return displayName ? displayName : layer.name;
}

export function isGroupLayer(layer: ToolcraftLayer): boolean {
  return layer.kind === "group";
}
