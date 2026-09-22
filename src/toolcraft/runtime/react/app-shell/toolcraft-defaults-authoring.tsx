"use client";
import * as React from "react";
import type { ToolcraftAppDefaults } from "../../schema/app-defaults";
import type { ToolcraftDefaultResourceUpload } from "../../source-assets/default-resource-capture";

/** The authoring owner declares which state domain its save transaction consumes. */
export type ToolcraftDefaultsAuthoring =
  | Readonly<{
      kind: "workspace";
      save(defaults: ToolcraftAppDefaults, resources: readonly ToolcraftDefaultResourceUpload[]): Promise<void>;
    }>
  | Readonly<{
      kind: "source";
      description?: string;
      savedMessage?: string;
      save(): Promise<void>;
    }>;
const Context = React.createContext<ToolcraftDefaultsAuthoring | null>(null);
export const ToolcraftDefaultsAuthoringProvider = Context.Provider;
export function useToolcraftDefaultsAuthoring(): ToolcraftDefaultsAuthoring | null {
  return React.useContext(Context);
}
