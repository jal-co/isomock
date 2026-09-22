import type { CSSProperties } from "react";

import type { ToolcraftCanvasSize } from "../../schema/types";
import type { ToolcraftMediaTransform } from "../../state/types";

export function normalizeCanvasMediaRotation(
  rotationDeg: number | undefined,
): 0 | 90 | 180 | 270 {
  const normalized = ((Math.round((rotationDeg ?? 0) / 90) * 90) % 360 + 360) % 360;

  return normalized === 90 || normalized === 180 || normalized === 270 ? normalized : 0;
}

export function getCanvasMediaTransformStyle(
  transform: ToolcraftMediaTransform | undefined,
  canvasSize: ToolcraftCanvasSize,
  fit: "cover" | "element" = "cover",
): CSSProperties {
  const rotationDeg = normalizeCanvasMediaRotation(transform?.rotationDeg);
  const coverScale =
    fit === "cover" && (rotationDeg === 90 || rotationDeg === 270)
      ? Math.max(canvasSize.width / canvasSize.height, canvasSize.height / canvasSize.width)
      : 1;
  const scaleX = (transform?.flipHorizontal ? -1 : 1) * coverScale;
  const scaleY = (transform?.flipVertical ? -1 : 1) * coverScale;

  if (rotationDeg === 0 && scaleX === 1 && scaleY === 1) {
    return {};
  }

  return {
    transform: `rotate(${rotationDeg}deg) scale(${scaleX}, ${scaleY})`,
  };
}
