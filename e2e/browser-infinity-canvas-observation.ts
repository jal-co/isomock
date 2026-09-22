import { expect, type Page } from "@playwright/test";

export type InfinityCanvasObservation = Readonly<{
  artboardPresent: boolean;
  canvasMode: string | null;
  finiteCanvasSize: { height: number; width: number } | null;
  finiteControlSize: { height: number; width: number } | null;
  finiteControlsPresent: Readonly<{
    aspectRatio: boolean;
    height: boolean;
    width: boolean;
  }>;
  overflow: string;
  productClipping: readonly string[];
  productScene: Readonly<{
    output: InfinityCanvasOutputObservation | null;
    viewportRect: InfinityCanvasRect | null;
    worldRect: InfinityCanvasRect | null;
  }>;
  productSceneStatus: "empty" | "ready" | "unavailable" | null;
  viewport: Readonly<{
    offsetX: number;
    offsetY: number;
    zoom: number;
  }>;
}>;

type InfinityCanvasRect = Readonly<{
  height: number;
  width: number;
  x: number;
  y: number;
}>;

type InfinityCanvasOutputObservation =
  | Readonly<{
      kind: "canvas";
      backingHeight: number;
      backingWidth: number;
    }>
  | Readonly<{
      kind: "svg";
      contentRect: InfinityCanvasRect;
      localRect: InfinityCanvasRect;
      viewportRect: InfinityCanvasRect;
    }>;

export type InfinityCanvasBackgroundObservation = Readonly<{
  backgroundEnabled: boolean | null;
  canvasMode: string | null;
  infinityDisabled: boolean | null;
  runtimeBackgroundColor: string | null;
  viewportBackgroundColor: string | null;
  viewportMatchesRuntimeColor: boolean;
}>;

export async function observeInfinityCanvasBackground(
  page: Page,
): Promise<InfinityCanvasBackgroundObservation> {
  return page.evaluate(() => {
    const readSwitch = (
      target: string,
    ): Readonly<{ checked: boolean | null; disabled: boolean | null }> => {
      const field = document.querySelector<HTMLElement>(
        `[data-toolcraft-control-target="${target}"]`,
      );
      const switchElement =
        field?.querySelector<HTMLElement>('[role="switch"]');
      const checked = switchElement?.getAttribute("aria-checked");

      return {
        checked: checked === "true" ? true : checked === "false" ? false : null,
        disabled: switchElement
          ? switchElement.matches(":disabled") ||
            switchElement.getAttribute("aria-disabled") === "true"
          : null,
      };
    };
    const background = readSwitch("export.includeBackground");
    const infinity = readSwitch("canvas.infinity");
    const surface = document.querySelector<HTMLElement>(
      "[data-toolcraft-canvas-mode]",
    );
    const viewport = document.querySelector<HTMLElement>(
      '[data-slot="toolcraft-runtime-canvas"]',
    );
    const runtimeBackgroundColor =
      viewport?.dataset.toolcraftInfiniteBackgroundColor ?? null;
    const viewportBackgroundColor = viewport
      ? getComputedStyle(viewport).backgroundColor
      : null;
    let normalizedRuntimeColor: string | null = null;

    if (runtimeBackgroundColor) {
      const probe = document.createElement("span");
      probe.style.backgroundColor = runtimeBackgroundColor;
      document.body.append(probe);
      normalizedRuntimeColor = getComputedStyle(probe).backgroundColor;
      probe.remove();
    }

    return {
      backgroundEnabled: background.checked,
      canvasMode: surface?.dataset.toolcraftCanvasMode ?? null,
      infinityDisabled: infinity.disabled,
      runtimeBackgroundColor,
      viewportBackgroundColor,
      viewportMatchesRuntimeColor:
        normalizedRuntimeColor !== null &&
        normalizedRuntimeColor === viewportBackgroundColor,
    };
  });
}

