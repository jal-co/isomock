import { getModuleProductPolicyErrors } from "../composition/product-module-policies";
import {
toolcraftImageExportFormatTarget,
toolcraftImageExportResolutionTarget,
toolcraftVideoExportFormatTarget,
toolcraftVideoExportResolutionTarget,
} from "../export/artifact-export-settings";
import {
TOOLCRAFT_ARTIFACT_SETTINGS_SECTION_IDS,
} from "../modules/contract/contribution";
import type { ResolvedToolcraftProductModules } from "../modules/resolution/resolve-product-modules";
import {
TOOLCRAFT_ARTIFACT_ACTION_SECTION_ID,
TOOLCRAFT_ARTIFACT_ACTION_TARGET,
} from "../modules/contributions/artifact-action-contributions";
import {
isToolcraftArtifactExportAction,
} from "./artifact-export-actions";
import type { ToolcraftProductBase } from "./product-base";

const STANDARD_ARTIFACT_SECTION_IDS = Object.freeze([
  TOOLCRAFT_ARTIFACT_ACTION_SECTION_ID,
  TOOLCRAFT_ARTIFACT_SETTINGS_SECTION_IDS.image,
  TOOLCRAFT_ARTIFACT_SETTINGS_SECTION_IDS.video,
] as const);
const STANDARD_ARTIFACT_TARGETS = Object.freeze([
  TOOLCRAFT_ARTIFACT_ACTION_TARGET,
  toolcraftImageExportFormatTarget,
  toolcraftImageExportResolutionTarget,
  toolcraftVideoExportFormatTarget,
  toolcraftVideoExportResolutionTarget,
] as const);

export function getToolcraftStandardCapabilityOwnershipErrors(
  base: ToolcraftProductBase,
  resolution: ResolvedToolcraftProductModules,
): readonly string[] {
  const errors: string[] = [];
  const sections = base.panels.controls?.sections ?? [];

  for (const section of sections) {
    if (
      section.id !== undefined &&
      STANDARD_ARTIFACT_SECTION_IDS.includes(
        section.id as (typeof STANDARD_ARTIFACT_SECTION_IDS)[number],
      )
    ) {
      errors.push(
        `Product control section "${section.id}" conflicts with reserved standard artifact ownership.`,
      );
    }
    for (const control of Object.values(section.controls)) {
      if (
        STANDARD_ARTIFACT_TARGETS.includes(
          control.target as (typeof STANDARD_ARTIFACT_TARGETS)[number],
        )
      ) {
        errors.push(
          `Product control target "${control.target}" conflicts with reserved standard artifact ownership.`,
        );
      }
      for (const action of control.actions ?? []) {
        if (isToolcraftArtifactExportAction(action)) {
          errors.push(
            `Product artifact action role "${action.role}" conflicts with reserved standard artifact ownership.`,
          );
        }
      }
    }
  }

  errors.push(...getModuleProductPolicyErrors(base, resolution));

  return Object.freeze(errors.sort());
}
