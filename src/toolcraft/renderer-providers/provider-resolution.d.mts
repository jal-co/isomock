import type { RendererProviderApprovedRelease, RendererProviderDefinition, RendererProviderPackageJson } from "./provider-config.mjs";
export const rendererProviderActivationChecks: readonly ["wgsl-check", "adapter-types", "adapter-tests", "surface-browser"];
export const rendererProviderDependencyNames: readonly ["vgpu", "@vgpu/wgsl"];
export type RendererProviderResolution = Readonly<{
  schemaVersion: 1;
  resolvedAt: string;
  compatibilitySourceHash: string;
  dependencies: RendererProviderApprovedRelease["dependencies"];
  checks: typeof rendererProviderActivationChecks;
}>;
export function parseRendererProviderResolution(value: unknown): RendererProviderResolution;
export function parseVersionlessRendererProvider(value: unknown): RendererProviderDefinition;
export function resolveRendererProviderDefinition(provider: RendererProviderDefinition, packageJson: RendererProviderPackageJson): RendererProviderDefinition;
