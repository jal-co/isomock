import type { ResolvedProductModulePlan } from "../modules/contract/module-plan";
import type { ToolcraftAuthoredStateMigration } from "./authored-state-migration";
import type { ToolcraftResolvedWorkspaceDefaults } from "./workspace-defaults-types";
import type {
  ResolvedToolcraftAppIdentity,
  ResolvedToolcraftCanvasRenderScaleSchema,
  ResolvedToolcraftExportSchema,
  ResolvedToolcraftMediaSchema,
  ResolvedToolcraftPanelsSchema,
  ResolvedToolcraftPersistenceSchema,
  ResolvedToolcraftSettingsTransferSchema,
  ToolcraftAssemblyContract,
  ToolcraftCanvasSchema,
  ToolcraftCanvasSize,
  ToolcraftCanvasSizeSource,
  ToolcraftToolbarSchema,
} from "./types";

type ToolcraftMaterializedAppSchema = {
  assembly: ToolcraftAssemblyContract;
  canvas: Omit<Required<ToolcraftCanvasSchema>, "renderScale"> & {
    renderScale: ResolvedToolcraftCanvasRenderScaleSchema;
    size: ToolcraftCanvasSize;
    sizeSource: ToolcraftCanvasSizeSource;
  };
  export: ResolvedToolcraftExportSchema;
  identity: ResolvedToolcraftAppIdentity;
  media: ResolvedToolcraftMediaSchema;
  panels: ResolvedToolcraftPanelsSchema;
  persistence: ResolvedToolcraftPersistenceSchema;
  settingsTransfer: ResolvedToolcraftSettingsTransferSchema;
  toolbar: Required<ToolcraftToolbarSchema>;
  sourceDefaults?: ToolcraftResolvedWorkspaceDefaults;
  authoredStateMigration?: ToolcraftAuthoredStateMigration;
};

export type ResolvedToolcraftAppSchema = Readonly<
  ToolcraftMaterializedAppSchema & {
    modulePlan: ResolvedProductModulePlan;
  }
>;
