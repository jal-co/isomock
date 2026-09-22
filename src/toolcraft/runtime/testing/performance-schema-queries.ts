import type { ToolcraftControlSchema } from "../schema/types";
import type { ResolvedToolcraftAppSchema } from "../schema/resolved-app-schema";
import { TOOLCRAFT_ARTIFACT_EXPORT_ACTION_ROLES } from "../schema/artifact-export-actions";
import type { ToolcraftPerformanceValueSet } from "./performance-types";

export function getAllSchemaControls(
  schema: ResolvedToolcraftAppSchema,
): ToolcraftControlSchema[] {
  return (schema.panels.controls?.sections ?? []).flatMap((section) =>
    Object.values(section.controls),
  );
}

export function getVisiblePerformanceControlTargets(
  schema: ResolvedToolcraftAppSchema,
): string[] {
  return getAllSchemaControls(schema)
    .filter((control) => control.type !== "panelActions")
    .map((control) => control.target);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function getToolcraftControlPerformanceValues(
  control: ToolcraftControlSchema | undefined,
): ToolcraftPerformanceValueSet | null {
  if (!control) {
    return null;
  }

  if (
    control.type === "slider" &&
    isFiniteNumber(control.defaultValue) &&
    isFiniteNumber(control.max) &&
    isFiniteNumber(control.min)
  ) {
    return {
      default: control.defaultValue,
      max: control.max,
      min: control.min,
    };
  }

  if (
    control.type === "rangeSlider" &&
    Array.isArray(control.defaultValue) &&
    control.defaultValue.length === 2 &&
    control.defaultValue.every(isFiniteNumber) &&
    isFiniteNumber(control.max) &&
    isFiniteNumber(control.min)
  ) {
    return {
      default: [...control.defaultValue],
      max: [control.max, control.max],
      min: [control.min, control.min],
    };
  }

  if (
    (control.type === "select" ||
      control.type === "segmented" ||
      control.type === "tabs") &&
    control.options &&
    control.options.length > 0
  ) {
    return {
      default: control.defaultValue ?? control.options[0]?.value,
      max: control.options.at(-1)?.value,
      min: control.options[0]?.value,
    };
  }

  return null;
}

export function getToolcraftSchemaPerformanceValues(
  schema: ResolvedToolcraftAppSchema,
  target: string,
): ToolcraftPerformanceValueSet | null {
  return getToolcraftControlPerformanceValues(
    getAllSchemaControls(schema).find((control) => control.target === target),
  );
}

export function requireToolcraftSchemaPerformanceValues(
  schema: ResolvedToolcraftAppSchema,
  target: string,
): ToolcraftPerformanceValueSet {
  const values = getToolcraftSchemaPerformanceValues(schema, target);

  if (!values) {
    throw new Error(
      `Toolcraft schema target "${target}" does not expose a derivable performance range.`,
    );
  }

  return values;
}

function getActionValue(
  action: NonNullable<ToolcraftControlSchema["actions"]>[number],
): string {
  return typeof action === "string" ? action : action.value;
}

function getActionLabel(
  action: NonNullable<ToolcraftControlSchema["actions"]>[number],
): string | undefined {
  return typeof action === "string" ? undefined : action.label;
}

function normalizeActionReference(value: string | undefined): string {
  return String(value ?? "")
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const outputDeliveryActionRoles = new Set([
  "copy-output",
  "download-output",
  ...TOOLCRAFT_ARTIFACT_EXPORT_ACTION_ROLES,
]);

function isOutputDeliveryAction(
  action: NonNullable<ToolcraftControlSchema["actions"]>[number],
): boolean {
  return (
    typeof action !== "string" &&
    outputDeliveryActionRoles.has(action.role ?? "")
  );
}

function getOutputDeliveryActions(
  schema: ResolvedToolcraftAppSchema,
): NonNullable<ToolcraftControlSchema["actions"]>[number][] {
  return getAllSchemaControls(schema).flatMap((control) => {
    if (control.type !== "panelActions") {
      return [];
    }

    return (control.actions ?? []).filter(isOutputDeliveryAction);
  });
}

export function hasOutputDeliveryAction(
  schema: ResolvedToolcraftAppSchema,
): boolean {
  return getOutputDeliveryActions(schema).length > 0;
}

export function hasOutputDeliveryActionReference(
  schema: ResolvedToolcraftAppSchema,
  reference: { actionValue?: string; controlLabel?: string },
): boolean {
  const outputActions = getOutputDeliveryActions(schema);
  const expectedActionValue = reference.actionValue?.trim();
  if (!expectedActionValue) {
    return false;
  }

  const matchingAction = outputActions.find(
    (action) => getActionValue(action).trim() === expectedActionValue,
  );
  if (!matchingAction) {
    return false;
  }

  const expectedLabel = normalizeActionReference(reference.controlLabel);
  return (
    !expectedLabel ||
    normalizeActionReference(
      getActionLabel(matchingAction) ?? getActionValue(matchingAction),
    ) === expectedLabel
  );
}

export function hasKeyframeTimeline(
  schema: ResolvedToolcraftAppSchema,
): boolean {
  return (
    schema.panels.timeline?.enabled === true &&
    schema.panels.timeline.mode === "keyframes"
  );
}

export function hasLayersPanel(schema: ResolvedToolcraftAppSchema): boolean {
  return schema.panels.layers === true;
}
