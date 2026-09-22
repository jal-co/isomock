export type ToolcraftPanelSurfaceContribution<Surface extends string = string, Configuration = unknown> = Readonly<{
  id: string;
  moduleId: string;
  kind: "panel-surface";
  surface: Surface;
  configuration: Configuration;
}>;

export type ToolcraftResolvedPanelSurfaces<Contribution extends ToolcraftPanelSurfaceContribution> = {
  readonly [Surface in Contribution["surface"]]?: Extract<Contribution, { surface: Surface; }>["configuration"];
};
