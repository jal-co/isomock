import type { ReadonlyToolcraftState } from "../state/readonly-state";
import { isToolcraftLayerVisibleInTree } from "../state/layer-visibility";
import type {
  ToolcraftImageAsset,
  ToolcraftSceneElementFrame,
} from "../state/types";

export type ToolcraftSceneRect = Readonly<{
  height: number;
  width: number;
  x: number;
  y: number;
}>;

export type ToolcraftRuntimeSceneVisibility = Readonly<{
  renderDefaultImages: boolean;
  suppressedModelTargets: readonly string[];
}>;

export const defaultToolcraftRuntimeSceneVisibility: ToolcraftRuntimeSceneVisibility =
  Object.freeze({
    renderDefaultImages: true,
    suppressedModelTargets: Object.freeze([]),
  });

export function createToolcraftRuntimeSceneVisibility(
  visibility: ToolcraftRuntimeSceneVisibility,
): ToolcraftRuntimeSceneVisibility {
  return Object.freeze({
    renderDefaultImages: visibility.renderDefaultImages,
    suppressedModelTargets: Object.freeze([
      ...visibility.suppressedModelTargets,
    ]),
  });
}

export type ToolcraftProductSceneBoundsProvider = (
  context: Readonly<{
    state: ReadonlyToolcraftState;
  }>,
) => readonly ToolcraftSceneRect[];

export type ToolcraftSceneBoundsResult =
  | Readonly<{ bounds: ToolcraftSceneRect; ok: true }>
  | Readonly<{
      code: "empty-scene" | "scene-bounds-unavailable";
      message: string;
      ok: false;
    }>;

const emptySceneBoundsResult: ToolcraftSceneBoundsResult = Object.freeze({
  code: "empty-scene",
  message: "The scene has no visible exportable elements.",
  ok: false,
});

const unavailableSceneBoundsResult: ToolcraftSceneBoundsResult = Object.freeze({
  code: "scene-bounds-unavailable",
  message: "Product scene bounds are unavailable or invalid.",
  ok: false,
});

export function getToolcraftSceneElementRect(
  element: ToolcraftSceneElementFrame,
): ToolcraftSceneRect {
  return {
    height: element.size.height,
    width: element.size.width,
    x: element.position.x - element.size.width / 2,
    y: element.position.y - element.size.height / 2,
  };
}

function isFiniteSceneRect(value: unknown): value is ToolcraftSceneRect {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const rect = value as Partial<ToolcraftSceneRect>;
  return (
    Number.isFinite(rect.x) &&
    Number.isFinite(rect.y) &&
    Number.isFinite(rect.width) &&
    Number.isFinite(rect.height) &&
    (rect.width ?? -1) >= 0 &&
    (rect.height ?? -1) >= 0
  );
}

export function getToolcraftImageSceneRect(
  image: ToolcraftImageAsset,
): ToolcraftSceneRect {
  const quarterTurn =
    image.transform?.rotationDeg === 90 ||
    image.transform?.rotationDeg === 270;
  return getToolcraftSceneElementRect({
    position: image.position,
    size: quarterTurn
      ? { height: image.size.width, unit: "px", width: image.size.height }
      : image.size,
  });
}

function getRuntimeSceneRects(
  state: ReadonlyToolcraftState,
  visibility: ToolcraftRuntimeSceneVisibility,
): ToolcraftSceneRect[] {
  const suppressedTargets = new Set(visibility.suppressedModelTargets);

  return state.mediaAssets.flatMap((asset) => {
    if (!isToolcraftLayerVisibleInTree(state.layers, asset.layerId)) {
      return [];
    }

    if (asset.assetKind === "image") {
      if (
        !visibility.renderDefaultImages ||
        asset.lifecycle === "unavailable"
      ) {
        return [];
      }
      return [getToolcraftImageSceneRect(asset)];
    }

    if (
      asset.assetKind !== "model" ||
      asset.lifecycle === "restoring" ||
      asset.lifecycle === "unavailable" ||
      suppressedTargets.has(asset.sourceTarget ?? asset.id)
    ) {
      return [];
    }

    return [getToolcraftSceneElementRect(asset)];
  });
}

export function unionToolcraftSceneRects(
  rects: readonly ToolcraftSceneRect[],
): ToolcraftSceneRect | null {
  const visibleRects = rects.filter(
    (rect) => rect.width > 0 && rect.height > 0,
  );

  if (visibleRects.length === 0) {
    return null;
  }
  if (visibleRects.length === 1) {
    return { ...visibleRects[0]! };
  }

  const minX = Math.min(...visibleRects.map((rect) => rect.x));
  const minY = Math.min(...visibleRects.map((rect) => rect.y));
  const maxX = Math.max(...visibleRects.map((rect) => rect.x + rect.width));
  const maxY = Math.max(...visibleRects.map((rect) => rect.y + rect.height));

  return { height: maxY - minY, width: maxX - minX, x: minX, y: minY };
}

export function outwardRoundToolcraftSceneRect(
  rect: ToolcraftSceneRect,
): ToolcraftSceneRect {
  const x = Math.floor(rect.x);
  const y = Math.floor(rect.y);
  return {
    height: Math.ceil(rect.y + rect.height) - y,
    width: Math.ceil(rect.x + rect.width) - x,
    x,
    y,
  };
}

export function resolveToolcraftProductSceneBounds(
  productRects: unknown,
): ToolcraftSceneBoundsResult {
  if (
    !Array.isArray(productRects) ||
    !productRects.every(isFiniteSceneRect)
  ) {
    return unavailableSceneBoundsResult;
  }

  const bounds = unionToolcraftSceneRects(productRects);
  return bounds ? { bounds, ok: true } : emptySceneBoundsResult;
}

export function resolveToolcraftSceneBounds(
  state: ReadonlyToolcraftState,
  productRects: unknown = [],
  visibility: ToolcraftRuntimeSceneVisibility = defaultToolcraftRuntimeSceneVisibility,
): ToolcraftSceneBoundsResult {
  const productBounds = resolveToolcraftProductSceneBounds(productRects);
  if (!productBounds.ok && productBounds.code === "scene-bounds-unavailable") {
    return productBounds;
  }

  const bounds = unionToolcraftSceneRects([
    ...getRuntimeSceneRects(state, visibility),
    ...(productBounds.ok ? [productBounds.bounds] : []),
  ]);

  return bounds ? { bounds, ok: true } : emptySceneBoundsResult;
}
