import { expect } from "@playwright/test";

export const TOOLCRAFT_FALLBACK_MATERIAL_SIGNATURE =
  "fallback:base-linear(0.8,0.8,0.8):metallic(0):roughness(0.5):emissive(0,0,0):alpha(1)";

export type ToolcraftModelAppearanceCoverage =
  | "appearance-preservation"
  | "deterministic-root-selection"
  | "fallback-appearance"
  | "package-extraction"
  | "pixel-output"
  | "presentation-consumer-readiness";

export type ToolcraftModelOutputObservation = Readonly<{
  appearanceSource: "authored" | "fallback";
  documentId: string;
  editorChrome: "excluded" | "included";
  materialSignature: string;
  modelSignature: string;
  opacity: number;
  outputSignature: string;
  pixelSamples: readonly (readonly [number, number, number, number])[];
  pixelSignature: string;
  presentationCacheKey: string;
}>;

export type ToolcraftModelPackageObservation = Readonly<{
  candidateRootPaths: readonly string[];
  extractedFileCount: number;
  kind: "folder" | "standalone" | "zip";
  selectedRootPath: string;
}>;

export type ToolcraftModelPresentationObservation = Readonly<{
  consumerId: string | null;
  mode: "custom" | "runtime";
  status: "error" | "ready";
}>;

export type ToolcraftModelResourceDisposalObservation = Readonly<{
  acquired: number;
  active: number;
  cacheHits: number;
  disposed: number;
  released: number;
}>;

export type ToolcraftModelAppearanceObservation = Readonly<{
  package: ToolcraftModelPackageObservation | null;
  presentation: ToolcraftModelPresentationObservation | null;
  previewOutput: ToolcraftModelOutputObservation | null;
  resources: ToolcraftModelResourceDisposalObservation;
}>;

function expectNonEmpty(value: string, description: string): void {
  expect(value.trim(), description).not.toBe("");
}

export function validateToolcraftModelOutputObservation(
  output: ToolcraftModelOutputObservation,
  description: string,
): void {
  expectNonEmpty(output.documentId, `${description} must identify its document.`);
  expectNonEmpty(output.materialSignature, `${description} must identify its material.`);
  expectNonEmpty(output.modelSignature, `${description} must identify the rendered model.`);
  expectNonEmpty(output.outputSignature, `${description} must report an output signature.`);
  expectNonEmpty(output.pixelSignature, `${description} must report a pixel signature.`);
  expectNonEmpty(
    output.presentationCacheKey,
    `${description} must identify the shared appearance cache entry.`,
  );
  expect(/^(?:blank|empty|transparent|none)$/iu.test(output.pixelSignature.trim())).toBe(false);
  expect(
    output.editorChrome,
    `${description} must sample product output without editor gizmos or handles.`,
  ).toBe("excluded");
  expect(output.pixelSamples.length, `${description} must sample rendered RGBA pixels.`)
    .toBeGreaterThan(0);
  for (const sample of output.pixelSamples) {
    expect(sample).toHaveLength(4);
    expect(sample.every((channel) => Number.isInteger(channel) && channel >= 0 && channel <= 255))
      .toBe(true);
  }
  expect(Number.isFinite(output.opacity), `${description} opacity must be finite.`).toBe(true);
  expect(output.opacity, `${description} opacity must be within 0..1.`).toBeGreaterThanOrEqual(0);
  expect(output.opacity, `${description} opacity must be within 0..1.`).toBeLessThanOrEqual(1);
}

export function validateToolcraftModelAppearanceObservation(
  observation: ToolcraftModelAppearanceObservation,
  description: string,
): void {
  if (observation.package) {
    const packageObservation = observation.package;
    expect(packageObservation.extractedFileCount).toBeGreaterThan(0);
    expect(packageObservation.candidateRootPaths.length).toBeGreaterThan(0);
    expect(new Set(packageObservation.candidateRootPaths).size)
      .toBe(packageObservation.candidateRootPaths.length);
    for (const rootPath of packageObservation.candidateRootPaths) {
      expectNonEmpty(rootPath, `${description} package roots must be non-empty.`);
    }
    expect(packageObservation.candidateRootPaths)
      .toContain(packageObservation.selectedRootPath);
  }
  if (observation.presentation) {
    const presentation = observation.presentation;
    if (presentation.mode === "custom") {
      expectNonEmpty(
        presentation.consumerId ?? "",
        `${description} custom presentation must identify its checked consumer.`,
      );
    } else {
      expect(presentation.consumerId).toBeNull();
    }
  }
  const resources = observation.resources;
  for (const count of Object.values(resources)) {
    expect(Number.isInteger(count) && count >= 0).toBe(true);
  }
  expect(resources.active).toBe(resources.acquired - resources.released);
  expect(resources.cacheHits).toBeLessThanOrEqual(resources.acquired);
  expect(resources.disposed).toBeLessThanOrEqual(resources.released);
}

function requirePreview(
  observation: ToolcraftModelAppearanceObservation,
  description: string,
): ToolcraftModelOutputObservation {
  expect(observation.previewOutput, `${description} requires visible model output.`)
    .not.toBeNull();
  return observation.previewOutput!;
}

export function assertToolcraftModelAppearanceCoverage(
  observation: ToolcraftModelAppearanceObservation,
  coverage: ToolcraftModelAppearanceCoverage,
  description: string,
): void {
  if (coverage === "package-extraction") {
    expect(observation.package, `${description} requires package provenance.`).not.toBeNull();
    expect(["folder", "zip"]).toContain(observation.package!.kind);
    expect(observation.package!.extractedFileCount).toBeGreaterThan(1);
    return;
  }
  if (coverage === "deterministic-root-selection") {
    expect(observation.package, `${description} requires package provenance.`).not.toBeNull();
    expect(observation.package!.selectedRootPath)
      .toBe([...observation.package!.candidateRootPaths].sort()[0]);
    return;
  }
  const output = requirePreview(observation, description);
  if (coverage === "appearance-preservation") {
    expect(output.appearanceSource).toBe("authored");
    expectNonEmpty(output.materialSignature, `${description} must preserve authored appearance.`);
    return;
  }
  if (coverage === "fallback-appearance") {
    expect(output.appearanceSource).toBe("fallback");
    expect(output.materialSignature).toBe(TOOLCRAFT_FALLBACK_MATERIAL_SIGNATURE);
    return;
  }
  if (coverage === "presentation-consumer-readiness") {
    expect(observation.presentation, `${description} requires presentation status.`).not.toBeNull();
    expect(observation.presentation!.status).toBe("ready");
    return;
  }
  expect(
    output.pixelSamples.some((sample) => sample[3] > 0),
    `${description} must include nontransparent sampled output pixels.`,
  ).toBe(true);
}
