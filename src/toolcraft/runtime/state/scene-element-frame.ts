import type {
  ToolcraftSceneElementFrame,
} from "./types";

export const defaultToolcraftSceneElementFrame: ToolcraftSceneElementFrame =
  Object.freeze({
    position: Object.freeze({ x: 0, y: 0 }),
    size: Object.freeze({ height: 512, unit: "px", width: 512 }),
  });

function isFinitePoint(
  value: Partial<ToolcraftSceneElementFrame>["position"],
): value is ToolcraftSceneElementFrame["position"] {
  return Boolean(
    value && Number.isFinite(value.x) && Number.isFinite(value.y),
  );
}

function isFiniteSize(
  value: Partial<ToolcraftSceneElementFrame>["size"],
): value is ToolcraftSceneElementFrame["size"] {
  return Boolean(
    value &&
      value.unit === "px" &&
      Number.isFinite(value.width) &&
      value.width > 0 &&
      Number.isFinite(value.height) &&
      value.height > 0,
  );
}

export function normalizeToolcraftSceneElementFrame(
  value: Partial<ToolcraftSceneElementFrame> | undefined,
): ToolcraftSceneElementFrame {
  const position = isFinitePoint(value?.position)
    ? value.position
    : defaultToolcraftSceneElementFrame.position;
  const size = isFiniteSize(value?.size)
    ? value.size
    : defaultToolcraftSceneElementFrame.size;

  return Object.freeze({
    position: Object.freeze({ ...position }),
    size: Object.freeze({ ...size }),
  });
}
