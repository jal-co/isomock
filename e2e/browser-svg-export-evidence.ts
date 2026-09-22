import { expect, type Download, type Page } from "@playwright/test";
import {
  TOOLCRAFT_SVG_BACKGROUND_ATTRIBUTE,
  TOOLCRAFT_SVG_NON_RENDERING_CONTAINERS,
  TOOLCRAFT_SVG_PRODUCT_SCENE_ATTRIBUTE,
  TOOLCRAFT_SVG_VECTOR_PRIMITIVES,
} from "@/toolcraft/runtime";

import { attachToolcraftBrowserRuntimeEvidence } from "./browser-runtime-evidence";
import {
  getToolcraftBrowserActionTarget,
  isToolcraftBrowserAction,
  runToolcraftBrowserValueAction,
  type ToolcraftBrowserAction,
} from "./browser-proof-session";
import {
  inspectToolcraftSvgDownload,
  type ToolcraftInspectedSvgArtifact,
} from "./svg-artifact-inspection";

export type ToolcraftSvgElementExpectation = Readonly<{
  attributes?: Readonly<Record<string, string>>;
  selector: string;
  textContent?: string;
}>;

async function assertProductExpectations(
  page: Page,
  source: string,
  expectations: readonly ToolcraftSvgElementExpectation[],
): Promise<void> {
  if (expectations.length === 0) {
    throw new Error("SVG export evidence requires product vector expectations.");
  }
  await page.evaluate(
    ({
      backgroundAttribute,
      expectedElements,
      nonRenderingNames,
      productSceneAttribute,
      svgSource,
      vectorPrimitiveNames,
    }) => {
      const parsed = new DOMParser().parseFromString(
        svgSource,
        "image/svg+xml",
      );
      const vectorNames = new Set(vectorPrimitiveNames);
      const nonRendering = new Set(nonRenderingNames);
      const productScene = parsed.querySelector(
        `[${productSceneAttribute}="true"]`,
      );
      if (!productScene) {
        throw new Error("SVG product expectations need a product scene.");
      }
      for (const expected of expectedElements) {
        if (
          !expected.selector.trim() ||
          (Object.keys(expected.attributes ?? {}).length === 0 &&
            expected.textContent === undefined)
        ) {
          throw new Error(
            "Each SVG product expectation needs a selector and exact attribute or text semantics.",
          );
        }
        const element = productScene.querySelector(expected.selector);
        if (!element || !vectorNames.has(element.localName.toLowerCase())) {
          throw new Error(
            `SVG product expectation did not match a vector primitive: ${expected.selector}`,
          );
        }
        if (element.hasAttribute(backgroundAttribute)) {
          throw new Error("SVG product expectations cannot target runtime background.");
        }
        let ancestor = element.parentElement;
        while (ancestor && !ancestor.isSameNode(productScene)) {
          if (nonRendering.has(ancestor.localName.toLowerCase())) {
            throw new Error(
              `SVG product expectation targets non-rendering content: ${expected.selector}`,
            );
          }
          ancestor = ancestor.parentElement;
        }
        for (const [name, value] of Object.entries(expected.attributes ?? {})) {
          if (element.getAttribute(name) !== value) {
            throw new Error(
              `SVG product expectation ${expected.selector} needs ${name}=${value}.`,
            );
          }
        }
        if (
          expected.textContent !== undefined &&
          element.textContent !== expected.textContent
        ) {
          throw new Error(
            `SVG product expectation ${expected.selector} has unexpected text.`,
          );
        }
      }
    },
    {
      backgroundAttribute: TOOLCRAFT_SVG_BACKGROUND_ATTRIBUTE,
      expectedElements: expectations,
      nonRenderingNames: TOOLCRAFT_SVG_NON_RENDERING_CONTAINERS,
      productSceneAttribute: TOOLCRAFT_SVG_PRODUCT_SCENE_ATTRIBUTE,
      svgSource: source,
      vectorPrimitiveNames: TOOLCRAFT_SVG_VECTOR_PRIMITIVES,
    },
  );
}

export async function expectToolcraftSvgExportArtifact(
  produceDownload:
    | (() => Promise<Download>)
    | ToolcraftBrowserAction<"interaction", Download>,
  options: Readonly<{
    expectedElements: readonly ToolcraftSvgElementExpectation[];
    expectedBackgroundColor: string | null;
    expectedHeight: number;
    expectedWidth: number;
    page: Page;
    requirementId: string;
  }>,
): Promise<ToolcraftInspectedSvgArtifact> {
  const target = isToolcraftBrowserAction(produceDownload)
    ? getToolcraftBrowserActionTarget(produceDownload)
    : undefined;
  const download = isToolcraftBrowserAction(produceDownload)
    ? await runToolcraftBrowserValueAction(produceDownload)
    : await produceDownload();
  const inspected = await inspectToolcraftSvgDownload({
    download,
    page: options.page,
  });
  expect(inspected.inspection.width).toBe(options.expectedWidth);
  expect(inspected.inspection.height).toBe(options.expectedHeight);
  expect(inspected.inspection.backgroundColor).toBe(
    options.expectedBackgroundColor,
  );
  expect(inspected.inspection.contentHash).not.toHaveLength(0);
  await assertProductExpectations(
    options.page,
    inspected.source,
    options.expectedElements,
  );
  await attachToolcraftBrowserRuntimeEvidence({
    evidenceType: "svg-export-artifact",
    requirementId: options.requirementId,
    target,
  });
  return inspected;
}
