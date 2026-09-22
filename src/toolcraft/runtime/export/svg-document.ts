import type { ToolcraftExportFrame } from "./export-frame";
import { ToolcraftArtifactExportError } from "./export-error";
import {
  TOOLCRAFT_FORBIDDEN_SVG_ELEMENTS,
  TOOLCRAFT_SVG_BACKGROUND_ATTRIBUTE,
  TOOLCRAFT_SVG_NAMESPACE,
  TOOLCRAFT_SVG_NON_RENDERING_CONTAINERS,
  TOOLCRAFT_SVG_PRODUCT_SCENE_ATTRIBUTE,
  TOOLCRAFT_SVG_VECTOR_PRIMITIVES,
} from "./svg-policy";

const forbiddenElementNames = new Set<string>(
  TOOLCRAFT_FORBIDDEN_SVG_ELEMENTS,
);
const vectorPrimitiveNames = new Set<string>(
  TOOLCRAFT_SVG_VECTOR_PRIMITIVES,
);
const nonRenderingContainerNames = new Set<string>(
  TOOLCRAFT_SVG_NON_RENDERING_CONTAINERS,
);

type ToolcraftSvgDocument = Readonly<{ document: XMLDocument }>;
type ToolcraftSvgProductContainer = Readonly<{ container: SVGGElement }>;

export type ToolcraftSerializedSvgDocument = Readonly<{
  source: string;
  vectorElementCount: number;
}>;

function getDocumentImplementation(): DOMImplementation {
  if (typeof document === "undefined") {
    throw new ToolcraftArtifactExportError({
      code: "svg-document-invalid",
      message: "SVG export requires browser XML document support.",
    });
  }
  return document.implementation;
}

function createSvgXmlDocument(rootName: "g" | "svg"): XMLDocument {
  return getDocumentImplementation().createDocument(
    TOOLCRAFT_SVG_NAMESPACE,
    rootName,
    null,
  );
}

function setFrameAttributes(
  root: SVGSVGElement,
  frame: ToolcraftExportFrame,
): void {
  root.setAttribute("width", String(frame.width));
  root.setAttribute("height", String(frame.height));
  root.setAttribute(
    "viewBox",
    `${frame.x} ${frame.y} ${frame.width} ${frame.height}`,
  );
}

export function createToolcraftSvgDocument(
  frame: ToolcraftExportFrame,
): ToolcraftSvgDocument {
  const svgDocument = createSvgXmlDocument("svg");
  const root = svgDocument.querySelector("svg");
  if (!root) {
    throw new ToolcraftArtifactExportError({
      code: "svg-document-invalid",
      message: "Runtime could not create the SVG document root.",
    });
  }
  setFrameAttributes(root, frame);
  return Object.freeze({ document: svgDocument });
}

export function createToolcraftSvgProductContainer(): ToolcraftSvgProductContainer {
  const productDocument = createSvgXmlDocument("g");
  const container = productDocument.querySelector("g");
  if (!container) {
    throw new ToolcraftArtifactExportError({
      code: "svg-document-invalid",
      message: "Runtime could not create the SVG product container.",
    });
  }
  container.setAttribute(TOOLCRAFT_SVG_PRODUCT_SCENE_ATTRIBUTE, "true");
  return Object.freeze({ container });
}

function hasNonRenderingAncestor(
  element: Element,
  container: Element,
): boolean {
  let current = element.parentElement;
  while (current && !current.isSameNode(container)) {
    if (nonRenderingContainerNames.has(current.localName.toLowerCase())) {
      return true;
    }
    current = current.parentElement;
  }
  return false;
}

