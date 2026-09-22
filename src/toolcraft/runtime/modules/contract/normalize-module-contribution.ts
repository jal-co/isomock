import { snapshotToolcraftModuleData } from "./module-data";
import { normalizeToolcraftSettingsContribution } from "./control-section-contribution";
import type { ToolcraftProductModuleContribution } from "./contribution";
import { validateToolcraftProductModuleContribution, type ToolcraftContributionValidator } from "./validate-module-contribution";

export function normalizeToolcraftProductModuleContribution(
  input: ToolcraftProductModuleContribution,
  validate: ToolcraftContributionValidator,
): ToolcraftProductModuleContribution {
  const contribution = validateToolcraftProductModuleContribution(input, validate);
  const identity = { id: contribution.id, kind: contribution.kind, moduleId: contribution.moduleId };
  // Each branch projects one framework mechanism. Owner validators preserve the
  // narrower correlations; no module's named control fields live here.
  switch (contribution.kind) {
    case "canvas-behavior":
      return Object.freeze({ ...identity, behavior: contribution.behavior,
        operations: Object.freeze([...contribution.operations]) }) as ToolcraftProductModuleContribution;
    case "control-section":
      return normalizeToolcraftSettingsContribution(contribution);
    case "media-policy":
      return Object.freeze({ ...identity, policy: contribution.policy,
        sourceKinds: Object.freeze([...contribution.sourceKinds]) }) as ToolcraftProductModuleContribution;
    case "panel-action":
      return Object.freeze({ ...identity, role: contribution.role }) as ToolcraftProductModuleContribution;
    case "panel-surface":
      return snapshotToolcraftModuleData({ ...identity, surface: contribution.surface, configuration: contribution.configuration }) as ToolcraftProductModuleContribution;
    case "persistence-requirement":
      return Object.freeze({ ...identity, slice: contribution.slice }) as ToolcraftProductModuleContribution;
  }
}
