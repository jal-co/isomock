import { expect, type Page } from "@playwright/test";
import type { ResolvedToolcraftAppSchema } from "@/toolcraft/runtime";
import { getToolcraftControlFieldByTarget } from "./browser-control-target-helpers";

type ToolcraftSelectorObservation = Readonly<{
  selectorControlType: string;
  selectorOptionLabel?: string;
  selectorTarget: string;
  selectorValue: boolean | number | string;
}>;

function requireSelectorOptionLabel(
  applicabilityCase: ToolcraftSelectorObservation,
): string {
  if (!applicabilityCase.selectorOptionLabel) {
    throw new Error(
      `Applicability case for ${applicabilityCase.selectorTarget} requires a selector option label.`,
    );
  }

  return applicabilityCase.selectorOptionLabel;
}

export async function expectToolcraftSelectorState(
  page: Page,
  applicabilityCase: ToolcraftSelectorObservation,
): Promise<void> {
  const control = await getToolcraftControlFieldByTarget(
    page,
    applicabilityCase.selectorTarget,
  );

  switch (applicabilityCase.selectorControlType) {
    case "checkbox":
    case "switch":
      await expect(
        control.getByRole(applicabilityCase.selectorControlType === "switch" ? "switch" : "checkbox"),
      ).toHaveAttribute("aria-checked", String(applicabilityCase.selectorValue));
      return;
    case "imagePicker":
    case "segmented":
      await expect(
        control.getByRole("button", {
          name: requireSelectorOptionLabel(applicabilityCase), exact: true,
        }),
      ).toHaveAttribute("aria-pressed", "true");
      return;
    case "select":
      await expect(control.getByRole("combobox").locator('[data-slot="select-value"]')).toHaveText(
        requireSelectorOptionLabel(applicabilityCase),
      );
      return;
    case "slider":
      await expect(control.getByRole("slider")).toHaveAttribute(
        "aria-valuenow",
        String(applicabilityCase.selectorValue),
      );
      return;
    case "tabs":
      await expect(
        control.getByRole("tab", {
          name: requireSelectorOptionLabel(applicabilityCase), exact: true,
        }),
      ).toHaveAttribute("aria-selected", "true");
      return;
    default: throw new Error(`Unsupported selector control "${applicabilityCase.selectorControlType}".`);
  }
}

/** Assert registered branch values through the same native control observer as applicability. */
export async function expectToolcraftControlValues(page: Page, schema: ResolvedToolcraftAppSchema,
  values: Readonly<Record<string, string | number | boolean>>): Promise<void> {
  const controls = (schema.panels.controls?.sections ?? []).flatMap(section => Object.values(section.controls));
  for (const [target, value] of Object.entries(values)) {
    const control = controls.find(candidate => candidate.target === target);
    if (!control) throw new Error(`Unknown control "${target}" in Infinity branch proof.`);
    await expectToolcraftSelectorState(page, {
      selectorControlType: control.type,
      selectorOptionLabel: control.options?.find(option => option.value === value)?.label,
      selectorTarget: target,
      selectorValue: value,
    });
  }
}
