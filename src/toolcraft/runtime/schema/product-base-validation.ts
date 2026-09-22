import type { ResolvedToolcraftProductModules } from "../modules/resolution/resolve-product-modules";
import type { ToolcraftProductBase } from "./product-base";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function collectAuthoredControlBoundaryErrors(base: ToolcraftProductBase, errors: string[]): void {
  const controlsPanel = base.panels.controls;
  if (controlsPanel === undefined) return;

  for (const [sectionIndex, section] of controlsPanel.sections.entries()) {
    if (!Object.hasOwn(section, "id") || typeof section.id !== "string") {
      errors.push(
        `Toolcraft product-authored control section at index ${sectionIndex} requires an explicit id.`,
      );
    }

    for (const [controlId, control] of Object.entries(section.controls)) {
      if (!Object.hasOwn(control, "applicability")) {
        errors.push(
          `Toolcraft product-authored control "${controlId}" requires explicit applicability.`,
        );
      }
      if (Object.hasOwn(control, "visibleWhen")) {
        errors.push(
          `Toolcraft product-authored control "${controlId}" cannot declare visibleWhen; use applicability.`,
        );
      }
      if (isRecord(control.applicability) && Object.hasOwn(control.applicability, "origin")) {
        errors.push(
          `Toolcraft product-authored control "${controlId}" cannot author applicability.origin; Toolcraft owns resolved provenance.`,
        );
      }
    }
  }
}

function describeProductValue(value: object): string {
  if (ArrayBuffer.isView(value)) return value.constructor.name;
  return value.constructor?.name ?? "non-plain object";
}

function collectSerializableProductValueErrors(
  value: unknown,
  path: string,
  ancestors: WeakSet<object>,
  errors: string[],
): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return;
  }
  if (value === undefined) {
    errors.push(
      `Toolcraft product value at "${path}" must be serializable plain data; undefined values are forbidden.`,
    );
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      errors.push(
        `Toolcraft product value at "${path}" must be serializable plain data; non-finite numbers are forbidden.`,
      );
    }
    return;
  }
  if (typeof value !== "object") {
    errors.push(
      `Toolcraft product value at "${path}" must be serializable plain data; ${typeof value} values are forbidden.`,
    );
    return;
  }
  if (ancestors.has(value)) {
    errors.push(
      `Toolcraft product value at "${path}" must be serializable plain data; cyclic aliases are forbidden.`,
    );
    return;
  }
  const isArray = Array.isArray(value);
  const prototype = Object.getPrototypeOf(value);
  if (
    (isArray && prototype !== Array.prototype) ||
    (!isArray && prototype !== Object.prototype && prototype !== null)
  ) {
    errors.push(
      `Toolcraft product value at "${path}" must be serializable plain data; ${describeProductValue(value)} is forbidden.`,
    );
    return;
  }

  ancestors.add(value);
  if (isArray) {
    collectSerializableArrayErrors(value, path, ancestors, errors);
  } else {
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key === "symbol") {
        errors.push(
          `Toolcraft product value at "${path}" must be serializable plain data; symbol keys are forbidden.`,
        );
        continue;
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (
        descriptor === undefined ||
        descriptor.get !== undefined ||
        descriptor.set !== undefined ||
        descriptor.enumerable !== true
      ) {
        errors.push(
          `Toolcraft product value at "${path}.${key}" must be serializable plain data; accessors and non-enumerable fields are forbidden.`,
        );
        continue;
      }
      collectSerializableProductValueErrors(descriptor.value, `${path}.${key}`, ancestors, errors);
    }
  }
  ancestors.delete(value);
}

function isCanonicalArrayIndex(key: string, length: number): boolean {
  if (!/^(0|[1-9]\d*)$/.test(key)) return false;
  const index = Number(key);
  return Number.isSafeInteger(index) && index >= 0 && index < length;
}

