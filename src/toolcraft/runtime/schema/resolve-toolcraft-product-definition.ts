import { applyToolcraftAppDefaults } from "./app-defaults";
import { toolcraftCoreModuleCatalog } from "../composition/core-module-catalog";
import {
  resolveToolcraftProductModules,
  type ResolvedToolcraftProductModules,
} from "../modules/resolution/resolve-product-modules";
import { resolveRequiredToolcraftAppIdentity } from "./app-identity";
import type { ToolcraftControlsPanelSchema, ToolcraftPanelsSchema } from "./types";
import type { ToolcraftProductDefinition } from "./product-base";
import {
  getToolcraftProductBaseSemanticValidationErrors,
  getToolcraftProductPlainDataValidationErrors,
} from "./product-base-validation";
import { getToolcraftStandardCapabilityOwnershipErrors } from "./product-standard-capability-ownership";
import type { ResolvedToolcraftAppSchema } from "./resolved-app-schema";
import { resolveToolcraftMaterializedSchema } from "./resolve-toolcraft-materialized-schema";

function cloneProductValue<Value>(value: Value, seen = new WeakMap<object, object>()): Value {
  if (value === null || typeof value !== "object") return value;
  const prototype = Object.getPrototypeOf(value);
  const isArray = Array.isArray(value);
  if (!isArray && prototype !== Object.prototype && prototype !== null) {
    return value;
  }
  const existing = seen.get(value);
  if (existing !== undefined) return existing as Value;

  const clone = isArray ? [] : Object.create(prototype);
  seen.set(value, clone);
  for (const key of Reflect.ownKeys(value)) {
    if (isArray && key === "length") continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined) continue;
    Object.defineProperty(
      clone,
      key,
      "value" in descriptor
        ? { ...descriptor, value: cloneProductValue(descriptor.value, seen) }
        : descriptor,
    );
  }
  if (isArray) {
    const lengthDescriptor = Object.getOwnPropertyDescriptor(value, "length");
    if (lengthDescriptor !== undefined) {
      Object.defineProperty(clone, "length", lengthDescriptor);
    }
  }
  return clone as Value;
}

function freezeRecursively<Value>(value: Value): Value {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) {
    freezeRecursively(child);
  }
  return Object.freeze(value);
}

function rejectValidationErrors(errors: readonly string[]): void {
  if (errors.length === 0) return;
  throw new Error(
    `Toolcraft product definition validation failed:\n- ${[...errors].sort().join("\n- ")}`,
  );
}

function validateProductBase(
  base: ToolcraftProductDefinition["base"],
  resolution: ResolvedToolcraftProductModules,
): void {
  rejectValidationErrors([
    ...getToolcraftProductBaseSemanticValidationErrors(base, resolution),
    ...getToolcraftStandardCapabilityOwnershipErrors(base, resolution),
  ]);
}

function composeControls(
  base: ToolcraftProductDefinition["base"],
  resolution: ResolvedToolcraftProductModules,
): ToolcraftControlsPanelSchema | undefined {
  const baseControls = base.panels.controls;
  if (baseControls === undefined) return undefined;
  const contributions = resolution.contributionResolution;
  return {
    ...cloneProductValue(baseControls),
    sections: [
      ...cloneProductValue(baseControls.sections),
      ...contributions.controlSections,
      ...(contributions.panelActionsSection === undefined
        ? []
        : [contributions.panelActionsSection]),
    ],
  };
}

function composePanels(
  base: ToolcraftProductDefinition["base"],
  resolution: ResolvedToolcraftProductModules,
): ToolcraftPanelsSchema {
  const contributions = resolution.contributionResolution;
  const controls = composeControls(base, resolution);
  return {
    ...(controls === undefined ? {} : { controls }),
    ...(contributions.layers ? { layers: true } : {}),
    ...(contributions.timeline === undefined
      ? {}
      : { timeline: cloneProductValue(contributions.timeline) }),
  };
}

function assertPersistenceRequirements(
  schema: ResolvedToolcraftAppSchema,
  resolution: ResolvedToolcraftProductModules,
): void {
  for (const slice of resolution.contributionResolution.persistenceRequirements) {
    const count =
      schema.persistence.storage === "localStorage"
        ? schema.persistence.include.filter((value) => value === slice).length
        : 0;
    if (count !== 1) {
      throw new Error(
        `Toolcraft product definition internal persistence error: required slice "${slice}" resolved ${count} times.`,
      );
    }
  }
}

export function resolveToolcraftProductDefinition(
  definition: ToolcraftProductDefinition,
): ResolvedToolcraftAppSchema {
  if (definition.authoredStateMigration !== undefined && typeof definition.authoredStateMigration !== "function") {
    throw new Error("authoredStateMigration must be a synchronous function.");
  }
  const declarations = Object.freeze([...definition.modules]);
  const resolution = resolveToolcraftProductModules(declarations, toolcraftCoreModuleCatalog);
  const base = cloneProductValue(definition.base);
  rejectValidationErrors(getToolcraftProductPlainDataValidationErrors(base));
  validateProductBase(base, resolution);

  const identity = resolveRequiredToolcraftAppIdentity(base.identity);
  const materializedSchema = {
    canvas: base.canvas,
    ...(base.media === undefined ? {} : { media: base.media }),
    panels: composePanels(base, resolution),
    ...(base.settingsTransfer === undefined
      ? {}
      : {
          settingsTransfer: base.settingsTransfer,
        }),
    ...(base.toolbar === undefined ? {} : { toolbar: base.toolbar }),
  };
  const schema: ResolvedToolcraftAppSchema = freezeRecursively({
    ...resolveToolcraftMaterializedSchema({
      identity,
      persistence: base.persistence,
      requiredPersistenceSlices: resolution.contributionResolution.persistenceRequirements,
      schema: materializedSchema,
    }),
    modulePlan: resolution.plan,
    ...(definition.authoredStateMigration ? { authoredStateMigration: definition.authoredStateMigration } : {}),
  });
  assertPersistenceRequirements(schema, resolution);

  return freezeRecursively(applyToolcraftAppDefaults(schema, definition.defaults));
}
