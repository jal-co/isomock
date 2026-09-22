import { isToolcraftBuiltInControlType } from "../contracts/component-contracts";
import {
  getToolcraftCanvasSizeTargetDimension,
  isToolcraftCanvasAspectRatioTarget,
  isToolcraftCanvasInfinityTarget,
  isToolcraftTimelinePanelRuntimeTarget,
} from "../schema/runtime-targets";
import type { ResolvedToolcraftControlSchema } from "../schema/types";
import type { ResolvedToolcraftAppSchema } from "../schema/resolved-app-schema";
import {
  cloneToolcraftJsonValue,
  decodeToolcraftBuiltInControlDefault,
  decodeToolcraftBuiltInLiveValue,
  decodeToolcraftBuiltInControlValue,
  TOOLCRAFT_CONTROL_VALUE_CODEC_REGISTRY,
  type ToolcraftControlValueDecodeResult,
} from "./control-value-codecs";
import {
  asToolcraftCanvasSizeDimension,
  decodeToolcraftCanvasAspectRatioValue,
} from "./canvas-state";

export type ToolcraftNormalizedControlValue =
  | { accepted: true; value: unknown }
  | { accepted: false; fallback: unknown };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isJsonValue(value: unknown): boolean {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    isFiniteNumber(value)
  ) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every(isJsonValue);
  }

  return isRecord(value) && Object.values(value).every(isJsonValue);
}

function matchesDefaultContainer(
  candidate: unknown,
  defaultValue: unknown,
): boolean {
  if (defaultValue === undefined) {
    return isJsonValue(candidate);
  }
  if (defaultValue === null || typeof defaultValue !== "object") {
    return typeof candidate === typeof defaultValue && isJsonValue(candidate);
  }
  if (Array.isArray(defaultValue)) {
    return Array.isArray(candidate) && candidate.every(isJsonValue);
  }
  return isRecord(candidate) && isJsonValue(candidate);
}

function decodeToolcraftControlCandidate(
  control: ResolvedToolcraftControlSchema,
  candidate: unknown,
  live = false,
): ToolcraftControlValueDecodeResult {
  if (getToolcraftCanvasSizeTargetDimension(control.target)) {
    const value = asToolcraftCanvasSizeDimension(candidate);
    return value === null ? { accepted: false } : { accepted: true, value };
  }

  if (isToolcraftCanvasAspectRatioTarget(control.target)) {
    const value = decodeToolcraftCanvasAspectRatioValue(candidate);
    return value === null ? { accepted: false } : { accepted: true, value };
  }

  const builtIn = live
    ? decodeToolcraftBuiltInLiveValue(control, candidate)
    : decodeToolcraftBuiltInControlValue(control, candidate);
  if (builtIn !== null) {
    return builtIn;
  }

  return matchesDefaultContainer(candidate, control.defaultValue)
    ? { accepted: true, value: cloneToolcraftJsonValue(candidate) }
    : { accepted: false };
}

export function getCanonicalToolcraftControlDefault(
  control: ResolvedToolcraftControlSchema,
): unknown {
  if (!isToolcraftBuiltInControlType(control.type)) {
    return cloneToolcraftJsonValue(control.defaultValue);
  }

  const decoded =
    isToolcraftCanvasAspectRatioTarget(control.target) ||
    getToolcraftCanvasSizeTargetDimension(control.target)
      ? decodeToolcraftControlCandidate(control, control.defaultValue)
      : decodeToolcraftBuiltInControlDefault(control);
  if (decoded?.accepted) {
    return decoded.value;
  }

  throw new Error(
    `Invalid defaultValue for ${control.target} (${control.type}).`,
  );
}

export function normalizeToolcraftControlValue(
  control: ResolvedToolcraftControlSchema,
  candidate: unknown,
): ToolcraftNormalizedControlValue {
  const decoded = decodeToolcraftControlCandidate(control, candidate);
  return decoded.accepted
    ? decoded
    : {
        accepted: false,
        fallback: getCanonicalToolcraftControlDefault(control),
      };
}

export function normalizeToolcraftLiveControlValue(
  control: ResolvedToolcraftControlSchema,
  candidate: unknown,
): ToolcraftNormalizedControlValue {
  const decoded = decodeToolcraftControlCandidate(control, candidate, true);
  return decoded.accepted
    ? decoded
    : {
        accepted: false,
        fallback: getCanonicalToolcraftControlDefault(control),
      };
}

const valueControlsBySchema = new WeakMap<
  ResolvedToolcraftAppSchema,
  ReadonlyMap<string, ResolvedToolcraftControlSchema>
>();

function compileToolcraftValueControls(
  schema: ResolvedToolcraftAppSchema,
): ReadonlyMap<string, ResolvedToolcraftControlSchema> {
  const controls = new Map<string, ResolvedToolcraftControlSchema>();

  for (const section of schema.panels.controls?.sections ?? []) {
    for (const control of Object.values(section.controls)) {
      if (
        isToolcraftCanvasInfinityTarget(control.target) ||
        isToolcraftTimelinePanelRuntimeTarget(control.target)
      ) {
        continue;
      }

      const decision = isToolcraftBuiltInControlType(control.type)
        ? TOOLCRAFT_CONTROL_VALUE_CODEC_REGISTRY[control.type]
        : null;
      if (
        decision === null ||
        decision.kind === "codec" ||
        decision.kind === "runtime-owned" ||
        (decision.kind === "conditional-codec" && decision.ownsValue(control))
      ) {
        controls.set(control.target, control);
      }
    }
  }

  return controls;
}

export function getToolcraftValueControls(
  schema: ResolvedToolcraftAppSchema,
): ReadonlyMap<string, ResolvedToolcraftControlSchema> {
  const cached = valueControlsBySchema.get(schema);
  if (cached) {
    return cached;
  }

  const controls = compileToolcraftValueControls(schema);
  valueControlsBySchema.set(schema, controls);
  return controls;
}

export function createCanonicalToolcraftControlDefaults(
  controls: ReadonlyMap<string, ResolvedToolcraftControlSchema>,
): Record<string, unknown> {
  return Object.fromEntries(
    [...controls].map(([target, control]) => [
      target,
      getCanonicalToolcraftControlDefault(control),
    ]),
  );
}

export function mergeCanonicalToolcraftInitialValues({
  controls,
  defaults,
  initialValues = {},
}: {
  controls: ReadonlyMap<string, ResolvedToolcraftControlSchema>;
  defaults: Readonly<Record<string, unknown>>;
  initialValues?: Readonly<Record<string, unknown>>;
}): Record<string, unknown> {
  const values = { ...defaults };

  for (const [target, candidate] of Object.entries(initialValues)) {
    const control = controls.get(target);
    if (!control) {
      values[target] = candidate;
      continue;
    }

    const normalized = normalizeToolcraftControlValue(control, candidate);
    values[target] = normalized.accepted
      ? normalized.value
      : normalized.fallback;
  }

  return values;
}

/** Keyed collection identity is document structure: an invalid candidate cannot fall back destructively. */
export function getInvalidToolcraftKeyedCollectionTarget(
  controls: ReadonlyMap<string, ResolvedToolcraftControlSchema>,
  values: Readonly<Record<string, unknown>>,
): string | undefined {
  for (const [target, candidate] of Object.entries(values)) {
    const control = controls.get(target);
    if (control?.identityField && !decodeToolcraftBuiltInControlValue(control, candidate)?.accepted) return target;
  }
  return undefined;
}
