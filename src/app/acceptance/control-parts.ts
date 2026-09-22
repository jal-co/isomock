import type { ToolcraftControlSchema } from "@/toolcraft/runtime";

import type { ToolcraftControlPartCoverage } from "./types";

export function getRequiredToolcraftControlPartCoverage(
  control: ToolcraftControlSchema,
): readonly ToolcraftControlPartCoverage[] {
  switch (control.type) {
    case "anchorGrid":
      return ["anchorGrid.position"];
    case "channelMixer":
      return ["channelMixer.activeChannel", "channelMixer.values"];
    case "collectionActions":
      return [
        "collectionActions.add",
        "collectionActions.remove",
        "collectionActions.items",
      ];
    case "curves":
      return control.variant === "single"
        ? ["curves.points"]
        : ["curves.activeChannel", "curves.points"];
    case "fontPicker":
      return [
        "fontPicker.fontId",
        "fontPicker.fontWeight",
        "fontPicker.fontSize",
        "fontPicker.letterSpacing",
        "fontPicker.lineHeight",
        "fontPicker.textCase",
        "fontPicker.color",
        "fontPicker.opacity",
      ];
    case "gradient":
      return [
        "gradient.gradientType",
        "gradient.angle",
        "gradient.stops.position",
        "gradient.stops.color",
        "gradient.stops.opacity",
      ];
    case "palette":
      return ["palette.family", "palette.shade"];
    case "rangeInput":
      return ["rangeInput.start", "rangeInput.end"];
    case "rangeSlider":
      return ["rangeSlider.lower", "rangeSlider.upper"];
    case "sourceCollection":
      return ["sourceCollection.items"];
    case "vector":
      return ["vector.x", "vector.y"];
    default:
      return [];
  }
}
