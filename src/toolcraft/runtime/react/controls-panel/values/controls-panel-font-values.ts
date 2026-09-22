import type { FontPickerValue } from "@/toolcraft/ui";

import {
  asNumber,
  asString,
  isRecord,
} from "./controls-panel-value-primitives";

export function asFontPickerValue(value: unknown): FontPickerValue {
  if (typeof value === "string") {
    return {
      color: "#FFFFFF",
      fontId: value,
      fontSize: 16,
      fontWeight: "400",
      letterSpacing: "normal",
      lineHeight: "normal",
      opacity: 100,
      textCase: "original",
    };
  }

  if (isRecord(value)) {
    return {
      color: asString(value.color, "#FFFFFF"),
      fontId: asString(value.fontId, "inter"),
      fontSize: asNumber(value.fontSize, 16),
      fontWeight: asString(value.fontWeight, "400"),
      letterSpacing:
        value.letterSpacing === "tightest" ||
        value.letterSpacing === "tighter" ||
        value.letterSpacing === "tight" ||
        value.letterSpacing === "normal" ||
        value.letterSpacing === "wide" ||
        value.letterSpacing === "wider" ||
        value.letterSpacing === "widest"
          ? value.letterSpacing
          : "normal",
      lineHeight:
        value.lineHeight === "none" ||
        value.lineHeight === "tight" ||
        value.lineHeight === "snug" ||
        value.lineHeight === "normal" ||
        value.lineHeight === "relaxed" ||
        value.lineHeight === "spacious" ||
        value.lineHeight === "loose"
          ? value.lineHeight
          : "normal",
      opacity: Math.min(100, Math.max(0, Math.round(asNumber(value.opacity, 100)))),
      textCase:
        value.textCase === "original" ||
        value.textCase === "uppercase" ||
        value.textCase === "lowercase" ||
        value.textCase === "capitalize" ||
        value.textCase === "titleCase"
          ? value.textCase
          : "original",
    };
  }

  return {
    color: "#FFFFFF",
    fontId: "inter",
    fontSize: 16,
    fontWeight: "400",
    letterSpacing: "normal",
    lineHeight: "normal",
    opacity: 100,
    textCase: "original",
  };
}
