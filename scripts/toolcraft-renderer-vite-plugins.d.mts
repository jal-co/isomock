import type { Plugin } from "vite";

export type ToolcraftRendererVitePluginFactory = () =>
  | Plugin
  | PromiseLike<Plugin>;

export type ToolcraftRendererVitePluginModule = Readonly<{
  default?: ToolcraftRendererVitePluginFactory;
  wgslVitePlugin?: ToolcraftRendererVitePluginFactory;
}>;

export type ToolcraftRendererVitePluginImportContext = Readonly<{
  appRoot: string;
  dependencyName: string;
  dependencyRole: "wgsl-tooling";
}>;

export type LoadToolcraftRendererVitePluginsInput = Readonly<{
  appRoot: string;
  importModule?: (
    specifier: string,
    context: ToolcraftRendererVitePluginImportContext,
  ) => PromiseLike<ToolcraftRendererVitePluginModule>;
}>;

export function loadToolcraftRendererVitePlugins(
  input: LoadToolcraftRendererVitePluginsInput,
): Promise<Plugin[]>;
