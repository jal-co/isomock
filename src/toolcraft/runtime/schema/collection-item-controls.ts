export const TOOLCRAFT_COLLECTION_ITEM_CONTROL_TYPES = [
  "checkbox",
  "color",
  "colorOpacity",
  "fontPicker",
  "rangeInput",
  "rangeSlider",
  "segmented",
  "select",
  "slider",
  "switch",
  "text",
  "vector",
] as const;

export type ToolcraftCollectionItemControlType =
  (typeof TOOLCRAFT_COLLECTION_ITEM_CONTROL_TYPES)[number];

const toolcraftCollectionItemControlTypes = new Set<string>(
  TOOLCRAFT_COLLECTION_ITEM_CONTROL_TYPES,
);

export function isToolcraftCollectionItemControlType(
  value: unknown,
): value is ToolcraftCollectionItemControlType {
  return (
    typeof value === "string" && toolcraftCollectionItemControlTypes.has(value)
  );
}
