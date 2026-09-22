import type { ToolcraftRendererTechnique } from "@/toolcraft/runtime";

import {
  inspectRendererProvider,
  type RendererProviderPackageJson,
} from "../../toolcraft/renderer-providers/provider-config.mjs";

const VGPU_PROVIDER_ID = "vgpu";
const ENABLE_VGPU_ERROR =
  "rendererTechnique selects VGPU, but the provider is not enabled. Run `npm run toolcraft:renderer -- enable vgpu`; activation installs and verifies dependencies automatically.";
const UNUSED_VGPU_ERROR =
  "VGPU provider dependencies are enabled, but rendererTechnique does not select VGPU.";
const DRIFTED_UNUSED_VGPU_ERROR =
  "VGPU provider dependencies are incomplete or drifted, but rendererTechnique does not select VGPU.";

export type ToolcraftRendererProviderConfigurationInput = Readonly<{
  catalog: unknown;
  gpu?: ToolcraftRendererTechnique["gpu"];
  packageJson: RendererProviderPackageJson;
}>;

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function selectsVgpu(
  gpu: ToolcraftRendererTechnique["gpu"],
): boolean {
  return (
    gpu?.preview?.provider === VGPU_PROVIDER_ID ||
    gpu?.export?.provider === VGPU_PROVIDER_ID
  );
}

export function getToolcraftRendererProviderConfigurationErrors(
  input: ToolcraftRendererProviderConfigurationInput,
): readonly string[] {
  let inspection;
  try {
    inspection = inspectRendererProvider({
      catalog: input.catalog,
      packageJson: input.packageJson,
      providerId: VGPU_PROVIDER_ID,
    });
  } catch (error) {
    return Object.freeze([getErrorMessage(error)]);
  }

  const techniqueSelectsVgpu = selectsVgpu(input.gpu);
  if (techniqueSelectsVgpu && inspection.status !== "exact") {
    return Object.freeze([ENABLE_VGPU_ERROR]);
  }
  if (!techniqueSelectsVgpu && inspection.status === "exact") {
    return Object.freeze([UNUSED_VGPU_ERROR]);
  }
  if (!techniqueSelectsVgpu && inspection.status === "drifted") {
    return Object.freeze([DRIFTED_UNUSED_VGPU_ERROR]);
  }
  return Object.freeze([]);
}
