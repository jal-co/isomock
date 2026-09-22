import type { ToolcraftControlConditionSchema } from "@/toolcraft/runtime";

function isCanvasSizeTarget(target: string): boolean {
  return target === "canvas.size.width" || target === "canvas.size.height";
}

const conditionOperatorLabels = [
  "equals",
  "notEquals",
  "oneOf",
  "notOneOf",
  "greaterThan",
  "greaterThanOrEqual",
  "lessThan",
  "lessThanOrEqual",
] as const satisfies readonly (keyof ToolcraftControlConditionSchema)[];

function hasConditionOperator(condition: ToolcraftControlConditionSchema): boolean {
  return conditionOperatorLabels.some((operator) => operator in condition);
}

export function getConditionValidationErrors({
  condition,
  conditionName,
  controlTargets,
  label,
}: {
  condition: ToolcraftControlConditionSchema;
  conditionName: "disabledWhen";
  controlTargets: ReadonlySet<string>;
  label: string;
}): string[] {
  const errors: string[] = [];

  if (!hasConditionOperator(condition)) {
    errors.push(
      `${label} ${conditionName} must declare one of equals, notEquals, oneOf, notOneOf, greaterThan, greaterThanOrEqual, lessThan, or lessThanOrEqual so the dependent state is deterministic.`,
    );
  }

  for (const arrayOperator of ["oneOf", "notOneOf"] as const) {
    if (
      arrayOperator in condition &&
      (!Array.isArray(condition[arrayOperator]) ||
        condition[arrayOperator]?.length === 0)
    ) {
      errors.push(
        `${label} ${conditionName}.${arrayOperator} must be a non-empty array.`,
      );
    }
  }

  for (const numericOperator of [
    "greaterThan",
    "greaterThanOrEqual",
    "lessThan",
    "lessThanOrEqual",
  ] as const) {
    if (
      numericOperator in condition &&
      (typeof condition[numericOperator] !== "number" ||
        !Number.isFinite(condition[numericOperator]))
    ) {
      errors.push(
        `${label} ${conditionName}.${numericOperator} must be a finite number.`,
      );
    }
  }

  if (
    !controlTargets.has(condition.target) &&
    !isCanvasSizeTarget(condition.target)
  ) {
    errors.push(
      `${label} ${conditionName} target ${condition.target} does not match another schema control target or canvas size target.`,
    );
  }

  return errors;
}
