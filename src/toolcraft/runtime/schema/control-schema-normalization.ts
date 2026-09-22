import { assertToolcraftEditableSliderRange } from "./slider-range";
import { isToolcraftRuntimeOwnedTarget } from "./runtime-targets";
import { getToolcraftSegmentedStaticFitError } from "../contracts/segmented-control-fit";
import type { DistributiveOmit } from "./control-schema-common";
import { isToolcraftBuiltInControlSchema } from "./control-schema";
import { normalizeToolcraftModelFileDrop } from "../model-import/model-import-limits";
import { isToolcraftCollectionItemControlType } from "./collection-item-controls";
import {
  assertToolcraftCollectionItemKeyframe,
  assertToolcraftProductTargetNamespace,
} from "./collection-actions";
import { resolveToolcraftControlApplicability } from "./control-applicability";
import {
  getToolcraftSliderStepPositionCount,
  getToolcraftVisualDiscreteSliderMarkerIssue,
} from "./slider-marker-policy";
import type {
  ResolvedToolcraftControlSchema,
  ToolcraftCollectionItemControlSchema,
  ToolcraftControlSchema,
  ToolcraftModelFileDropSchema,
  ToolcraftNonModelControlSchema,
  ToolcraftResolvedControlApplicabilitySchema,
} from "./types";

type ControlWithResolvedApplicability =
  | (DistributiveOmit<
      ToolcraftNonModelControlSchema,
      "applicability" | "visibleWhen"
    > & {
      applicability: ToolcraftResolvedControlApplicabilitySchema;
    })
  | (Omit<ToolcraftModelFileDropSchema, "applicability" | "visibleWhen"> & {
      applicability: ToolcraftResolvedControlApplicabilitySchema;
    });

const modelOnlyControlFieldNames = [
  "modelFormats",
  "modelLimits",
  "topologyProfile",
] as const;

function assertRequiredControlStringField(
  control: ToolcraftControlSchema,
  fieldName: "target" | "type",
): void {
  const fieldValue: unknown = control[fieldName];

  if (
    !Object.prototype.propertyIsEnumerable.call(control, fieldName) ||
    typeof fieldValue !== "string" ||
    fieldValue.trim().length === 0
  ) {
    throw new Error(
      `Toolcraft control validation [control-${fieldName}]: ${fieldName} must be an own enumerable string with non-empty trimmed content.`,
    );
  }
}

function assertControlRuntimeBoundary(control: ToolcraftControlSchema): void {
  const assetKind: unknown = control.assetKind;
  const controlType: unknown = control.type;

  if (assetKind === "model" && controlType !== "fileDrop") {
    throw new Error(
      'Toolcraft control validation [model-filedrop-type]: assetKind "model" requires type "fileDrop".',
    );
  }

  if (
    controlType === "fileDrop" &&
    assetKind !== undefined &&
    assetKind !== "image" &&
    assetKind !== "file" &&
    assetKind !== "model"
  ) {
    throw new Error(
      'Toolcraft fileDrop validation [filedrop-asset-kind]: assetKind must be omitted, "image", "file", or "model".',
    );
  }

  if (assetKind === "model") {
    return;
  }

  for (const fieldName of modelOnlyControlFieldNames) {
    if (Object.prototype.hasOwnProperty.call(control, fieldName)) {
      throw new Error(
        `Toolcraft control validation [model-only-field]: non-model controls cannot supply ${fieldName}.`,
      );
    }
  }
}

function assertFileDropHardMaxItems(control: ToolcraftControlSchema): void {
  if (
    control.type !== "fileDrop" ||
    !Object.prototype.hasOwnProperty.call(control, "hardMaxItems")
  ) {
    return;
  }

  if (
    typeof control.hardMaxItems !== "number" ||
    !Number.isSafeInteger(control.hardMaxItems) ||
    control.hardMaxItems < 0
  ) {
    throw new Error(
      "Toolcraft control validation [control-hard-max-items]: fileDrop hardMaxItems must be a finite nonnegative safe integer.",
    );
  }
}

function assertFileDropVariant(control: ToolcraftControlSchema): void {
  if (control.type !== "fileDrop" || control.variant !== "collection-actions") {
    return;
  }

  if (control.assetKind !== "file" || control.multiple !== true) {
    throw new Error(
      'Toolcraft fileDrop validation [filedrop-collection-actions]: variant "collection-actions" requires assetKind: "file" with multiple: true.',
    );
  }
}

type ItemControlsOwner = Readonly<{
  minimumFields: number;
  name: "collectionActions" | "fileDrop";
}>;

function getItemControlsOwner(
  control: ToolcraftControlSchema,
): ItemControlsOwner | null {
  if (control.type === "collectionActions") {
    return { minimumFields: 2, name: "collectionActions" };
  }

  if (
    control.type === "fileDrop" &&
    control.variant === "collection-actions" &&
    control.assetKind === "file" &&
    control.multiple === true
  ) {
    return { minimumFields: 1, name: "fileDrop" };
  }

  return null;
}