function validateUrlReferences(
  attribute: Attr,
  referencedIds?: Set<string>,
): void {
  const attributeName = attribute.localName.toLowerCase();
  const value = attribute.value.trim();
  if (attributeName === "href" || attributeName === "src") {
    if (!value.startsWith("#")) {
      throw new ToolcraftArtifactExportError({
        code: "svg-content-invalid",
        message: `SVG export cannot contain external ${attribute.name} references.`,
      });
    }
    const referencedId = value.slice(1).trim();
    if (!referencedId) {
      throw new ToolcraftArtifactExportError({
        code: "svg-content-invalid",
        message: `SVG export ${attribute.name} references must name a local element.`,
      });
    }
    referencedIds?.add(referencedId);
  }

  const urlPattern = /url\(\s*(['"]?)(.*?)\1\s*\)/giu;
  for (const match of value.matchAll(urlPattern)) {
    const reference = match[2]?.trim() ?? "";
    if (!reference.startsWith("#")) {
      throw new ToolcraftArtifactExportError({
        code: "svg-content-invalid",
        message: `SVG export cannot contain external url() references in ${attribute.name}.`,
      });
    }
    const referencedId = reference.slice(1).trim();
    if (!referencedId) {
      throw new ToolcraftArtifactExportError({
        code: "svg-content-invalid",
        message: `SVG export url() in ${attribute.name} must name a local element.`,
      });
    }
    referencedIds?.add(referencedId);
  }
}

function validateProductContainer(container: Element): number {
  if (
    container.namespaceURI !== TOOLCRAFT_SVG_NAMESPACE ||
    container.localName !== "g" ||
    container.getAttribute(TOOLCRAFT_SVG_PRODUCT_SCENE_ATTRIBUTE) !== "true"
  ) {
    throw new ToolcraftArtifactExportError({
      code: "svg-content-invalid",
      message: "SVG product content must use the runtime-owned SVG group.",
    });
  }

  let vectorElementCount = 0;
  const definedIds = new Set<string>();
  const referencedIds = new Set<string>();
  const elements = [container, ...container.querySelectorAll("*")];
  for (const element of elements) {
    for (const node of element.childNodes) {
      if (node.nodeType !== Node.ELEMENT_NODE && node.nodeType !== Node.TEXT_NODE) {
        throw new ToolcraftArtifactExportError({
          code: "svg-content-invalid",
          message: "SVG export content may contain only elements and text nodes.",
        });
      }
    }
    if (element.namespaceURI !== TOOLCRAFT_SVG_NAMESPACE) {
      throw new ToolcraftArtifactExportError({
        code: "svg-content-invalid",
        message: "SVG export content must use the SVG namespace.",
      });
    }

    const elementName = element.localName.toLowerCase();
    if (
      (element !== container &&
        element.hasAttribute(TOOLCRAFT_SVG_PRODUCT_SCENE_ATTRIBUTE)) ||
      element.hasAttribute(TOOLCRAFT_SVG_BACKGROUND_ATTRIBUTE)
    ) {
      throw new ToolcraftArtifactExportError({
        code: "svg-content-invalid",
        message: "SVG product content cannot use runtime-owned marker attributes.",
      });
    }
    if (forbiddenElementNames.has(elementName)) {
      throw new ToolcraftArtifactExportError({
        code: "svg-content-invalid",
        message: `SVG export cannot contain <${element.localName}> content.`,
      });
    }
    if (
      vectorPrimitiveNames.has(elementName) &&
      !hasNonRenderingAncestor(element, container)
    ) {
      vectorElementCount += 1;
    }

    for (const attribute of element.attributes) {
      if (attribute.localName.toLowerCase() === "id") {
        const id = attribute.value.trim();
        if (!id || definedIds.has(id)) {
          throw new ToolcraftArtifactExportError({
            code: "svg-content-invalid",
            message: "SVG export element ids must be non-empty and unique.",
          });
        }
        definedIds.add(id);
      }
      if (attribute.localName.toLowerCase().startsWith("on")) {
        throw new ToolcraftArtifactExportError({
          code: "svg-content-invalid",
          message: `SVG export cannot contain event attribute ${attribute.name}.`,
        });
      }
      validateUrlReferences(attribute, referencedIds);
    }
  }

  for (const referencedId of referencedIds) {
    if (!definedIds.has(referencedId)) {
      throw new ToolcraftArtifactExportError({
        code: "svg-content-invalid",
        message: `SVG export local reference #${referencedId} has no matching element.`,
      });
    }
  }

  if (vectorElementCount === 0) {
    throw new ToolcraftArtifactExportError({
      code: "svg-content-empty",
      message: "SVG export must contain at least one visible vector primitive.",
    });
  }
  return vectorElementCount;
}

function createBackground(
  svgDocument: XMLDocument,
  frame: ToolcraftExportFrame,
  color: string,
): SVGRectElement {
  if (!color.trim()) {
    throw new ToolcraftArtifactExportError({
      code: "svg-content-invalid",
      message: "SVG export background color must not be blank.",
    });
  }
  const background = svgDocument.createElementNS(
    TOOLCRAFT_SVG_NAMESPACE,
    "rect",
  );
  background.setAttribute(TOOLCRAFT_SVG_BACKGROUND_ATTRIBUTE, "true");
  background.setAttribute("fill", color);
  background.setAttribute("x", String(frame.x));
  background.setAttribute("y", String(frame.y));
  background.setAttribute("width", String(frame.width));
  background.setAttribute("height", String(frame.height));
  const fill = background.getAttributeNode("fill");
  if (fill) validateUrlReferences(fill);
  return background;
}

function requireStrictSvgSource(
  source: string,
  frame: ToolcraftExportFrame,
  backgroundColor: string | null,
  expectedVectorElementCount: number,
): void {
  const parsed = new DOMParser().parseFromString(source, "image/svg+xml");
  if (parsed.getElementsByTagName("parsererror").length > 0) {
    throw new ToolcraftArtifactExportError({
      code: "svg-serialization-failed",
      message: "Serialized SVG export is not valid XML.",
    });
  }
  const root = parsed.documentElement;
  if (
    root.localName !== "svg" ||
    root.namespaceURI !== TOOLCRAFT_SVG_NAMESPACE ||
    root.getAttribute("width") !== String(frame.width) ||
    root.getAttribute("height") !== String(frame.height) ||
    root.getAttribute("viewBox") !==
      `${frame.x} ${frame.y} ${frame.width} ${frame.height}`
  ) {
    throw new ToolcraftArtifactExportError({
      code: "svg-serialization-failed",
      message: "Serialized SVG export lost its runtime-owned frame metadata.",
    });
  }

  const productContainers = root.querySelectorAll(
    `[${TOOLCRAFT_SVG_PRODUCT_SCENE_ATTRIBUTE}]`,
  );
  const backgrounds = root.querySelectorAll(
    `[${TOOLCRAFT_SVG_BACKGROUND_ATTRIBUTE}]`,
  );
  const productContainer = productContainers[0];
  const expectedChildCount = backgroundColor === null ? 1 : 2;
  if (
    productContainers.length !== 1 ||
    !productContainer ||
    productContainer.parentElement !== root ||
    root.children.length !== expectedChildCount ||
    root.children[expectedChildCount - 1] !== productContainer ||
    validateProductContainer(productContainer) !== expectedVectorElementCount
  ) {
    throw new ToolcraftArtifactExportError({
      code: "svg-serialization-failed",
      message: "Serialized SVG export lost its runtime-owned product structure.",
    });
  }

  if (backgroundColor === null) {
    if (backgrounds.length > 0) {
      throw new ToolcraftArtifactExportError({
        code: "svg-serialization-failed",
        message: "Serialized SVG export gained an unexpected background.",
      });
    }
    return;
  }

  const background = backgrounds[0];
  if (
    backgrounds.length !== 1 ||
    !background ||
    background.localName !== "rect" ||
    background.parentElement !== root ||
    root.children[0] !== background ||
    background.getAttribute("fill") !== backgroundColor ||
    background.getAttribute("x") !== String(frame.x) ||
    background.getAttribute("y") !== String(frame.y) ||
    background.getAttribute("width") !== String(frame.width) ||
    background.getAttribute("height") !== String(frame.height)
  ) {
    throw new ToolcraftArtifactExportError({
      code: "svg-serialization-failed",
      message: "Serialized SVG export lost its runtime-owned background.",
    });
  }
}

export function serializeToolcraftSvgDocument({
  backgroundColor,
  container,
  document: svgDocument,
  frame,
}: Readonly<{
  backgroundColor: string | null;
  container: SVGGElement;
  document: XMLDocument;
  frame: ToolcraftExportFrame;
}>): ToolcraftSerializedSvgDocument {
  try {
    const vectorElementCount = validateProductContainer(container);
    const root = svgDocument.querySelector("svg");
    if (!root) {
      throw new ToolcraftArtifactExportError({
        code: "svg-document-invalid",
        message: "Runtime SVG document is missing its root.",
      });
    }
    if (root.childNodes.length > 0) {
      throw new ToolcraftArtifactExportError({
        code: "svg-document-invalid",
        message: "Runtime SVG document must be assembled exactly once.",
      });
    }

    const productContent = svgDocument.importNode(container, true);
    const nodes: Node[] =
      backgroundColor === null
        ? [productContent]
        : [createBackground(svgDocument, frame, backgroundColor), productContent];
    root.append(...nodes);

    const source = `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(svgDocument)}`;
    requireStrictSvgSource(
      source,
      frame,
      backgroundColor,
      vectorElementCount,
    );
    return Object.freeze({ source, vectorElementCount });
  } catch (error) {
    if (error instanceof ToolcraftArtifactExportError) {
      throw error;
    }
    throw new ToolcraftArtifactExportError(
      {
        code: "svg-serialization-failed",
        message: "Toolcraft could not serialize the SVG export.",
      },
      { cause: error },
    );
  }
}
