import type {
  ToolcraftControlPredicateSchema,
  ToolcraftResolvedControlApplicabilitySchema,
} from "./types";

export type ToolcraftControlApplicabilityNormalizationSchema =
  | Readonly<{
      mode: "always";
      origin?: "explicit";
    }>
  | Readonly<{
      all: readonly ToolcraftControlPredicateSchema[];
      mode: "conditional";
      origin?: "explicit";
    }>;

export type ToolcraftControlApplicabilityNormalizationInput = Readonly<{
  applicability: ToolcraftControlApplicabilityNormalizationSchema;
  visibleWhen?: never;
}>;

const numericOperatorNames = [
  "greaterThan",
  "greaterThanOrEqual",
  "lessThan",
  "lessThanOrEqual",
] as const;

const valueOperatorNames = [
  "equals",
  "notEquals",
  "oneOf",
  "notOneOf",
] as const;

function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

export function areToolcraftValuesEqual(
  left: unknown,
  right: unknown,
): boolean {
  if (Object.is(left, right)) {
    return true;
  }

  if (
    (typeof left !== "object" || left === null) &&
    (typeof right !== "object" || right === null)
  ) {
    return false;
  }

  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

function readComparableNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const numberValue = Number(value.trim());

    return Number.isFinite(numberValue) ? numberValue : null;
  }

  return null;
}

function assertPredicate(
  predicate: ToolcraftControlPredicateSchema,
  index: number,
): void {
  if (
    !predicate ||
    typeof predicate !== "object" ||
    typeof predicate.target !== "string" ||
    predicate.target.trim().length === 0
  ) {
    throw new Error(
      `Toolcraft control applicability predicate ${index} requires a non-empty target.`,
    );
  }

  const hasValueOperator = valueOperatorNames.some((operator) =>
    hasOwn(predicate, operator),
  );
  const hasNumericOperator = numericOperatorNames.some((operator) =>
    hasOwn(predicate, operator),
  );

  if (!hasValueOperator && !hasNumericOperator) {
    throw new Error(
      `Toolcraft control applicability predicate ${index} requires at least one operator.`,
    );
  }

  for (const operator of ["oneOf", "notOneOf"] as const) {
    if (
      hasOwn(predicate, operator) &&
      (!Array.isArray(predicate[operator]) || predicate[operator].length === 0)
    ) {
      throw new Error(
        `Toolcraft control applicability predicate ${index} ${operator} requires at least one value.`,
      );
    }
  }

  for (const operator of numericOperatorNames) {
    if (
      hasOwn(predicate, operator) &&
      (typeof predicate[operator] !== "number" ||
        !Number.isFinite(predicate[operator]))
    ) {
      throw new Error(
        `Toolcraft control applicability predicate ${index} ${operator} requires a finite number.`,
      );
    }
  }
}

function clonePredicate(
  predicate: ToolcraftControlPredicateSchema,
): ToolcraftControlPredicateSchema {
  return {
    ...predicate,
    ...(predicate.oneOf ? { oneOf: [...predicate.oneOf] } : {}),
    ...(predicate.notOneOf ? { notOneOf: [...predicate.notOneOf] } : {}),
  };
}

export function resolveToolcraftControlApplicability(
  input: ToolcraftControlApplicabilityNormalizationInput,
): ToolcraftResolvedControlApplicabilitySchema {
  if (Object.prototype.hasOwnProperty.call(input, "visibleWhen")) {
    throw new Error(
      "Toolcraft control-level visibleWhen is not supported; declare explicit applicability.",
    );
  }
  const applicability = input.applicability;

  if (!applicability) {
    throw new Error("Toolcraft controls require explicit applicability.");
  }

  if (applicability.mode === "always") {
    if (
      applicability.origin !== undefined &&
      applicability.origin !== "explicit"
    ) {
      throw new Error(
        `Toolcraft control applicability has invalid resolved applicability origin "${String(applicability.origin)}" for mode "always".`,
      );
    }
    return { mode: "always", origin: "explicit" };
  }

  if (!Array.isArray(applicability.all) || applicability.all.length === 0) {
    throw new Error(
      "Toolcraft conditional applicability requires at least one predicate.",
    );
  }

  if (
    applicability.origin !== undefined &&
    applicability.origin !== "explicit"
  ) {
    throw new Error(
      `Toolcraft control applicability has invalid resolved applicability origin "${String(applicability.origin)}" for mode "conditional".`,
    );
  }

  const all = applicability.all.map((predicate, index) => {
    assertPredicate(predicate, index);
    return clonePredicate(predicate);
  });

  return { all, mode: "conditional", origin: "explicit" };
}

export function doesToolcraftPredicateMatchValue(
  predicate: ToolcraftControlPredicateSchema,
  value: unknown,
): boolean {
  const matches: boolean[] = [];

  if (hasOwn(predicate, "equals")) {
    matches.push(areToolcraftValuesEqual(value, predicate.equals));
  }
  if (hasOwn(predicate, "notEquals")) {
    matches.push(!areToolcraftValuesEqual(value, predicate.notEquals));
  }
  if (Array.isArray(predicate.oneOf)) {
    matches.push(
      predicate.oneOf.some((candidate) =>
        areToolcraftValuesEqual(value, candidate),
      ),
    );
  }
  if (Array.isArray(predicate.notOneOf)) {
    matches.push(
      !predicate.notOneOf.some((candidate) =>
        areToolcraftValuesEqual(value, candidate),
      ),
    );
  }

  const numberValue = readComparableNumber(value);

  for (const [expected, compare] of [
    [predicate.greaterThan, (left: number, right: number) => left > right],
    [
      predicate.greaterThanOrEqual,
      (left: number, right: number) => left >= right,
    ],
    [predicate.lessThan, (left: number, right: number) => left < right],
    [predicate.lessThanOrEqual, (left: number, right: number) => left <= right],
  ] as const) {
    if (typeof expected === "number" && Number.isFinite(expected)) {
      matches.push(numberValue !== null && compare(numberValue, expected));
    }
  }

  return matches.length > 0 && matches.every(Boolean);
}