function isPlainRecord(value: unknown): boolean {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertItemControls(control: ToolcraftControlSchema): void {
  const target = control.target;
  if (!control.itemControls) {
    return;
  }

  const owner = getItemControlsOwner(control);

  if (!owner) {
    throw new Error(
      `Toolcraft control validation [collection-item-controls] for target "${control.target}": itemControls require collectionActions or a multiple file-kind collection-actions fileDrop.`,
    );
  }

  if (control.itemControl) {
    throw new Error(
      `Toolcraft control validation [collection-item-template] for target "${target}": itemControl and itemControls are mutually exclusive.`,
    );
  }

  if (Object.prototype.hasOwnProperty.call(control, "itemDefaultValue")) {
    throw new Error(
      `Toolcraft control validation [collection-item-default] for target "${control.target}": itemDefaultValue cannot be used with itemControls; field defaults own the new record.`,
    );
  }

  const entries = Object.entries(control.itemControls);
  if (entries.length < owner.minimumFields) {
    throw new Error(
      `Toolcraft control validation [collection-item-controls] for target "${control.target}": ${owner.name} itemControls require at least ${owner.minimumFields === 1 ? "one" : "two"} built-in field${owner.minimumFields === 1 ? "" : "s"}.`,
    );
  }

  for (const [id, itemControl] of entries) {
    if (!id.trim() || !isToolcraftCollectionItemControlType(itemControl.type)) {
      throw new Error(
        `Toolcraft control validation [collection-item-controls] for target "${control.target}" itemControls.${id}: unsupported built-in field.`,
      );
    }
    if (!Object.prototype.hasOwnProperty.call(itemControl, "defaultValue")) {
      throw new Error(
        `Toolcraft control validation [collection-item-controls] for target "${control.target}" itemControls.${id}: defaultValue is required.`,
      );
    }
    assertToolcraftCollectionItemKeyframe(control, id, itemControl);

    const fitError = getToolcraftSegmentedStaticFitError(itemControl);
    if (fitError) {
      throw new Error(
        `Toolcraft control validation [segmented-control-fit] for target "${control.target}" itemControls.${id}: ${fitError}`,
      );
    }
  }

  if (
    owner.name === "collectionActions" &&
    Array.isArray(control.defaultValue) &&
    control.defaultValue.some((item) => !isPlainRecord(item))
  ) {
    throw new Error(
      `Toolcraft control validation [collection-item-value] for target "${control.target}": every initial compound item must be a plain record.`,
    );
  }
}

function assertSegmentedControlFit(control: ToolcraftControlSchema): void {
  const fitError = getToolcraftSegmentedStaticFitError(control);

  if (fitError) {
    throw new Error(
      `Toolcraft control validation [segmented-control-fit] for target "${control.target}": ${fitError}`,
    );
  }
}

function assertCollectionItemControl(control: ToolcraftControlSchema): void {
  if (
    control.type !== "collectionActions" &&
    control.type !== "sourceCollection"
  ) {
    return;
  }

  if (!control.itemControl) {
    if (control.type === "sourceCollection") {
      throw new Error(
        `Toolcraft control validation [source-collection-item-control] for target "${control.target}": itemControl is required.`,
      );
    }
    return;
  }

  if (!isToolcraftCollectionItemControlType(control.itemControl.type)) {
    throw new Error(
      `Toolcraft control validation [collection-item-control] for target "${control.target}": unsupported collection item control "${String(control.itemControl.type)}".`,
    );
  }

  const fitError = getToolcraftSegmentedStaticFitError(control.itemControl);

  if (fitError) {
    throw new Error(
      `Toolcraft control validation [segmented-control-fit] for target "${control.target}" itemControl: ${fitError}`,
    );
  }
}

type SliderNormalizableControl =
  | ControlWithResolvedApplicability
  | ToolcraftCollectionItemControlSchema
  | ToolcraftControlSchema;

function normalizeSliderControlSchema<T extends SliderNormalizableControl>(
  control: T,
  location: string,
  owner: "product" | "collection",
): T {
  assertToolcraftEditableSliderRange(control, location);
  if (control.editableRange && (owner === "collection" || !("target" in control) || typeof control.target !== "string" || isToolcraftRuntimeOwnedTarget(control.target))) {
    throw new Error(`Toolcraft editableRange ${location}: requires a top-level product slider target.`);
  }
  const issue = getToolcraftVisualDiscreteSliderMarkerIssue(control);

  if (issue?.kind === "domain") {
    throw new Error(
      `Toolcraft control validation [slider-marker-domain] ${location}: variant "discrete" requires finite min and max plus a finite positive step with max greater than min.`,
    );
  }

  if (issue?.kind === "budget") {
    throw new Error(
      `Toolcraft control validation [slider-marker-budget] ${location}: variant "discrete" has ${issue.positionCount} positions; maximum is ${issue.limit}. Keep sliderValueKind "discrete" and step, but use variant "continuous" or another built-in control.`,
    );
  }

  if (
    (control.type !== "slider" && control.type !== "rangeSlider") ||
    control.variant !== "discrete"
  ) {
    return control;
  }

  return {
    ...control,
    markerCount: getToolcraftSliderStepPositionCount(control),
    variant: "discrete",
  };
}

function snapshotOwnedCollectionControls<T extends ToolcraftControlSchema>(
  control: T,
): T {
  const ownsItemControl =
    control.type === "collectionActions" || control.type === "sourceCollection";
  const ownsItemControls = getItemControlsOwner(control) !== null;
  const itemControlSnapshot = ownsItemControl
    ? control.itemControl
      ? { ...control.itemControl }
      : undefined
    : undefined;
  const itemControlsSnapshot =
    ownsItemControls && control.itemControls
      ? Object.fromEntries(
          Object.entries(control.itemControls).map(([id, field]) => [
            id,
            { ...field },
          ]),
        )
      : undefined;

  return {
    ...control,
    ...(control.editableRange ? { editableRange: { ...control.editableRange } } : {}),
    ...(itemControlSnapshot ? { itemControl: itemControlSnapshot } : {}),
    ...(itemControlsSnapshot ? { itemControls: itemControlsSnapshot } : {}),
  };
}

function normalizeCollectionSliderControls<T extends ToolcraftControlSchema>(
  control: T,
): T {
  const ownsItemControl =
    control.type === "collectionActions" || control.type === "sourceCollection";
  const ownsItemControls = getItemControlsOwner(control) !== null;
  const itemControl =
    ownsItemControl && control.itemControl
      ? normalizeSliderControlSchema(
          control.itemControl,
          `for target "${control.target}" itemControl`,
          "collection",
        )
      : undefined;
  const itemControls =
    ownsItemControls && control.itemControls
      ? Object.fromEntries(
          Object.entries(control.itemControls).map(([id, field]) => [
            id,
            normalizeSliderControlSchema(
              field,
              `for target "${control.target}" itemControls.${id}`,
              "collection",
            ),
          ]),
        )
      : undefined;

  return {
    ...control,
    ...(itemControl ? { itemControl } : {}),
    ...(itemControls ? { itemControls } : {}),
  };
}

function normalizeFileDropControlSchema(
  control: ControlWithResolvedApplicability,
): ResolvedToolcraftControlSchema {
  if (control.assetKind === "model") {
    return normalizeToolcraftModelFileDrop(control);
  }

  if (
    !isToolcraftBuiltInControlSchema(control) ||
    control.type !== "fileDrop"
  ) {
    return control;
  }

  return control.assetKind === undefined
    ? { ...control, assetKind: "image" }
    : control;
}

function normalizeControlSchema(
  control: ToolcraftControlSchema,
): ResolvedToolcraftControlSchema {
  const controlSnapshot: ToolcraftControlSchema = { ...control };

  assertRequiredControlStringField(controlSnapshot, "type");
  assertRequiredControlStringField(controlSnapshot, "target");
  assertToolcraftProductTargetNamespace(
    controlSnapshot.target,
    `control target "${controlSnapshot.target}"`,
  );
  assertControlRuntimeBoundary(controlSnapshot);
  assertFileDropHardMaxItems(controlSnapshot);
  assertFileDropVariant(controlSnapshot);

  const nestedControlSnapshot =
    snapshotOwnedCollectionControls(controlSnapshot);
  assertItemControls(nestedControlSnapshot);
  assertSegmentedControlFit(nestedControlSnapshot);
  assertCollectionItemControl(nestedControlSnapshot);
  const normalizedControlSnapshot = normalizeCollectionSliderControls(
    nestedControlSnapshot,
  );
  const {
    applicability: authoredApplicability,
    visibleWhen,
    ...controlWithoutApplicability
  } = normalizedControlSnapshot;
  const applicability = resolveToolcraftControlApplicability({
    applicability: authoredApplicability,
    ...(visibleWhen === undefined ? {} : { visibleWhen }),
  });

  return normalizeFileDropControlSchema(
    normalizeSliderControlSchema(
      {
        ...controlWithoutApplicability,
        applicability,
      },
      `for target "${controlSnapshot.target}"`,
      "product",
    ),
  );
}

export function createNormalizedControlsRecord(
  entries: readonly [string, ToolcraftControlSchema][],
): Record<string, ResolvedToolcraftControlSchema> {
  return Object.fromEntries(
    entries.map(([id, control]) => [id, normalizeControlSchema(control)]),
  );
}
