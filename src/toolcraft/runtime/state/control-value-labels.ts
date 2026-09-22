import type { ToolcraftControlSchema } from "../schema/types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asFiniteNumber(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : fallback;
}

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

export function formatToolcraftControlValueLabel(
  control: ToolcraftControlSchema,
  value: unknown,
): string {
  if (typeof control.valueLabel === "string") {
    return control.valueLabel;
  }

  switch (control.type) {
    case "aspectRatio":
      return isRecord(value)
        ? asString(value.value, `${asFiniteNumber(value.width, 1)}:${asFiniteNumber(value.height, 1)}`)
        : asString(value, "1:1");
    case "checkbox":
    case "switch":
      return value === true ? "On" : "Off";
    case "color":
      return asString(value, "#C1FF00");
    case "colorOpacity": {
      const color = typeof value === "string"
        ? value
        : isRecord(value)
          ? asString(value.hex, "#C1FF00")
          : "#C1FF00";
      const opacity = isRecord(value) ? asFiniteNumber(value.opacity, 100) : 100;
      return `${color} ${opacity}%`;
    }
    case "collectionActions":
    case "sourceCollection":
      return `${Array.isArray(value) ? value.length : 0} items`;
    case "fontPicker":
      return typeof value === "string"
        ? value
        : isRecord(value)
          ? asString(value.fontId, "inter")
          : "inter";
    case "gradient":
      return `${isRecord(value) && Array.isArray(value.stops) ? value.stops.length : 0} stops`;
    case "imagePicker":
      return control.items?.find((item) => item.value === value)?.alt ?? asString(value);
    case "palette":
      return isRecord(value)
        ? [asString(value.family), asString(value.shade)].filter(Boolean).join(" ") || "Palette"
        : "Palette";
    case "rangeInput":
      return isRecord(value)
        ? `${asString(value.start, "0%")} – ${asString(value.end, "100%")}`
        : "0% – 100%";
    case "rangeSlider":
      return Array.isArray(value) && value.length > 0
        ? value.map((item) => `${asFiniteNumber(item)}${control.unit ?? ""}`).join(" – ")
        : "Range";
    case "select":
    case "segmented":
    case "tabs":
      return control.options?.find((option) => option.value === value)?.label ?? asString(value);
    case "slider":
      return `${asFiniteNumber(value, asFiniteNumber(control.defaultValue, control.min ?? 0))}${control.unit ?? ""}`;
    case "vector":
      return isRecord(value)
        ? `${asFiniteNumber(value.x)}, ${asFiniteNumber(value.y)}`
        : "0, 0";
    default:
      return typeof value === "string" || typeof value === "number"
        ? String(value)
        : control.type;
  }
}
