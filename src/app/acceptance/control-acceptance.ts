import { getControlAcceptanceCoverageErrors } from "./control-acceptance-coverage";
import {
  getAcceptanceEntryTargetErrors,
  getControlAcceptanceByTarget,
  getControlTargets,
  type ToolcraftControlAcceptanceContext,
} from "./control-acceptance-context";
import { getControlKindAcceptanceErrors } from "./control-acceptance-kind-rules";
import { getControlPreAcceptanceErrors } from "./control-acceptance-policy";

export function getToolcraftControlAcceptanceErrors({
  acceptance,
  controls,
  layersEnabled,
  productReadiness,
  schema,
  timelineMode,
}: ToolcraftControlAcceptanceContext): string[] {
  const errors: string[] = [];
  const controlAcceptance = getControlAcceptanceByTarget(acceptance);
  const controlTargets = getControlTargets(controls);

  for (const { control, controlId, sectionTitle } of controls) {
    const label = `${sectionTitle ? `${sectionTitle} / ` : ""}${controlId} (${control.target})`;
    const entry = controlAcceptance.get(control.target);

    errors.push(
      ...getControlPreAcceptanceErrors({
        control,
        controlId,
        controlTargets,
        label,
        layersEnabled,
        sectionTitle,
        timelineMode,
      }),
    );

    if (!entry) {
      errors.push(`${label} is missing an acceptance entry.`);
      continue;
    }

    errors.push(
      ...getControlAcceptanceCoverageErrors({
        acceptance,
        control,
        controlId,
        entry,
        label,
        layersEnabled,
        productReadiness,
        schema,
        sectionTitle,
        timelineMode,
      }),
    );
    errors.push(
      ...getControlKindAcceptanceErrors({
        control,
        controlId,
        entry,
        label,
      }),
    );
  }

  errors.push(
    ...getAcceptanceEntryTargetErrors({ acceptance, controlTargets }),
  );
  return errors;
}
