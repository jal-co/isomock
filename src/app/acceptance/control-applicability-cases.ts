import {
  doesToolcraftApplicabilityMatch,
  doesToolcraftPredicateMatchValue,
  getToolcraftApplicabilityPredicates,
  isToolcraftBuiltInControlType,
  type ResolvedToolcraftAppSchema,
  type ResolvedToolcraftControlSchema,
  type ToolcraftControlPredicateSchema,
} from "@/toolcraft/runtime";

import { getToolcraftApplicabilitySelectorDomain } from "./control-applicability";
import { createToolcraftControlSelectorCaseDependencyIndex } from "./control-selector-inventory";
import { isToolcraftVisibleAcceptanceControl } from "./controls";
import type { ToolcraftControlSectionInventoryEntry } from "./types";

export type ToolcraftControlApplicabilityCase = Readonly<{
  expectation: "hidden" | "visible";
  selectorControlType:
    | "checkbox"
    | "imagePicker"
    | "segmented"
    | "select"
    | "slider"
    | "switch"
    | "tabs";
  selectorLabel: string;
  selectorOptionLabel?: string;
  selectorTarget: string;
  selectorValue: boolean | number | string;
  target: string;
}>;

type IndexedControl = Readonly<{
  control: ResolvedToolcraftControlSchema;
  id: string;
}>;

type ApplicabilitySelectorControlType =
  ToolcraftControlApplicabilityCase["selectorControlType"];

function indexControls(
  schema: Pick<ResolvedToolcraftAppSchema, "panels">,
): Map<string, IndexedControl> {
  const controls = new Map<string, IndexedControl>();

  for (const section of schema.panels.controls?.sections ?? []) {
    for (const [id, control] of Object.entries(section.controls)) {
      controls.set(control.target, { control, id });
    }
  }

  return controls;
}

function getApplicabilitySelectorControlType(
  control: ResolvedToolcraftControlSchema,
): ApplicabilitySelectorControlType | null {
  const type = control.type;
  if (!isToolcraftBuiltInControlType(type)) return null;
  switch (type) {
    case "checkbox":
    case "imagePicker":
    case "segmented":
    case "select":
    case "slider":
    case "switch":
    case "tabs":
      return type;
    default:
      return null;
  }
}

function getSelectorOptionLabel(
  control: ResolvedToolcraftControlSchema,
  value: boolean | number | string,
): string | undefined {
  if (
    control.type === "select" ||
    control.type === "segmented" ||
    control.type === "tabs"
  ) {
    return control.options?.find((option) => option.value === value)?.label;
  }

  if (control.type === "imagePicker") {
    const item = control.items?.find((candidate) => candidate.value === value);
    return item ? (item.alt ?? item.value) : undefined;
  }

  return undefined;
}

function getSatisfyingBaseline(
  dependent: ResolvedToolcraftControlSchema,
  controlsByTarget: ReadonlyMap<string, IndexedControl>,
): Map<string, boolean | number | string> {
  const baseline = new Map<string, boolean | number | string>();
  const predicates = getToolcraftApplicabilityPredicates(
    dependent.applicability,
  );
  const predicatesByTarget = new Map<string, ToolcraftControlPredicateSchema[]>();

  for (const predicate of predicates) {
    const targetPredicates = predicatesByTarget.get(predicate.target) ?? [];
    targetPredicates.push(predicate);
    predicatesByTarget.set(predicate.target, targetPredicates);
  }

  for (const [target, targetPredicates] of predicatesByTarget) {
    const selector = controlsByTarget.get(target)?.control;

    if (!selector) {
      continue;
    }

    const domain = getToolcraftApplicabilitySelectorDomain(
      selector,
      targetPredicates,
    );

    if (domain.status !== "supported") {
      continue;
    }

    const value = domain.values.find((candidate) =>
      targetPredicates.every((predicate) =>
        doesToolcraftPredicateMatchValue(predicate, candidate),
      ),
    );

    if (value !== undefined) {
      baseline.set(target, value);
    }
  }

  return baseline;
}

export function getToolcraftControlApplicabilityCases(
  input: Readonly<{
    schema: Pick<ResolvedToolcraftAppSchema, "panels">;
    sectionInventory: readonly ToolcraftControlSectionInventoryEntry[];
    target: string;
  }>,
): ToolcraftControlApplicabilityCase[] {
  const selectorDependencies =
    createToolcraftControlSelectorCaseDependencyIndex(
      input.schema,
      input.sectionInventory,
    );
  const controlsByTarget = indexControls(input.schema);
  const dependent = controlsByTarget.get(input.target);

  if (
    !dependent ||
    !isToolcraftVisibleAcceptanceControl(dependent.control)
  ) {
    return [];
  }

  const dependentPredicates = getToolcraftApplicabilityPredicates(
    dependent.control.applicability,
  );
  const selectorTargets =
    selectorDependencies.selectorsByDependent.get(dependent.control.target) ?? [];
  const baseline = getSatisfyingBaseline(dependent.control, controlsByTarget);
  const cases: ToolcraftControlApplicabilityCase[] = [];

  for (const selectorTarget of selectorTargets) {
    if (selectorTarget === dependent.control.target) {
      continue;
    }

    const indexedSelector = controlsByTarget.get(selectorTarget);

    if (!indexedSelector) {
      continue;
    }
    const { control: selector } = indexedSelector;

    const selectorPredicates = dependentPredicates.filter(
      (predicate) => predicate.target === selectorTarget,
    );

    const domain = getToolcraftApplicabilitySelectorDomain(
      selector,
      selectorPredicates,
    );

    if (domain.status !== "supported") {
      continue;
    }

    const selectorControlType = getApplicabilitySelectorControlType(selector);

    if (!selectorControlType) {
      continue;
    }

    for (const selectorValue of domain.values) {
      const values = new Map(baseline);
      values.set(selectorTarget, selectorValue);
      const selectorOptionLabel = getSelectorOptionLabel(
        selector,
        selectorValue,
      );
      const matches = doesToolcraftApplicabilityMatch(
        dependent.control.applicability,
        (target) =>
          values.get(target) ??
          controlsByTarget.get(target)?.control.defaultValue,
      );

      cases.push({
        expectation: matches ? "visible" : "hidden",
        selectorControlType,
        selectorLabel:
          typeof selector.label === "string"
            ? selector.label
            : indexedSelector.id,
        ...(selectorOptionLabel ? { selectorOptionLabel } : {}),
        selectorTarget,
        selectorValue,
        target: dependent.control.target,
      });
    }
  }

  return cases;
}

export function getToolcraftApplicabilityRequirementId(
  baseRequirementId: string,
  applicabilityCase: ToolcraftControlApplicabilityCase,
): string {
  const serializedValue =
    JSON.stringify(applicabilityCase.selectorValue) ??
    String(applicabilityCase.selectorValue);

  return `${baseRequirementId}#applicability:${applicabilityCase.selectorTarget}=${encodeURIComponent(serializedValue)}:${applicabilityCase.expectation}`;
}
