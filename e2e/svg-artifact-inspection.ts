import { createHash } from "node:crypto";
import fs from "node:fs/promises";

import type { Download, Page } from "@playwright/test";
import {
  TOOLCRAFT_FORBIDDEN_SVG_ELEMENTS,
  TOOLCRAFT_SVG_BACKGROUND_ATTRIBUTE,
  TOOLCRAFT_SVG_NAMESPACE,
  TOOLCRAFT_SVG_NON_RENDERING_CONTAINERS,
  TOOLCRAFT_SVG_PRODUCT_SCENE_ATTRIBUTE,
  TOOLCRAFT_SVG_VECTOR_PRIMITIVES,
} from "@/toolcraft/runtime";

import type { ToolcraftSvgArtifactInspection } from "./export-artifact-helpers";

export type ToolcraftInspectedSvgArtifact = Readonly<{
  inspection: ToolcraftSvgArtifactInspection;
  source: string;
}>;

const inspectedSvgArtifacts = new WeakSet<object>();

export function assertToolcraftInspectedSvgArtifact(
  inspection: ToolcraftSvgArtifactInspection,
): void {
  if (!inspectedSvgArtifacts.has(inspection)) {
    throw new Error(
      "Infinity SVG evidence requires an artifact from inspectToolcraftSvgDownload.",
    );
  }
}

