import type { ToolcraftAppComposition } from "@/toolcraft/runtime/react";

type ProductCanvasComposition = Pick<
  ToolcraftAppComposition,
  "canvasContent" | "infiniteCanvasContent" | "renderDefaultCanvasMedia"
>;

export function compositionHasProductCanvasSurface(
  composition: ProductCanvasComposition,
): boolean {
  return (
    composition.canvasContent !== undefined ||
    composition.infiniteCanvasContent !== undefined ||
    composition.renderDefaultCanvasMedia === false
  );
}
