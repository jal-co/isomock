import type { TestInfo } from "@playwright/test";

import { parseToolcraftBrowserRuntimeEvidence } from "../src/app/test-evidence/browser-runtime-contract";
import type {
  ToolcraftModelIdentityObservation,
  ToolcraftModelImportBrowserObservation,
  ToolcraftModelOutputObservation,
} from "./browser-model-import-evidence-helpers";
import { TOOLCRAFT_FALLBACK_MATERIAL_SIGNATURE } from "./browser-model-appearance-evidence";

export const advertisedFormats = ["glb", "gltf", "fbx", "obj", "stl", "ply"];
export const cleanIdentity = {
  assetId: "model-clean",
  documentId: "document-clean",
};
export const repairedIdentity = {
  assetId: "model-repaired",
  documentId: "document-repaired",
};
export const emptyRepair = {
  available: false,
  diagnosisSignature: null,
  geometrySignature: null,
  progress: null,
  verification: null,
} as const;
export const emptyModelResources = {
  acquired: 0,
  active: 0,
  cacheHits: 0,
  disposed: 0,
  released: 0,
} as const;
export const readyModelResources = {
  acquired: 2,
  active: 1,
  cacheHits: 1,
  disposed: 0,
  released: 1,
} as const;
export const runtimePresentation = {
  consumerId: null,
  mode: "runtime" as const,
  status: "ready" as const,
};
export const zipPackage = {
  candidateRootPaths: ["models/a.glb", "models/z.glb"],
  extractedFileCount: 3,
  kind: "zip" as const,
  selectedRootPath: "models/a.glb",
};

export function output(
  identity: ToolcraftModelIdentityObservation,
  suffix: string,
  opacity: number,
  options: Readonly<{
    appearanceSource?: "authored" | "fallback";
    materialSignature?: string;
    pixelSamples?: readonly (readonly [number, number, number, number])[];
  }> = {},
): ToolcraftModelOutputObservation {
  const sampleBase = 32 + [...suffix].reduce(
    (total, character) => (total + character.charCodeAt(0)) % 192,
    0,
  );
  return {
    appearanceSource: options.appearanceSource ?? "authored",
    documentId: identity.documentId,
    editorChrome: "excluded",
    materialSignature:
      options.materialSignature ?? `material:${identity.documentId}`,
    modelSignature: identity.assetId,
    opacity,
    outputSignature: `output-${suffix}`,
    pixelSamples: options.pixelSamples ?? [
      [sampleBase, 64, 96, 255],
      [48, sampleBase, 112, 255],
      [80, 104, sampleBase, 255],
    ],
    pixelSignature: `pixels-${suffix}`,
    presentationCacheKey: `appearance:${identity.documentId}:v2`,
  };
}

export function fallbackOutput(
  identity: ToolcraftModelIdentityObservation,
  suffix: string,
  opacity: number,
): ToolcraftModelOutputObservation {
  return output(identity, suffix, opacity, {
    appearanceSource: "fallback",
    materialSignature: TOOLCRAFT_FALLBACK_MATERIAL_SIGNATURE,
    pixelSamples: [[204, 204, 204, 255], [196, 196, 196, 255]],
  });
}

export function state(
  overrides: Partial<ToolcraftModelImportBrowserObservation> = {},
): ToolcraftModelImportBrowserObservation {
  return {
    active: null,
    advertisedFormats,
    attemptFormat: null,
    draft: null,
    exportOutput: null,
    lifecycle: "empty",
    package: null,
    persistenceState: "none",
    presentation: null,
    previewOutput: null,
    rejection: null,
    repair: emptyRepair,
    resources: emptyModelResources,
    unavailableReason: null,
    ...overrides,
  };
}

export function modelEvidence(testInfo: TestInfo, startIndex: number) {
  return testInfo.attachments
    .slice(startIndex)
    .map((attachment) => parseToolcraftBrowserRuntimeEvidence(attachment))
    .filter((entry) => entry?.evidenceType.startsWith("model-"));
}
