import type { ToolcraftInitialState, ToolcraftState } from "../state/types";

export type ToolcraftDefaultResource = Readonly<{
  ref: string;
  path: string;
  sha256: string;
  byteLength: number;
  contentType: string;
  dependencies: readonly string[];
  durable: boolean;
}>;

export type ToolcraftWorkspaceDefaults = Readonly<{
  version: 2;
  appId: string;
  state: Pick<ToolcraftState, "values" | "canvas" | "panels" | "layers" | "selectedLayerId" | "mediaAssets" | "timeline"> & Partial<Pick<ToolcraftState, "controlRanges">>;
  resources: readonly ToolcraftDefaultResource[];
  theme: "dark" | "light" | "system";
}>;

export type ToolcraftResolvedWorkspaceDefaults = Readonly<{
  initialState: ToolcraftInitialState;
  resources: readonly ToolcraftDefaultResource[];
  /** Migrated v1 defaults own parameters; complete v2 defaults own the workspace. */
  scope?: "parameters";
  theme?: ToolcraftWorkspaceDefaults["theme"];
}>;
