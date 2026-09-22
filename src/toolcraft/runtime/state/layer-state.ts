import type { ToolcraftState } from "./types";

export function getNextToolcraftLayerId(state: ToolcraftState): string {
  const existingIds = new Set(state.layers.map((layer) => layer.id));
  let index = state.layers.length + 1;

  while (existingIds.has(`layer-${index}`)) {
    index += 1;
  }

  return `layer-${index}`;
}