export async function inspectToolcraftSvgDownload({
  download,
  page,
}: Readonly<{
  download: Download;
  page: Page;
}>): Promise<ToolcraftInspectedSvgArtifact> {
  const fileName = download.suggestedFilename();
  if (!fileName.toLowerCase().endsWith(".svg")) {
    throw new Error("Downloaded SVG artifact must use the .svg extension.");
  }
  const downloadPath = await download.path();
  if (!downloadPath) {
    throw new Error("Playwright did not expose the downloaded SVG path.");
  }
  const bytes = await fs.readFile(downloadPath);
  if (bytes.byteLength === 0) {
    throw new Error("Downloaded SVG artifact is empty.");
  }

  let source: string;
  try {
    source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("Downloaded SVG artifact is not valid UTF-8.");
  }

  const decoded = await page.evaluate(
    async ({
      backgroundAttribute,
      forbiddenNames,
      namespace,
      nonRenderingNames,
      primitiveNames,
      productSceneAttribute,
      svgSource,
    }) => {
      const parsed = new DOMParser().parseFromString(
        svgSource,
        "image/svg+xml",
      );
      if (parsed.querySelector("parsererror")) {
        throw new Error("Downloaded SVG artifact is not valid XML.");
      }
      if (parsed.doctype) {
        throw new Error("Downloaded SVG artifact cannot contain a doctype.");
      }
      const root = parsed.documentElement;
      if (root.localName !== "svg" || root.namespaceURI !== namespace) {
        throw new Error(
          "Downloaded SVG artifact must have a namespaced <svg> root.",
        );
      }

      const parseDimension = (name: "height" | "width"): number => {
        const raw = root.getAttribute(name)?.trim() ?? "";
        if (!/^(?:\d+\.?\d*|\.\d+)$/u.test(raw)) {
          throw new Error(`Downloaded SVG artifact needs numeric ${name}.`);
        }
        const value = Number(raw);
        if (!Number.isFinite(value) || value <= 0) {
          throw new Error(`Downloaded SVG artifact needs positive ${name}.`);
        }
        return value;
      };
      const width = parseDimension("width");
      const height = parseDimension("height");
      const viewBox = (root.getAttribute("viewBox") ?? "")
        .trim()
        .split(/[\s,]+/u)
        .map(Number);
      if (
        viewBox.length !== 4 ||
        viewBox.some((value) => !Number.isFinite(value)) ||
        Number(viewBox[2]) <= 0 ||
        Number(viewBox[3]) <= 0 ||
        Number(viewBox[2]) !== width ||
        Number(viewBox[3]) !== height
      ) {
        throw new Error(
          "Downloaded SVG artifact needs a coherent positive viewBox.",
        );
      }

      const productScenes = Array.from(
        root.querySelectorAll(`[${productSceneAttribute}]`),
      );
      const productScene = productScenes[0] ?? null;
      if (
        productScenes.length !== 1 ||
        productScene?.localName !== "g" ||
        productScene.getAttribute(productSceneAttribute) !== "true" ||
        !productScene.parentElement?.isSameNode(root)
      ) {
        throw new Error(
          "Downloaded SVG artifact needs one runtime-owned product scene.",
        );
      }

      const backgrounds = Array.from(
        root.querySelectorAll(`[${backgroundAttribute}]`),
      );
      if (backgrounds.length > 1) {
        throw new Error("Downloaded SVG artifact has duplicate runtime backgrounds.");
      }
      const background = backgrounds[0] ?? null;
      let backgroundColor: string | null = null;
      if (background) {
        const backgroundFrame = ["x", "y", "width", "height"].map((name) =>
          Number(background.getAttribute(name)),
        );
        if (
          background.getAttribute(backgroundAttribute) !== "true" ||
          background.localName !== "rect" ||
          !background.parentElement?.isSameNode(root) ||
          root.children[0] !== background ||
          backgroundFrame.some((value) => !Number.isFinite(value)) ||
          backgroundFrame.some((value, index) => value !== viewBox[index])
        ) {
          throw new Error(
            "Downloaded SVG artifact has an invalid runtime background frame.",
          );
        }
        backgroundColor = background.getAttribute("fill")?.trim() || null;
        if (!backgroundColor) {
          throw new Error(
            "Downloaded SVG artifact runtime background needs a fill color.",
          );
        }
      }
      const expectedRootChildCount = background ? 2 : 1;
      if (
        root.children.length !== expectedRootChildCount ||
        root.children[expectedRootChildCount - 1] !== productScene
      ) {
        throw new Error(
          "Downloaded SVG artifact has unexpected root-owned content.",
        );
      }

      const forbidden = new Set(forbiddenNames);
      const primitives = new Set(primitiveNames);
      const nonRendering = new Set(nonRenderingNames);
      const elements = [root, ...root.querySelectorAll("*")];
      const definedIds = new Set<string>();
      const referencedIds = new Set<string>();
      let vectorElementCount = 0;
      for (const element of elements) {
        for (const node of element.childNodes) {
          if (
            node.nodeType !== Node.ELEMENT_NODE &&
            node.nodeType !== Node.TEXT_NODE
          ) {
            throw new Error(
              "Downloaded SVG artifact may contain only elements and text nodes.",
            );
          }
        }
        if (element.namespaceURI !== namespace) {
          throw new Error("Downloaded SVG artifact mixes XML namespaces.");
        }
        const name = element.localName.toLowerCase();
        if (forbidden.has(name)) {
          throw new Error(
            `Downloaded SVG artifact contains forbidden <${element.localName}> content.`,
          );
        }
        if (
          primitives.has(name) &&
          productScene.contains(element)
        ) {
          let ancestor = element.parentElement;
          let hiddenDefinition = false;
          while (ancestor && !ancestor.isSameNode(root)) {
            hiddenDefinition ||= nonRendering.has(ancestor.localName.toLowerCase());
            ancestor = ancestor.parentElement;
          }
          if (!hiddenDefinition) vectorElementCount += 1;
        }

        for (const attribute of element.attributes) {
          const attributeName = attribute.localName.toLowerCase();
          const value = attribute.value.trim();
          if (attributeName === "id") {
            if (!value || definedIds.has(value)) {
              throw new Error(
                "Downloaded SVG artifact ids must be non-empty and unique.",
              );
            }
            definedIds.add(value);
          }
          if (attributeName.startsWith("on")) {
            throw new Error(
              `Downloaded SVG artifact contains event attribute ${attribute.name}.`,
            );
          }
          if (
            attributeName === "href" ||
            attributeName === "src"
          ) {
            if (!value.startsWith("#")) {
              throw new Error(
                `Downloaded SVG artifact contains external ${attribute.name}.`,
              );
            }
            const referencedId = value.slice(1).trim();
            if (!referencedId) {
              throw new Error(
                `Downloaded SVG artifact ${attribute.name} must name a local element.`,
              );
            }
            referencedIds.add(referencedId);
          }
          const urlPattern = /url\(\s*(['"]?)(.*?)\1\s*\)/giu;
          for (const match of value.matchAll(urlPattern)) {
            const reference = match[2]?.trim() ?? "";
            if (!reference.startsWith("#")) {
              throw new Error(
                `Downloaded SVG artifact contains an external url() in ${attribute.name}.`,
              );
            }
            const referencedId = reference.slice(1).trim();
            if (!referencedId) {
              throw new Error(
                `Downloaded SVG artifact url() in ${attribute.name} must name a local element.`,
              );
            }
            referencedIds.add(referencedId);
          }
        }
      }
      for (const referencedId of referencedIds) {
        if (!definedIds.has(referencedId)) {
          throw new Error(
            `Downloaded SVG artifact local reference #${referencedId} has no target.`,
          );
        }
      }
      if (vectorElementCount === 0) {
        throw new Error(
          "Downloaded SVG artifact contains no visible vector primitive.",
        );
      }

      const objectUrl = URL.createObjectURL(
        new Blob([svgSource], { type: "image/svg+xml" }),
      );
      const image = new Image();
      try {
        image.src = objectUrl;
        await image.decode();
        if (image.naturalWidth <= 0 || image.naturalHeight <= 0) {
          throw new Error("Downloaded SVG artifact decoded with empty bounds.");
        }
      } finally {
        URL.revokeObjectURL(objectUrl);
      }

      return {
        backgroundColor,
        height,
        vectorElementCount,
        viewBox: [
          Number(viewBox[0]),
          Number(viewBox[1]),
          Number(viewBox[2]),
          Number(viewBox[3]),
        ] as const,
        width,
      };
    },
    {
      backgroundAttribute: TOOLCRAFT_SVG_BACKGROUND_ATTRIBUTE,
      forbiddenNames: TOOLCRAFT_FORBIDDEN_SVG_ELEMENTS,
      namespace: TOOLCRAFT_SVG_NAMESPACE,
      nonRenderingNames: TOOLCRAFT_SVG_NON_RENDERING_CONTAINERS,
      primitiveNames: TOOLCRAFT_SVG_VECTOR_PRIMITIVES,
      productSceneAttribute: TOOLCRAFT_SVG_PRODUCT_SCENE_ATTRIBUTE,
      svgSource: source,
    },
  );

  const inspection = Object.freeze({
    byteLength: bytes.byteLength,
    backgroundColor: decoded.backgroundColor,
    contentHash: createHash("sha256").update(bytes).digest("hex"),
    height: decoded.height,
    kind: "svg",
    mediaType: "image/svg+xml",
    vectorElementCount: decoded.vectorElementCount,
    viewBox: decoded.viewBox,
    width: decoded.width,
  });
  inspectedSvgArtifacts.add(inspection);
  return Object.freeze({
    inspection,
    source,
  });
}
