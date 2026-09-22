import { isToolcraftRuntimeOwnedTarget } from "../schema/runtime-targets";
import type { ResolvedToolcraftAppSchema } from "../schema/resolved-app-schema";
import type { ToolcraftEnvelopeValidationContext } from "./performance-envelope-validation-context";
import { collectToolcraftWorkloadControls } from "./performance-control-classification";
import {
  getSchemaBoundErrors,
  groupControlsByTarget,
} from "./performance-workload-envelope-schema-validation";
import {
  formatUnknownValue,
  getDimensionLabel,
  getEnvelopeDimensions,
  getNumericErrors,
  isNonNullObject,
  isSupportedMapping,
  isTrimmedNonEmptyString,
  type UnknownRecord,
} from "./performance-workload-envelope-shared";
import { getDerivedDependencyCycleErrors } from "./performance-workload-envelope-derived-validation";
import { getAllSchemaControls } from "./performance-schema-queries";
import type { ToolcraftEnvelopePerformanceConfig } from "./performance-types";

type RuntimeDimensionEntry = {
  dimension: UnknownRecord;
  index: number;
};

export function getToolcraftWorkloadEnvelopeErrors(
  schema: ResolvedToolcraftAppSchema,
  config: ToolcraftEnvelopePerformanceConfig,
): string[] {
  const envelope = getEnvelopeDimensions(config);
  if (!envelope.dimensions) {
    return [...envelope.errors];
  }

  const dimensions = envelope.dimensions;
  const errors: string[] = [];
  const schemaControlsByTarget = groupControlsByTarget(
    getAllSchemaControls(schema),
  );
  const workloadControls = collectToolcraftWorkloadControls(schema);
  const workloadControlsByTarget = groupControlsByTarget(
    workloadControls.map(({ control }) => control),
  );
  const dimensionEntries: RuntimeDimensionEntry[] = dimensions.flatMap(
    (dimension, index) =>
      isNonNullObject(dimension) ? [{ dimension, index }] : [],
  );
  const dimensionIdCounts = new Map<string, number>();

  for (const { dimension } of dimensionEntries) {
    if (isTrimmedNonEmptyString(dimension.id)) {
      dimensionIdCounts.set(
        dimension.id,
        (dimensionIdCounts.get(dimension.id) ?? 0) + 1,
      );
    }
  }

  const knownDimensionIds = new Set(dimensionIdCounts.keys());
  const seenDimensionIds = new Set<string>();
  const schemaTargetCounts = new Map<string, number>();

  for (const [index, rawDimension] of dimensions.entries()) {
    if (!isNonNullObject(rawDimension)) {
      errors.push(
        `workloadEnvelope.dimensions[${index}] must be a non-null object.`,
      );
      continue;
    }

    const dimension = rawDimension;
    const label = getDimensionLabel(dimension, index);

    if (!isTrimmedNonEmptyString(dimension.id)) {
      errors.push(
        `workloadEnvelope.dimensions[${index}].id must be trimmed and non-empty.`,
      );
    } else if (seenDimensionIds.has(dimension.id)) {
      errors.push(`Workload dimension id "${dimension.id}" must be unique.`);
    } else {
      seenDimensionIds.add(dimension.id);
    }

    if (!isTrimmedNonEmptyString(dimension.unit)) {
      errors.push(`${label} unit must be trimmed and non-empty.`);
    }

    errors.push(...getNumericErrors(dimension, label));

    if (!isSupportedMapping(dimension.mapping)) {
      errors.push(
        `${label} mapping "${formatUnknownValue(dimension.mapping)}" is not supported.`,
      );
    } else if (
      dimension.mapping === "custom" &&
      (typeof dimension.customMappingReason !== "string" ||
        !dimension.customMappingReason.trim())
    ) {
      errors.push(
        `${label} with custom mapping must provide a non-empty customMappingReason.`,
      );
    }

    const source = dimension.source;
    if (!isNonNullObject(source)) {
      errors.push(`${label} source must be a non-null object.`);
      continue;
    }

    switch (source.kind) {
      case "runtime-state":
        if (!isTrimmedNonEmptyString(source.path)) {
          errors.push(
            `${label} runtime-state path must be trimmed and non-empty.`,
          );
        }
        break;
      case "external-input":
        if (!isTrimmedNonEmptyString(source.id)) {
          errors.push(
            `${label} external-input id must be trimmed and non-empty.`,
          );
        }
        break;
      case "derived": {
        if (!Array.isArray(source.inputs)) {
          errors.push(`${label} derived inputs must be an array.`);
          break;
        }

        if (source.inputs.length === 0) {
          errors.push(`${label} derived inputs must not be empty.`);
        }

        for (const [inputIndex, input] of source.inputs.entries()) {
          if (!isTrimmedNonEmptyString(input)) {
            errors.push(
              `${label} derived input at index ${inputIndex} must be trimmed and non-empty.`,
            );
          } else if (input === dimension.id) {
            errors.push(`${label} cannot reference itself as a derived input.`);
          } else if (!knownDimensionIds.has(input)) {
            errors.push(
              `${label} references unknown derived input "${input}".`,
            );
          }
        }
        break;
      }
      case "schema-target": {
        const target = source.target;

        if (!isTrimmedNonEmptyString(target)) {
          errors.push(
            `${label} schema-target target must be trimmed and non-empty.`,
          );
          break;
        }

        if (isToolcraftRuntimeOwnedTarget(target)) {
          errors.push(`${label} schema target "${target}" is runtime-owned.`);
          break;
        }

        const targetCount = (schemaTargetCounts.get(target) ?? 0) + 1;
        schemaTargetCounts.set(target, targetCount);
        if (targetCount === 2) {
          errors.push(
            `Schema target "${target}" must not map to more than one workloadEnvelope dimension.`,
          );
        }

        const schemaControls = schemaControlsByTarget.get(target) ?? [];
        if (schemaControls.length === 0) {
          errors.push(`${label} references unknown schema target "${target}".`);
          break;
        }

        const explicitWorkloadControls =
          workloadControlsByTarget.get(target) ?? [];
        if (explicitWorkloadControls.length !== 1) {
          errors.push(
            `${label} schema target "${target}" must reference exactly one explicit workload control.`,
          );
          break;
        }

        errors.push(
          ...getSchemaBoundErrors(
            dimension,
            label,
            target,
            explicitWorkloadControls[0]!,
            source.workloadBoundary,
          ),
        );
        break;
      }
      default:
        errors.push(
          `${label} source kind "${formatUnknownValue(source.kind)}" is not supported.`,
        );
    }
  }

  errors.push(
    ...getDerivedDependencyCycleErrors(
      dimensionEntries.map(({ dimension }) => dimension),
      dimensionIdCounts,
    ),
  );

  const checkedWorkloadTargets = new Set<string>();
  for (const { target } of workloadControls) {
    if (checkedWorkloadTargets.has(target)) {
      continue;
    }
    checkedWorkloadTargets.add(target);

    if ((schemaTargetCounts.get(target) ?? 0) !== 1) {
      errors.push(
        `Workload control ${target} must map to exactly one workloadEnvelope dimension.`,
      );
    }
  }

  return errors;
}

export function getToolcraftWorkloadEnvelopeErrorsForContext(
  context: ToolcraftEnvelopeValidationContext,
): string[] {
  return getToolcraftWorkloadEnvelopeErrors(context.schema, context.config);
}
