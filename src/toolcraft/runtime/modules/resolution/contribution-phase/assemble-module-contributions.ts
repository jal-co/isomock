import type {
  ToolcraftControlSectionSchema,
  ToolcraftPersistableStateSlice,
  ToolcraftTimelinePanelSchema,
} from "../../../schema/types";
import { resolveToolcraftArtifactActionContributions } from "../../contributions/artifact-action-contributions";
import { resolveToolcraftSettingsContributions } from "../../contributions/settings-contributions";
import { composeToolcraftStillExportSettings } from "../../contributions/still-export-settings";
import {
  resolveToolcraftCanvasBehaviorContributions,
  type ResolvedToolcraftCanvasBehavior,
} from "../../contributions/canvas-behavior-contributions";
import {
  resolveToolcraftMediaPolicyContributions,
  type ResolvedToolcraftMediaPolicy,
} from "../../contributions/media-policy-contributions";
import {
  resolveToolcraftPanelSurfaceContributions,
  type ResolvedToolcraftPanelSurfaces,
} from "../../contributions/panel-surface-contributions";
import { resolveToolcraftPersistenceContributions } from "../../contributions/persistence-contributions";
import type { ResolvedProductModulePlan } from "../../contract/module-plan";
import type { PreflightedModuleContributions } from "./preflight-module-contributions";

export type ResolvedToolcraftModuleContributions = Readonly<{
  canvasBehaviors: readonly ResolvedToolcraftCanvasBehavior[];
  controlSections: readonly ToolcraftControlSectionSchema[];
  layers?: true;
  mediaPolicy?: ResolvedToolcraftMediaPolicy;
  ownership: ResolvedProductModulePlan["ownership"];
  panelActionsSection?: ToolcraftControlSectionSchema;
  persistenceRequirements: readonly ToolcraftPersistableStateSlice[];
  timeline?: Readonly<Exclude<ToolcraftTimelinePanelSchema, boolean>>;
}>;

type ContributionPhaseBucket = Exclude<
  keyof PreflightedModuleContributions,
  "ownership"
>;

type ContributionPhaseOutputs = Readonly<{
  actionContributions: Readonly<{
    panelActionsSection: ReturnType<
      typeof resolveToolcraftArtifactActionContributions
    >;
  }>;
  canvasBehaviorContributions: Readonly<{
    canvasBehaviors: ReturnType<
      typeof resolveToolcraftCanvasBehaviorContributions
    >;
  }>;
  mediaPolicyContributions: Readonly<{
    mediaPolicy: ReturnType<typeof resolveToolcraftMediaPolicyContributions>;
  }>;
  persistenceContributions: Readonly<{
    persistenceRequirements: ReturnType<
      typeof resolveToolcraftPersistenceContributions
    >;
  }>;
  settingsContributions: Readonly<{
    controlSections: ReturnType<
      typeof resolveToolcraftSettingsContributions
    >;
  }>;
  surfaceContributions: Readonly<{
    panelSurfaces: ResolvedToolcraftPanelSurfaces;
  }>;
}>;

export type ToolcraftContributionPhaseTable = Readonly<{
  [Bucket in ContributionPhaseBucket]: Readonly<{
    [Role in keyof ContributionPhaseOutputs[Bucket]]: (
      contributions: PreflightedModuleContributions[Bucket],
    ) => ContributionPhaseOutputs[Bucket][Role];
  }>;
}>;

export const TOOLCRAFT_CONTRIBUTION_PHASE_TABLE = Object.freeze({
  actionContributions: Object.freeze({
    panelActionsSection: resolveToolcraftArtifactActionContributions,
  }),
  canvasBehaviorContributions: Object.freeze({
    canvasBehaviors: resolveToolcraftCanvasBehaviorContributions,
  }),
  mediaPolicyContributions: Object.freeze({
    mediaPolicy: resolveToolcraftMediaPolicyContributions,
  }),
  persistenceContributions: Object.freeze({
    persistenceRequirements: resolveToolcraftPersistenceContributions,
  }),
  settingsContributions: Object.freeze({
    controlSections: resolveToolcraftSettingsContributions,
  }),
  surfaceContributions: Object.freeze({
    panelSurfaces: resolveToolcraftPanelSurfaceContributions,
  }),
} satisfies ToolcraftContributionPhaseTable);

export function assembleToolcraftModuleContributions(
  preflight: PreflightedModuleContributions,
  phaseTable: ToolcraftContributionPhaseTable,
): ResolvedToolcraftModuleContributions {
  const canvasBehaviors =
    phaseTable.canvasBehaviorContributions.canvasBehaviors(
      preflight.canvasBehaviorContributions,
    );
  const controlSections = phaseTable.settingsContributions.controlSections(
    composeToolcraftStillExportSettings(
      preflight.settingsContributions,
      preflight.actionContributions,
    ),
  );
  const mediaPolicy = phaseTable.mediaPolicyContributions.mediaPolicy(
    preflight.mediaPolicyContributions,
  );
  const panelActionsSection =
    phaseTable.actionContributions.panelActionsSection(
      preflight.actionContributions,
    );
  const panelSurfaces = phaseTable.surfaceContributions.panelSurfaces(
    preflight.surfaceContributions,
  );
  const persistenceRequirements =
    phaseTable.persistenceContributions.persistenceRequirements(
      preflight.persistenceContributions,
    );

  return Object.freeze({
    canvasBehaviors,
    controlSections,
    ...panelSurfaces,
    ...(mediaPolicy === undefined ? {} : { mediaPolicy }),
    ownership: preflight.ownership,
    ...(panelActionsSection === undefined ? {} : { panelActionsSection }),
    persistenceRequirements,
  });
}