export async function observeInfinityCanvas(
  page: Page,
): Promise<InfinityCanvasObservation> {
  return page.evaluate(() => {
    const surface = document.querySelector<HTMLElement>(
      "[data-toolcraft-canvas-mode]",
    );
    const world = document.querySelector<HTMLElement>(
      "[data-toolcraft-canvas-world]",
    );
    const productScene = document.querySelector<HTMLElement>(
      "[data-toolcraft-product-scene]",
    );
    const hasControl = (target: string): boolean =>
      Boolean(
        document.querySelector(`[data-toolcraft-control-target="${target}"]`),
      );
    const finiteControlsPresent = {
      aspectRatio: hasControl("canvas.aspectRatio"),
      height: hasControl("canvas.size.height"),
      width: hasControl("canvas.size.width"),
    };
    const readPositiveDimension = (
      value: string | null | undefined,
    ): number | null => {
      const parsed = Number.parseFloat(value ?? "");
      return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    };
    const editableCanvas = document.querySelector<HTMLElement>(
      "[data-toolcraft-editable-canvas]",
    );
    const canvasWidth = readPositiveDimension(editableCanvas?.style.width);
    const canvasHeight = readPositiveDimension(editableCanvas?.style.height);
    const readControlDimension = (target: string): number | null =>
      readPositiveDimension(
        document
          .querySelector<HTMLElement>(
            `[data-toolcraft-control-target="${target}"]`,
          )
          ?.querySelector<HTMLInputElement>("input")?.value,
      );
    const controlWidth = readControlDimension("canvas.size.width");
    const controlHeight = readControlDimension("canvas.size.height");
    const read = (value: string | undefined): number | null => {
      const parsed = Number.parseFloat(value ?? "");
      return Number.isFinite(parsed) ? parsed : null;
    };
    const style = productScene ? getComputedStyle(productScene) : null;
    const sceneValues = style
      ? {
          height: read(style.height),
          width: read(style.width),
          x: read(style.left),
          y: read(style.top),
        }
      : null;
    const worldRect =
      sceneValues && Object.values(sceneValues).every((value) => value !== null)
        ? {
            height: sceneValues.height!,
            width: sceneValues.width!,
            x: sceneValues.x!,
            y: sceneValues.y!,
          }
        : null;
    const productSceneViewportRect = productScene?.getBoundingClientRect();
    const viewportRect = productSceneViewportRect
      ? {
          height: productSceneViewportRect.height,
          width: productSceneViewportRect.width,
          x: productSceneViewportRect.x,
          y: productSceneViewportRect.y,
        }
      : null;
    const productCanvas =
      productScene?.querySelector<HTMLCanvasElement>("canvas");
    // A raster surface always retains its backing proof, even beside SVG output.
    const productSvg = productScene?.querySelector<SVGSVGElement>(
      "svg[data-toolcraft-product-output]",
    ) ?? productScene?.querySelector<SVGSVGElement>("svg");
    // Inspect transport chains for every visible output surface. Internal SVG
    // viewports/masks are geometry; a canvas bitmap's own overflow is intrinsic.
    const presentationNodes = new Set<Element>();
    for (const output of productScene?.querySelectorAll("svg, canvas") ?? []) {
      if (output.parentElement?.closest("svg")) continue;
      const bounds = output.getBoundingClientRect();
      if (bounds.width === 0 || bounds.height === 0) continue;
      for (let node: Element | null = output; node && node !== surface; node = node.parentElement) {
        presentationNodes.add(node);
      }
    }
    const productClipping: string[] = [];
    for (const node of presentationNodes) {
      const style = getComputedStyle(node);
      const bitmap = node instanceof HTMLCanvasElement;
      if (!bitmap && (style.overflowX !== "visible" || style.overflowY !== "visible")) {
        productClipping.push(`${node.tagName}: overflow ${style.overflowX}/${style.overflowY}`);
      }
      if (!bitmap && /\b(paint|strict|content)\b/u.test(style.contain)) {
        productClipping.push(`${node.tagName}: contain ${style.contain}`);
      }
      for (const property of ["clip-path", "mask-image", "-webkit-mask-image", "clip"]) {
        if (property === "clip" && style.position !== "absolute" && style.position !== "fixed") continue;
        const value = style.getPropertyValue(property);
        if (value && value !== "none" && value !== "auto") {
          productClipping.push(`${node.tagName}: ${property} ${value}`);
        }
      }
    }
    const toRect = (rect: DOMRect): InfinityCanvasRect => ({
      height: rect.height,
      width: rect.width,
      x: rect.x,
      y: rect.y,
    });
    const observeOutput = (): InfinityCanvasOutputObservation | null => {
      if (productCanvas) {
        return {
          kind: "canvas",
          backingHeight: productCanvas.height,
          backingWidth: productCanvas.width,
        };
      }
      if (!productSvg) return null;
      const localRect = productSvg.hasAttribute("viewBox")
        ? toRect(productSvg.viewBox.baseVal)
        : {
            x: 0,
            y: 0,
            width: productSvg.width.baseVal.value,
            height: productSvg.height.baseVal.value,
          };
      return {
        kind: "svg",
        contentRect: toRect(productSvg.getBBox()),
        localRect,
        viewportRect: toRect(productSvg.getBoundingClientRect()),
      };
    };
    const productSceneStatus =
      productScene?.dataset.toolcraftProductSceneStatus;

    return {
      artboardPresent: Boolean(editableCanvas),
      canvasMode: surface?.getAttribute("data-toolcraft-canvas-mode") ?? null,
      finiteCanvasSize:
        canvasWidth === null || canvasHeight === null
          ? null
          : { height: canvasHeight, width: canvasWidth },
      finiteControlSize:
        controlWidth === null || controlHeight === null
          ? null
          : { height: controlHeight, width: controlWidth },
      finiteControlsPresent,
      overflow: surface ? getComputedStyle(surface).overflow : "missing",
      productClipping,
      productScene: {
        output: observeOutput(),
        viewportRect,
        worldRect,
      },
      productSceneStatus:
        productSceneStatus === "ready" ||
        productSceneStatus === "empty" ||
        productSceneStatus === "unavailable"
          ? productSceneStatus
          : null,
      viewport: {
        offsetX: Number(world?.dataset.toolcraftCanvasOffsetX ?? Number.NaN),
        offsetY: Number(world?.dataset.toolcraftCanvasOffsetY ?? Number.NaN),
        zoom: Number(world?.dataset.toolcraftCanvasZoom ?? Number.NaN),
      },
    };
  });
}

