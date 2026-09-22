export const TOOLCRAFT_SVG_NAMESPACE = "http://www.w3.org/2000/svg" as const;
export const TOOLCRAFT_SVG_BACKGROUND_ATTRIBUTE =
  "data-toolcraft-background" as const;
export const TOOLCRAFT_SVG_PRODUCT_SCENE_ATTRIBUTE =
  "data-toolcraft-product-scene" as const;

export const TOOLCRAFT_FORBIDDEN_SVG_ELEMENTS = Object.freeze([
  "animate",
  "animatecolor",
  "animatemotion",
  "animatetransform",
  "audio",
  "canvas",
  "discard",
  "embed",
  "feimage",
  "foreignobject",
  "handler",
  "iframe",
  "image",
  "object",
  "script",
  "set",
  "style",
  "video",
] as const);

export const TOOLCRAFT_SVG_VECTOR_PRIMITIVES = Object.freeze([
  "circle",
  "ellipse",
  "line",
  "path",
  "polygon",
  "polyline",
  "rect",
  "text",
  "use",
] as const);

export const TOOLCRAFT_SVG_NON_RENDERING_CONTAINERS = Object.freeze([
  "clippath",
  "defs",
  "marker",
  "mask",
  "pattern",
  "symbol",
] as const);
