import type { ToolcraftPanelSurfaceModuleContribution } from "../contract/contribution";
import type { ToolcraftPanelSurfaceContribution, ToolcraftResolvedPanelSurfaces } from "../contract/panel-surface-contribution";

export type ResolvedToolcraftPanelSurfaces = ToolcraftResolvedPanelSurfaces<ToolcraftPanelSurfaceModuleContribution>;

export function resolveToolcraftPanelSurfaceContributions<Contribution extends ToolcraftPanelSurfaceContribution>(
  contributions: readonly Contribution[],
): ToolcraftResolvedPanelSurfaces<Contribution> {
  const surfaces = new Set<string>();
  const entries = contributions.map(contribution => {
    if (surfaces.has(contribution.surface)) throw new Error(`Toolcraft panel-surface "${contribution.surface}" has multiple owners.`);
    surfaces.add(contribution.surface);
    return [contribution.surface, contribution.configuration] as const;
  });
  return Object.freeze(Object.fromEntries(entries)) as ToolcraftResolvedPanelSurfaces<Contribution>;
}
