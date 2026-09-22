import type { ToolcraftModelDocument } from "../canonical/model-document";
import type { ToolcraftModelDiagnostic } from "../model-import-types";
import { gltfDecodeCheckpoint } from "./gltf-decode-safety";

export type GltfFeatureInventory = Readonly<{
  animationClips: number;
  cameras: number;
  ignoredAppearanceExtensions: number;
  morphTargets: number;
  nodeVisibility: number;
  optionalExtensions: number;
  skins: number;
}>;

export function diagnosticsForGltfFeatures(
  features: GltfFeatureInventory,
): ToolcraftModelDiagnostic[] {
  const rows: Array<[number, string, string]> = [
    [
      features.ignoredAppearanceExtensions,
      "ignored-appearance-extensions",
      "Unsupported glTF appearance extension semantics were ignored while common static PBR appearance was retained.",
    ],
    [
      features.skins,
      "ignored-skins-and-rigs",
      "Skins and rig behavior were ignored; static base geometry was retained.",
    ],
    [
      features.morphTargets,
      "ignored-morph-targets",
      "Morph targets were ignored; static base positions were retained.",
    ],
    [
      features.animationClips,
      "ignored-animation-clips",
      "Animation clips were ignored; node-local source transforms were retained.",
    ],
    [
      features.nodeVisibility,
      "ignored-node-visibility",
      "Authored node visibility was ignored for static geometry import.",
    ],
    [
      features.cameras,
      "ignored-cameras",
      "Authored cameras were ignored because the Toolcraft viewport owns model presentation.",
    ],
    [
      features.optionalExtensions,
      "ignored-optional-extensions",
      "Optional extension semantics were ignored while fallback geometry was retained.",
    ],
  ];
  return rows.flatMap(([affectedCount, code, explanation]) =>
    affectedCount > 0
      ? [{ affectedCount, code, explanation, severity: "info" as const }]
      : [],
  );
}

export function estimateGltfCanonicalMetadataBytes(
  document: ToolcraftModelDocument,
  signal: AbortSignal,
): number {
  let bytes = 1_024;
  document.primitives.forEach((primitive, index) => {
    gltfDecodeCheckpoint(signal, index);
    bytes += 256 + primitive.id.length * 2;
  });
  document.nodes.forEach((node, index) => {
    gltfDecodeCheckpoint(signal, index);
    bytes += 512 + (node.id.length + node.name.length) * 2;
    for (const id of node.children) bytes += 64 + id.length * 2;
    for (const id of node.primitiveIds) bytes += 64 + id.length * 2;
  });
  for (const id of document.rootNodeIds) bytes += 64 + id.length * 2;
  if (document.version === 2) {
    document.materials.forEach((material, index) => {
      gltfDecodeCheckpoint(signal, document.primitives.length + index);
      bytes += 768 + material.id.length * 2;
    });
    document.textures.forEach((texture, index) => {
      gltfDecodeCheckpoint(
        signal,
        document.primitives.length + document.materials.length + index,
      );
      bytes += 512 +
        (texture.id.length +
          texture.contentDigest.length +
          texture.resourceRef.length +
          texture.mimeType.length) * 2;
    });
  }
  bytes +=
    (document.provenance.adapterVersion.length +
      document.provenance.sourceFormat.length) *
    2;
  return bytes;
}
