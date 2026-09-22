import { expect } from "@playwright/test";

type ArtifactSize = Readonly<{ height: number; width: number }>;
type Artifact = ArtifactSize & Readonly<{ byteLength: number }>;
type ArtifactSizesByCanvasMode = Readonly<{
  finite: ArtifactSize;
  infinite: ArtifactSize;
}>;

export type ToolcraftInfinityExportEvidenceOptions = Readonly<{
  expectedSize: ArtifactSize | ArtifactSizesByCanvasMode;
  requirementId: string;
  target: string;
}>;

export function expectToolcraftInfinityArtifactFrameParity(
  artifacts: Readonly<{ finite: Artifact; infinite: Artifact }>,
  expectedSize: ArtifactSize | ArtifactSizesByCanvasMode,
): void {
  const expectedSizes = "finite" in expectedSize
    ? expectedSize
    : { finite: expectedSize, infinite: expectedSize };
  for (const mode of ["finite", "infinite"] as const) {
    const artifact = artifacts[mode];
    expect(artifact).toMatchObject(expectedSizes[mode]);
    expect(artifact.byteLength).toBeGreaterThan(100);
    expect(Number.isSafeInteger(artifact.width)).toBe(true);
    expect(Number.isSafeInteger(artifact.height)).toBe(true);
    expect(artifact.width).toBeGreaterThan(0);
    expect(artifact.height).toBeGreaterThan(0);
  }
}