export function doesToolcraftApplicabilityMatch(
  applicability: ToolcraftResolvedControlApplicabilitySchema,
  readTarget: (target: string) => unknown,
): boolean {
  return (
    applicability.mode === "always" ||
    applicability.all.every((predicate) =>
      doesToolcraftPredicateMatchValue(predicate, readTarget(predicate.target)),
    )
  );
}

export function getToolcraftApplicabilityPredicates(
  applicability: ToolcraftResolvedControlApplicabilitySchema,
): readonly ToolcraftControlPredicateSchema[] {
  return applicability.mode === "conditional" ? applicability.all : [];
}

export function getToolcraftApplicabilityTargets(
  applicability: ToolcraftResolvedControlApplicabilitySchema,
): string[] {
  return [
    ...new Set(
      getToolcraftApplicabilityPredicates(applicability).map(
        (predicate) => predicate.target,
      ),
    ),
  ];
}

function getFinitePredicateValues(
  predicate: ToolcraftControlPredicateSchema,
): readonly unknown[] | null {
  const candidates = hasOwn(predicate, "equals")
    ? [predicate.equals]
    : predicate.oneOf
      ? [...predicate.oneOf]
      : null;

  return (
    candidates?.filter((value) =>
      doesToolcraftPredicateMatchValue(predicate, value),
    ) ?? null
  );
}

type NumericBoundary = Readonly<{
  inclusive: boolean;
  value: number;
}>;

type NumericInterval = Readonly<{
  lower: NumericBoundary | null;
  upper: NumericBoundary | null;
}>;

function stricterLowerBoundary(
  current: NumericBoundary | null,
  candidate: NumericBoundary,
): NumericBoundary {
  if (
    !current ||
    candidate.value > current.value ||
    (candidate.value === current.value && !candidate.inclusive)
  ) {
    return candidate;
  }

  return current;
}

function stricterUpperBoundary(
  current: NumericBoundary | null,
  candidate: NumericBoundary,
): NumericBoundary {
  if (
    !current ||
    candidate.value < current.value ||
    (candidate.value === current.value && !candidate.inclusive)
  ) {
    return candidate;
  }

  return current;
}

function getNumericInterval(
  predicate: ToolcraftControlPredicateSchema,
): NumericInterval | null {
  let lower: NumericBoundary | null = null;
  let upper: NumericBoundary | null = null;

  if (predicate.greaterThan !== undefined) {
    lower = stricterLowerBoundary(lower, {
      inclusive: false,
      value: predicate.greaterThan,
    });
  }
  if (predicate.greaterThanOrEqual !== undefined) {
    lower = stricterLowerBoundary(lower, {
      inclusive: true,
      value: predicate.greaterThanOrEqual,
    });
  }
  if (predicate.lessThan !== undefined) {
    upper = stricterUpperBoundary(upper, {
      inclusive: false,
      value: predicate.lessThan,
    });
  }
  if (predicate.lessThanOrEqual !== undefined) {
    upper = stricterUpperBoundary(upper, {
      inclusive: true,
      value: predicate.lessThanOrEqual,
    });
  }

  return lower || upper ? { lower, upper } : null;
}

function intervalEndsBefore(
  upper: NumericBoundary | null,
  lower: NumericBoundary | null,
): boolean {
  if (!upper || !lower) {
    return false;
  }

  return (
    upper.value < lower.value ||
    (upper.value === lower.value && (!upper.inclusive || !lower.inclusive))
  );
}

export function areToolcraftPredicatesProvablyExclusive(
  left: ToolcraftControlPredicateSchema,
  right: ToolcraftControlPredicateSchema,
): boolean {
  if (left.target !== right.target) {
    return false;
  }

  const leftValues = getFinitePredicateValues(left);
  if (
    leftValues &&
    leftValues.every((value) => !doesToolcraftPredicateMatchValue(right, value))
  ) {
    return true;
  }

  const rightValues = getFinitePredicateValues(right);
  if (
    rightValues &&
    rightValues.every((value) => !doesToolcraftPredicateMatchValue(left, value))
  ) {
    return true;
  }

  const leftInterval = getNumericInterval(left);
  const rightInterval = getNumericInterval(right);

  return Boolean(
    leftInterval &&
    rightInterval &&
    (intervalEndsBefore(leftInterval.upper, rightInterval.lower) ||
      intervalEndsBefore(rightInterval.upper, leftInterval.lower)),
  );
}

export function areToolcraftPredicateSetsProvablyExclusive(
  left: readonly ToolcraftControlPredicateSchema[],
  right: readonly ToolcraftControlPredicateSchema[],
): boolean {
  return left.some((leftPredicate) =>
    right.some((rightPredicate) =>
      areToolcraftPredicatesProvablyExclusive(leftPredicate, rightPredicate),
    ),
  );
}