export function expectMeasurableInfinityCanvasRect(
  rect: InfinityCanvasRect | null,
  message: string,
): void {
  expect(
    rect !== null &&
      Number.isFinite(rect.x) &&
      Number.isFinite(rect.y) &&
      Number.isFinite(rect.width) &&
      rect.width > 0 &&
      Number.isFinite(rect.height) &&
      rect.height > 0,
    message,
  ).toBe(true);
}

export function expectInfiniteCanvasObservation(
  observation: InfinityCanvasObservation,
  expectedSceneRect?: InfinityCanvasObservation["productScene"]["worldRect"],
): void {
  expect(observation.canvasMode).toBe("infinite");
  expect(observation.artboardPresent).toBe(false);
  expect(observation.finiteCanvasSize).toEqual(null);
  expect(observation.finiteControlSize).toEqual(null);
  expect(observation.finiteControlsPresent).toEqual({
    aspectRatio: false,
    height: false,
    width: false,
  });
  expect(observation.overflow).toBe("visible");
  expect(observation.productClipping, "Infinity product presentation must not clip its output roots or transport wrappers; the runtime artboard owns finite clipping.").toEqual([]);
  if (expectedSceneRect) {
    expect(observation.productSceneStatus).toBe("ready");
    expect(observation.productScene.worldRect).toEqual(expectedSceneRect);
  }
  expect(Number.isFinite(observation.viewport.offsetX)).toBe(true);
  expect(Number.isFinite(observation.viewport.offsetY)).toBe(true);
  expect(Number.isFinite(observation.viewport.zoom)).toBe(true);
}

export function expectFiniteCanvasObservation(
  observation: InfinityCanvasObservation,
  expectedSize?: Readonly<{ height: number; width: number }>,
): void {
  expect(observation.canvasMode).toBe("finite");
  expect(observation.artboardPresent).toBe(true);
  expect(observation.finiteControlsPresent).toEqual({
    aspectRatio: true,
    height: true,
    width: true,
  });
  expect(observation.overflow).toBe("hidden");
  const resolvedExpectedSize = expectedSize ?? observation.finiteCanvasSize;
  expect(
    resolvedExpectedSize,
    "Finite canvas proof requires observable positive canvas dimensions or explicit expected dimensions.",
  ).not.toEqual(null);
  expect(
    resolvedExpectedSize !== null &&
      Number.isFinite(resolvedExpectedSize.width) &&
      resolvedExpectedSize.width > 0 &&
      Number.isFinite(resolvedExpectedSize.height) &&
      resolvedExpectedSize.height > 0,
    "Finite canvas proof dimensions must be positive finite numbers.",
  ).toBe(true);
  expect(observation.finiteCanvasSize).toEqual(resolvedExpectedSize);
  expect(observation.finiteControlSize).toEqual(resolvedExpectedSize);
}
