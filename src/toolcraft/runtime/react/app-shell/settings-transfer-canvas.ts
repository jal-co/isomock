import { decodeToolcraftCanvasAspectRatioValue } from "../../state/canvas-state";
import type { ToolcraftCanvasAspectRatioValue } from "../../state/canvas-state";
import { readCanvasSize } from "../../state/persistence-reader-primitives";
import { isToolcraftPersistenceRecord } from "../../state/persistence-shared";
import type { ToolcraftState } from "../../state/types";

export type ToolcraftSettingsCanvasPayload = Readonly<{
  aspectRatio?: ToolcraftCanvasAspectRatioValue;
  mode: ToolcraftState["canvas"]["mode"];
  size: ToolcraftState["canvas"]["size"];
}>;

export function parseToolcraftSettingsCanvas(
  canvasValue: unknown,
): ToolcraftSettingsCanvasPayload | null {
  if (!isToolcraftPersistenceRecord(canvasValue)) {
    return null;
  }

  const hasAspectRatio = Object.hasOwn(canvasValue, "aspectRatio");
  const expectedKeys = [
    ...(hasAspectRatio ? ["aspectRatio"] : []),
    "mode",
    "size",
  ].sort();
  const actualKeys = Object.keys(canvasValue).sort();
  if (
    actualKeys.length !== expectedKeys.length ||
    actualKeys.some((key, index) => key !== expectedKeys[index]) ||
    !isToolcraftPersistenceRecord(canvasValue.size) ||
    Object.keys(canvasValue.size).sort().join("|") !== "height|unit|width"
  ) {
    return null;
  }

  const size = readCanvasSize(canvasValue.size);

  if (
    !size ||
    size.height <= 0 ||
    size.width <= 0 ||
    (canvasValue.mode !== "finite" && canvasValue.mode !== "infinite")
  ) {
    return null;
  }

  const aspectCandidate = canvasValue.aspectRatio;
  const aspectRatio =
    aspectCandidate === undefined
      ? undefined
      : decodeToolcraftCanvasAspectRatioValue(aspectCandidate);

  if (
    hasAspectRatio &&
    (!aspectRatio ||
      !isToolcraftPersistenceRecord(aspectCandidate) ||
      Object.keys(aspectCandidate).sort().join("|") !==
        "height|mode|value|width" ||
      aspectCandidate.height !== aspectRatio.height ||
      aspectCandidate.mode !== aspectRatio.mode ||
      aspectCandidate.value !== aspectRatio.value ||
      aspectCandidate.width !== aspectRatio.width)
  ) {
    return null;
  }

  return {
    ...(aspectRatio ? { aspectRatio } : {}),
    mode: canvasValue.mode,
    size,
  };
}