function collectSerializableArrayErrors(
  value: unknown[],
  path: string,
  ancestors: WeakSet<object>,
  errors: string[],
): void {
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
  if (
    lengthDescriptor === undefined ||
    lengthDescriptor.configurable !== false ||
    lengthDescriptor.enumerable !== false ||
    lengthDescriptor.get !== undefined ||
    lengthDescriptor.set !== undefined
  ) {
    errors.push(
      `Toolcraft product value at "${path}.length" must be serializable plain data; the array length descriptor is non-canonical.`,
    );
  }

  let indexCount = 0;
  for (const key of Reflect.ownKeys(value)) {
    if (key === "length") continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    const keyPath = typeof key === "symbol" ? `${path}[symbol]` : `${path}.${key}`;
    const isIndex = typeof key === "string" && isCanonicalArrayIndex(key, value.length);

    if (!isIndex) {
      errors.push(
        `Toolcraft product value at "${keyPath}" must be serializable plain data; arrays may own indices and length only.`,
      );
    } else {
      indexCount += 1;
    }
    if (
      descriptor === undefined ||
      descriptor.get !== undefined ||
      descriptor.set !== undefined ||
      descriptor.enumerable !== true
    ) {
      errors.push(
        `Toolcraft product value at "${keyPath}" must be serializable plain data; array elements must use canonical data descriptors.`,
      );
      continue;
    }
    collectSerializableProductValueErrors(descriptor.value, keyPath, ancestors, errors);
  }
  if (indexCount !== value.length) {
    errors.push(
      `Toolcraft product value at "${path}" must be serializable plain data; sparse array indices are forbidden.`,
    );
  }
}

export function getToolcraftProductPlainDataValidationErrors(base: unknown): readonly string[] {
  const errors: string[] = [];
  collectSerializableProductValueErrors(base, "base", new WeakSet(), errors);
  return Object.freeze(errors.sort());
}

export function getToolcraftProductBaseSemanticValidationErrors(
  base: ToolcraftProductBase,
  resolution: ResolvedToolcraftProductModules,
): readonly string[] {
  const errors: string[] = [];
  const unsafeBase = base as unknown as Record<string, unknown>;
  const identity = unsafeBase.identity;

  collectAuthoredControlBoundaryErrors(base, errors);

  if (
    !isRecord(identity) ||
    typeof identity.id !== "string" ||
    identity.id.trim() === "" ||
    typeof identity.title !== "string" ||
    identity.title.trim() === ""
  ) {
    errors.push(
      "Toolcraft product base.identity requires non-empty id and title strings and is the only identity source.",
    );
  }

  if (Object.hasOwn(unsafeBase, "export")) {
    errors.push(
      "Toolcraft product base.export is module-owned and cannot be authored in the product base.",
    );
  }

  const panels = isRecord(unsafeBase.panels) ? unsafeBase.panels : {};
  if (Object.hasOwn(panels, "layers")) {
    errors.push(
      "Toolcraft product base panels.layers is module-owned and cannot be authored directly.",
    );
  }
  if (Object.hasOwn(panels, "timeline")) {
    errors.push(
      "Toolcraft product base panels.timeline is module-owned and cannot be authored directly.",
    );
  }

  const persistence = unsafeBase.persistence;
  if (isRecord(persistence)) {
    for (const field of ["include", "key", "version"] as const) {
      if (Object.hasOwn(persistence, field)) {
        errors.push(
          `Toolcraft product base persistence.${field} is runtime-owned and cannot be authored directly.`,
        );
      }
    }
  }

  const settingsTransfer = unsafeBase.settingsTransfer;
  if (isRecord(settingsTransfer) && Object.hasOwn(settingsTransfer, "appId")) {
    errors.push(
      "Toolcraft product base settingsTransfer.appId is forbidden; base.identity is the only identity source.",
    );
  }

  const contributions = resolution.contributionResolution;
  if (
    base.panels.controls === undefined &&
    (contributions.controlSections.length > 0 || contributions.panelActionsSection !== undefined)
  ) {
    errors.push(
      "Toolcraft product definition cannot compose module control contributions without a base controls panel.",
    );
  }

  if (!base.canvas.enabled) {
    for (const behavior of contributions.canvasBehaviors) {
      errors.push(
        `Resolved canvas behavior "${behavior.behavior}" requires base canvas.enabled true.`,
      );
    }
  }

  return Object.freeze(errors.sort());
}
