import { expectToolcraftInfinityArtifactFrameParity, type ToolcraftInfinityExportEvidenceOptions } from "./browser-infinity-artifact-parity";
import { expect } from "@playwright/test";

import { attachToolcraftBrowserRuntimeEvidence } from "./browser-runtime-evidence";
import type { ToolcraftSvgArtifactInspection } from "./export-artifact-helpers";
import { assertToolcraftInspectedSvgArtifact } from "./svg-artifact-inspection";

export async function expectToolcraftInfinityCanvasSvgExportEvidence(
  artifacts: Readonly<{
    finite: ToolcraftSvgArtifactInspection;
    infinite: ToolcraftSvgArtifactInspection;
  }>,
  options: ToolcraftInfinityExportEvidenceOptions,
): Promise<void> {
  assertToolcraftInspectedSvgArtifact(artifacts.finite);
  assertToolcraftInspectedSvgArtifact(artifacts.infinite);
  expectToolcraftInfinityArtifactFrameParity(artifacts, options.expectedSize);

  for (const artifact of [artifacts.finite, artifacts.infinite]) {
    expect(artifact.byteLength).toBeGreaterThan(100);
    expect(artifact.contentHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(artifact.mediaType).toBe("image/svg+xml");
    expect(artifact.vectorElementCount).toBeGreaterThan(0);
  }

  expect(artifacts.infinite.viewBox).toEqual(artifacts.finite.viewBox);
  expect(artifacts.infinite.contentHash).toBe(artifacts.finite.contentHash);
  expect(artifacts.infinite.backgroundColor).toBe(artifacts.finite.backgroundColor);

  await attachToolcraftBrowserRuntimeEvidence({
    evidenceType: "infinity-scene-bounds-svg-export",
    requirementId: options.requirementId,
    target: options.target,
  });
}
