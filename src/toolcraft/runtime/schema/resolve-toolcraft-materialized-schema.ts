import { createToolcraftAssemblyContract } from "./assembly-contract";
import { getToolcraftCollectionSelectionTargets } from "./collection-actions";
import { resolveToolcraftAppCapabilities } from "./app-capabilities";
import { resolveToolcraftCanvasRenderScale } from "./canvas-render-scale";
import { normalizeToolcraftPanels } from "./panels-schema-normalization";
import { resolveToolcraftPersistencePlan } from "./persistence-plan";
import type { ToolcraftProductPersistence } from "./product-base";
import type { ResolvedToolcraftAppSchema } from "./resolved-app-schema";
import { resolveToolcraftSettingsTransfer } from "./runtime-setup-section";
import {
  defaultToolcraftCanvasSize,
  resolveToolcraftCanvasSizing,
  resolveToolcraftExport,
  resolveToolcraftMedia,
  resolveToolcraftToolbar,
} from "./schema-resolvers";
import type {
  ResolvedToolcraftAppIdentity,
  ToolcraftCanvasSchema,
  ToolcraftExportSchema,
  ToolcraftMediaSchema,
  ToolcraftPanelsSchema,
  ToolcraftPersistableStateSlice,
  ToolcraftSettingsTransferSchema,
  ToolcraftToolbarSchema,
} from "./types";

type ToolcraftMaterializedAppSchema = Omit<
  ResolvedToolcraftAppSchema,
  "modulePlan"
>;

type ToolcraftMaterializedSchemaInput = Readonly<{
  identity: ResolvedToolcraftAppIdentity;
  persistence: ToolcraftProductPersistence | undefined;
  requiredPersistenceSlices: readonly ToolcraftPersistableStateSlice[];
  schema: Readonly<{
    canvas: ToolcraftCanvasSchema;
    export?: ToolcraftExportSchema;
    media?: ToolcraftMediaSchema;
    panels: ToolcraftPanelsSchema;
    settingsTransfer?: ToolcraftSettingsTransferSchema;
    toolbar?: ToolcraftToolbarSchema;
  }>;
}>;

export function resolveToolcraftMaterializedSchema(
  input: ToolcraftMaterializedSchemaInput,
): ToolcraftMaterializedAppSchema {
  if (input.identity === undefined) {
    throw new Error(
      "Toolcraft product materialization requires a resolved identity.",
    );
  }
  const {
    identity,
    persistence: authoredPersistence,
    requiredPersistenceSlices,
    schema,
  } = input;
  const canvasEnabled = schema.canvas.enabled;
  if (schema.canvas.infinityBackgroundPolicy !== undefined && !["required", "optional"].includes(schema.canvas.infinityBackgroundPolicy)) {
    throw new Error("Invalid Infinity background policy.");
  }
  const canvasSize = schema.canvas.size;
  const canvasRenderScale = resolveToolcraftCanvasRenderScale(
    schema.canvas.renderScale,
  );
  const canvasSizing = resolveToolcraftCanvasSizing(schema.canvas);
  const collectionSelectionTargets = getToolcraftCollectionSelectionTargets(
    schema.panels.controls,
  );
  const settingsTransfer = resolveToolcraftSettingsTransfer({
    collectionSelectionTargets,
    controls: schema.panels.controls,
    identity,
    settingsTransfer: schema.settingsTransfer,
  });
  const canvas = {
    ...schema.canvas,
    infinityBackgroundPolicy: schema.canvas.infinityBackgroundPolicy ?? "optional",
    draggable: canvasEnabled ? (schema.canvas.draggable ?? true) : false,
    renderScale: canvasRenderScale,
    size: canvasSize ?? defaultToolcraftCanvasSize,
    sizeSource: canvasSize ? ("app" as const) : ("runtime-default" as const),
    sizing: canvasSizing,
    upload: schema.canvas.upload ?? false,
  };
  const panels = normalizeToolcraftPanels({
    canvas,
    panels: schema.panels,
    settingsTransfer,
  });
  const toolbar = resolveToolcraftToolbar({
    canvasEnabled,
    toolbar: schema.toolbar,
  });
  const exportSchema = resolveToolcraftExport(schema.export);
  const media = resolveToolcraftMedia(schema.media);
  const appCapabilities = resolveToolcraftAppCapabilities({
    canvas,
    media,
    panels,
  });
  const assembly = createToolcraftAssemblyContract({
    appCapabilities,
    canvas,
    panels,
    toolbar,
  });
  const persistence = resolveToolcraftPersistencePlan({
    collectionSelectionTargets,
    identity,
    persistence: authoredPersistence,
    requiredSlices: requiredPersistenceSlices,
  });

  return {
    assembly,
    canvas,
    export: exportSchema,
    identity,
    media,
    panels,
    persistence,
    settingsTransfer,
    toolbar,
  };
}
