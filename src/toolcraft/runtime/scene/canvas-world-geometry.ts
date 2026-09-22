import type { ToolcraftCanvasSize } from "../schema/types";

export function getToolcraftFiniteArtboardRect(size: ToolcraftCanvasSize) {
  return {
    height: size.height,
    width: size.width,
    x: -size.width / 2,
    y: -size.height / 2,
  };
}
