import { mediaSourceModule } from "./built-ins/media-source/media-source-module";
import { timelineModule } from "./built-ins/timeline/timeline-module";
import type {
  ToolcraftDefaultProviderId,
  ToolcraftProductCapabilityId,
  ToolcraftProductModuleId,
} from "./contract/capability";
import type { ToolcraftProductModuleDefinition } from "./contract/module-definition";

type ToolcraftBuiltInModuleCatalogEntry = Readonly<{
  contractVersion: 2;
  id: ToolcraftProductModuleId;
}>;

type ToolcraftDefaultProviderCatalogEntry = Readonly<{
  capabilityId: ToolcraftProductCapabilityId;
  definition: ToolcraftProductModuleDefinition;
  id: ToolcraftDefaultProviderId;
}>;

export const TOOLCRAFT_BUILT_IN_MODULE_CATALOG: readonly ToolcraftBuiltInModuleCatalogEntry[] =
  Object.freeze([
    Object.freeze({ contractVersion: 2, id: "canvas-editing" }),
    Object.freeze({ contractVersion: 2, id: "image-export" }),
    Object.freeze({ contractVersion: 2, id: "masks" }),
    Object.freeze({ contractVersion: 2, id: "layers" }),
    Object.freeze({ contractVersion: 2, id: "media-source" }),
    Object.freeze({ contractVersion: 2, id: "model-3d" }),
    Object.freeze({ contractVersion: 2, id: "spatial-view" }),
    Object.freeze({ contractVersion: 2, id: "svg-export" }),
    Object.freeze({ contractVersion: 2, id: "timeline" }),
    Object.freeze({ contractVersion: 2, id: "video-export" }),
  ]);

export const TOOLCRAFT_DEFAULT_PROVIDER_CATALOG: readonly ToolcraftDefaultProviderCatalogEntry[] =
  Object.freeze([
    Object.freeze({
      capabilityId: "media.source",
      definition: mediaSourceModule(),
      id: "media.source-default",
    }),
    Object.freeze({
      capabilityId: "timeline.playback",
      definition: timelineModule({ mode: "playback" }),
      id: "timeline.playback-default",
    }),
  ]);
