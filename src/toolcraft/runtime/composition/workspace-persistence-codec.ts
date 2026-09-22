import { createToolcraftPersistenceCodec } from "../modules/contract/persistence-codec";
import { timelinePersistenceCodec } from "../modules/built-ins/timeline/core/persistence";
import { layersPersistenceCodec } from "../modules/built-ins/layers/core/persistence";
import { createMediaPersistenceCodec } from "../modules/built-ins/media-source/core/persistence";
import { projectToolcraftPersistedModel } from "../state/persistence-model-projection";
import type { ToolcraftInitialState, ToolcraftState } from "../state/types";
import type { ResolvedToolcraftAppSchema } from "../schema/resolved-app-schema";
import type { ToolcraftPersistableStateSlice } from "../schema/types";
import { documentPersistenceCodecs } from "./document-persistence-codecs";

export const workspacePersistenceCodec = createToolcraftPersistenceCodec<ToolcraftState, ResolvedToolcraftAppSchema, ToolcraftInitialState, ToolcraftPersistableStateSlice>({
  ...documentPersistenceCodecs,
  timeline: timelinePersistenceCodec,
  layers: layersPersistenceCodec,
  media: createMediaPersistenceCodec(projectToolcraftPersistedModel),
});
