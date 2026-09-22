import {
  getToolcraftCollectionItemDefault,
  getToolcraftScalarCollectionItemControl,
} from "../../../schema/collection-item-defaults";
import type { ToolcraftControlSchema } from "../../../schema/types";
import { asNumber } from "./controls-panel-value-primitives";

export function asCollectionItems(
  value: unknown,
  fallback: unknown,
): unknown[] {
  if (Array.isArray(value)) {
    return [...value];
  }

  return Array.isArray(fallback) ? [...fallback] : [];
}

export function getCollectionMinItems(control: ToolcraftControlSchema): number {
  return Math.max(0, Math.floor(asNumber(control.minItems, 0)));
}

export function getCollectionHardMaxItems(
  control: ToolcraftControlSchema,
): number | null {
  if (
    typeof control.hardMaxItems !== "number" ||
    !Number.isFinite(control.hardMaxItems)
  ) {
    return null;
  }

  return Math.max(0, Math.floor(control.hardMaxItems));
}

export function getCollectionItemType(
  control: ToolcraftControlSchema,
) {
  return getToolcraftScalarCollectionItemControl(control).type;
}

export function getCollectionItemBaseLabel(
  control: ToolcraftControlSchema,
): string {
  if (control.itemLabel) {
    return control.itemLabel;
  }

  const label = control.itemControl?.label;

  return typeof label === "string" ? label : "Item";
}

export function getCollectionItemName(
  control: ToolcraftControlSchema,
  index: number,
): string {
  const label = control.itemControl?.label;

  if (label === false) {
    return "";
  }

  return `${getCollectionItemBaseLabel(control)} ${index + 1}`;
}

export function getCollectionItemDefaultValue(
  control: ToolcraftControlSchema,
): unknown {
  return getToolcraftCollectionItemDefault(control);
}
