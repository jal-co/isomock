import type { ToolcraftControlSchema } from "../schema/types";
import {
  isFiniteNumber,
  type UnknownRecord,
} from "./performance-workload-envelope-shared";

type EffectiveNumericControlBounds = {
  defaultValue?: number;
  defaultValueOutsideRange: boolean;
  invalidDefaultValue: boolean;
  invalidMaximum: boolean;
  invalidMinimum: boolean;
  invalidRange: boolean;
  maximum?: number;
  minimum?: number;
};

type ResolvedNumericControlField = {
  invalid: boolean;
  value?: number;
};

function resolveNumericControlField(
  value: unknown,
  fallback: number,
): ResolvedNumericControlField {
  if (value === undefined || value === null) {
    return { invalid: false, value: fallback };
  }

  if (isFiniteNumber(value)) {
    return { invalid: false, value };
  }

  return { invalid: true };
}

function getEffectiveNumericControlBounds(
  control: ToolcraftControlSchema,
): EffectiveNumericControlBounds | null {
  const isBuiltInNumeric =
    control.type === "slider" || control.type === "rangeSlider";
  const hasDeclaredMinimum = Object.prototype.hasOwnProperty.call(control, "min");
  const hasDeclaredMaximum = Object.prototype.hasOwnProperty.call(control, "max");
  if (!isBuiltInNumeric && !hasDeclaredMinimum && !hasDeclaredMaximum) return null;

  const minimum = control.editableRange
    ? { invalid: !isFiniteNumber(control.editableRange.hardMin), value: control.editableRange.hardMin }
    : isBuiltInNumeric
    ? resolveNumericControlField(control.min, 0)
    : {
        invalid: !isFiniteNumber(control.min),
        value: isFiniteNumber(control.min) ? control.min : undefined,
      };
  const maximum = control.editableRange
    ? { invalid: !isFiniteNumber(control.editableRange.hardMax), value: control.editableRange.hardMax }
    : isBuiltInNumeric
    ? resolveNumericControlField(control.max, 100)
    : {
        invalid: !isFiniteNumber(control.max),
        value: isFiniteNumber(control.max) ? control.max : undefined,
      };
  const invalidRange =
    minimum.value !== undefined &&
    maximum.value !== undefined &&
    minimum.value > maximum.value;

  if (control.type === "rangeSlider") {
    return {
      defaultValueOutsideRange: false,
      invalidDefaultValue: false,
      invalidMaximum: maximum.invalid,
      invalidMinimum: minimum.invalid,
      invalidRange,
      maximum: maximum.value,
      minimum: minimum.value,
    };
  }

  const declaredDefaultValue = control.defaultValue;
  const hasInvalidDefaultValue =
    isBuiltInNumeric
      ? declaredDefaultValue !== undefined &&
        declaredDefaultValue !== null &&
        !isFiniteNumber(declaredDefaultValue)
      : !isFiniteNumber(declaredDefaultValue);
  const defaultValue = isFiniteNumber(declaredDefaultValue)
    ? declaredDefaultValue
    : isBuiltInNumeric
      ? minimum.value
      : undefined;
  const defaultValueOutsideRange =
    defaultValue !== undefined &&
    minimum.value !== undefined &&
    maximum.value !== undefined &&
    (defaultValue < minimum.value || defaultValue > maximum.value);

  return {
    defaultValue,
    defaultValueOutsideRange,
    invalidDefaultValue: hasInvalidDefaultValue,
    invalidMaximum: maximum.invalid,
    invalidMinimum: minimum.invalid,
    invalidRange,
    maximum: maximum.value,
    minimum: minimum.value,
  };
}

export function groupControlsByTarget(
  controls: readonly ToolcraftControlSchema[],
): ReadonlyMap<string, readonly ToolcraftControlSchema[]> {
  const controlsByTarget = new Map<string, ToolcraftControlSchema[]>();

  for (const control of controls) {
    const targetControls = controlsByTarget.get(control.target) ?? [];
    targetControls.push(control);
    controlsByTarget.set(control.target, targetControls);
  }

  return controlsByTarget;
}

export function getSchemaBoundErrors(
  dimension: UnknownRecord,
  label: string,
  target: string,
  control: ToolcraftControlSchema,
  workloadBoundary: unknown,
): string[] {
  const errors: string[] = [];
  const effectiveBounds = getEffectiveNumericControlBounds(control);

  if (effectiveBounds) {
    if (effectiveBounds.invalidDefaultValue) {
      errors.push(`Schema target "${target}" defaultValue must be a finite number.`);
    }

    if (
      effectiveBounds.defaultValue !== undefined &&
      isFiniteNumber(dimension.defaultValue) &&
      dimension.defaultValue !== effectiveBounds.defaultValue
    ) {
      errors.push(
        `${label} defaultValue must match schema target "${target}" defaultValue ${effectiveBounds.defaultValue}.`,
      );
    }

    if (effectiveBounds.invalidMinimum) {
      errors.push(`Schema target "${target}" minimum must be a finite number.`);
    }

    if (effectiveBounds.invalidMaximum) {
      errors.push(`Schema target "${target}" maximum must be a finite number.`);
    }

    if (effectiveBounds.invalidRange) {
      errors.push(
        `Schema target "${target}" minimum must not exceed its maximum.`,
      );
    }

    if (effectiveBounds.defaultValueOutsideRange) {
      errors.push(
        `Schema target "${target}" defaultValue must be within its numeric domain.`,
      );
    }

    if (workloadBoundary !== "minimum" && workloadBoundary !== "maximum") {
      errors.push(
        `${label} source.workloadBoundary must be "minimum" or "maximum" for numeric schema target "${target}".`,
      );
      return errors;
    }

    const boundaryIsInvalid =
      workloadBoundary === "minimum"
        ? effectiveBounds.invalidMinimum
        : effectiveBounds.invalidMaximum;
    const boundaryValue =
      workloadBoundary === "minimum"
        ? effectiveBounds.minimum
        : effectiveBounds.maximum;
    if (!boundaryIsInvalid && boundaryValue !== undefined) {
      for (const boundaryField of ["interactiveMax", "batchMax"] as const) {
        const declaredValue = dimension[boundaryField];
        if (isFiniteNumber(declaredValue) && declaredValue !== boundaryValue) {
          errors.push(
            `${label} ${boundaryField} must match schema target "${target}" ${workloadBoundary} ${boundaryValue} selected by source.workloadBoundary.`,
          );
        }
      }
    }

    return errors;
  }

  if (workloadBoundary !== undefined) {
    errors.push(
      `${label} source.workloadBoundary must be omitted for non-numeric schema target "${target}".`,
    );
  }

  return errors;
}
