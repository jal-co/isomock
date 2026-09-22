import type { ToolcraftPersistenceSliceCodec } from "../modules/contract/persistence-codec";
import type { ResolvedToolcraftAppSchema } from "../schema/resolved-app-schema";
import type { ToolcraftInitialState, ToolcraftState } from "./types";
export type ToolcraftWorkspaceSliceCodec = ToolcraftPersistenceSliceCodec<ToolcraftState, ResolvedToolcraftAppSchema, ToolcraftInitialState>;
