import type {
  ToolcraftControlSchema,
  ToolcraftDefaultModelAssetSchema,
  ToolcraftModelImportLimits,
  ToolcraftModelTopologyProfile,
} from "../schema/types";
import type { ResolvedToolcraftAppSchema } from "../schema/resolved-app-schema";
import type { ToolcraftModelAsset } from "../state/types";
import { defaultToolcraftSceneElementFrame } from "../state/scene-element-frame";

const DEFAULT_MODEL_PLACEHOLDER_REF_PREFIX =
  "toolcraft-default-model-placeholder:";

function getDefaultModelId(
  index: number,
  asset: ToolcraftDefaultModelAssetSchema,
): string {
  return asset.id ?? `default-media-${index + 1}`;
}

function getDefaultModelLayerId(
  index: number,
  asset: ToolcraftDefaultModelAssetSchema,
): string {
  return asset.layerId ?? `default-media-layer-${index + 1}`;
}

function createPlaceholderRef(assetId: string): string {
  return `${DEFAULT_MODEL_PLACEHOLDER_REF_PREFIX}${encodeURIComponent(assetId)}`;
}

function findModelControl(
  schema: ResolvedToolcraftAppSchema,
  target: string | undefined,
): ToolcraftControlSchema | null {
  if (!target) return null;

  for (const section of schema.panels.controls?.sections ?? []) {
    for (const control of Object.values(section.controls)) {
      if (
        control.type === "fileDrop" &&
        control.assetKind === "model" &&
        control.target === target
      ) {
        return control;
      }
    }
  }

  return null;
}

export function resolveToolcraftDefaultModelControl(
  schema: ResolvedToolcraftAppSchema,
  asset: ToolcraftDefaultModelAssetSchema,
): ToolcraftControlSchema {
  const control = findModelControl(schema, asset.sourceTarget);
  if (!control) {
    throw new Error(
      `Default model "${asset.fileName}" must reference a model fileDrop control through sourceTarget.`,
    );
  }
  return control;
}

function emptyModelAnalysis(): ToolcraftModelAsset["analysis"] {
  return Object.freeze({
    boundaryEdges: 0,
    diagnostics: Object.freeze([]),
    disconnectedComponents: 0,
    nonManifoldEdges: 0,
    outcome: "clean" as const,
    triangles: 0,
    vertices: 0,
  });
}

export function createToolcraftDefaultModelPlaceholder({
  asset,
  index,
  topologyProfile,
}: Readonly<{
  asset: ToolcraftDefaultModelAssetSchema;
  index: number;
  topologyProfile: ToolcraftModelTopologyProfile;
}>): ToolcraftModelAsset {
  const id = getDefaultModelId(index, asset);
  const placeholderRef = createPlaceholderRef(id);
  const analysis = emptyModelAnalysis();
  const rootSource =
    asset.sourceFiles.find(
      (source) =>
        source.path.slice(source.path.lastIndexOf("/") + 1) === asset.fileName,
    ) ?? asset.sourceFiles[0];

  return Object.freeze({
    activeDocumentRef: placeholderRef,
    analysis,
    assetKind: "model" as const,
    fileName: asset.fileName,
    sourcePaths: Object.freeze(asset.sourceFiles.map(({ path }) => path)),
    id,
    layerId: getDefaultModelLayerId(index, asset),
    lifecycle: "restoring" as const,
    mimeType: asset.mimeType ?? rootSource?.mimeType ?? "model/*",
    originalAnalysis: analysis,
    originalDocumentRef: placeholderRef,
    position: defaultToolcraftSceneElementFrame.position,
    size: defaultToolcraftSceneElementFrame.size,
    sourceBundleDigest: placeholderRef,
    sourceBundleRef: placeholderRef,
    ...(asset.sourceTarget ? { sourceTarget: asset.sourceTarget } : {}),
    topologyProfile,
  });
}

export function isToolcraftDefaultModelPlaceholder(
  asset: ToolcraftModelAsset,
): boolean {
  return (
    asset.lifecycle === "restoring" &&
    asset.sourceBundleRef.startsWith(DEFAULT_MODEL_PLACEHOLDER_REF_PREFIX) &&
    asset.sourceBundleDigest === asset.sourceBundleRef &&
    asset.activeDocumentRef === asset.sourceBundleRef &&
    asset.originalDocumentRef === asset.sourceBundleRef
  );
}

export function findToolcraftDefaultModelSchemaAsset(
  schema: ResolvedToolcraftAppSchema,
  placeholder: ToolcraftModelAsset,
): ToolcraftDefaultModelAssetSchema | null {
  for (let index = 0; index < schema.media.defaultAssets.length; index += 1) {
    const asset = schema.media.defaultAssets[index];
    if (
      asset?.assetKind === "model" &&
      getDefaultModelId(index, asset) === placeholder.id &&
      getDefaultModelLayerId(index, asset) === placeholder.layerId &&
      asset.sourceTarget === placeholder.sourceTarget
    ) {
      return asset;
    }
  }
  return null;
}

function decodeBase64(payload: string): Uint8Array {
  let binary: string;
  try {
    binary = atob(payload);
  } catch {
    throw new Error("A default model source contains invalid base64 data.");
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function decodeDataUrl(
  dataUrl: string,
  maxRemainingBytes: number,
): Readonly<{ bytes: Uint8Array; mimeType: string }> {
  if (!dataUrl.startsWith("data:")) {
    throw new Error("Default model sources must use data URLs.");
  }
  const comma = dataUrl.indexOf(",");
  if (comma < 5) {
    throw new Error("A default model source contains an invalid data URL.");
  }
  const metadata = dataUrl.slice(5, comma);
  const payload = dataUrl.slice(comma + 1);
  const metadataParts = metadata.split(";");
  const isBase64 = metadataParts.at(-1)?.toLowerCase() === "base64";
  const mimeType = metadataParts[0] || "application/octet-stream";
  const encodedCeiling = isBase64
    ? Math.ceil((maxRemainingBytes * 4) / 3) + 4
    : maxRemainingBytes * 3;
  if (payload.length > encodedCeiling) {
    throw new Error(
      "Default model sources exceed the configured source byte limit.",
    );
  }

  let bytes: Uint8Array;
  if (isBase64) {
    bytes = decodeBase64(payload);
  } else {
    try {
      bytes = new TextEncoder().encode(decodeURIComponent(payload));
    } catch {
      throw new Error("A default model source contains invalid encoded data.");
    }
  }
  if (bytes.byteLength > maxRemainingBytes) {
    throw new Error(
      "Default model sources exceed the configured source byte limit.",
    );
  }
  return Object.freeze({ bytes, mimeType });
}

export function createToolcraftDefaultModelFiles(
  asset: ToolcraftDefaultModelAssetSchema,
  limits: Pick<ToolcraftModelImportLimits, "maxBundleFiles" | "maxSourceBytes">,
): readonly File[] {
  if (asset.sourceFiles.length === 0) {
    throw new Error(`Default model "${asset.fileName}" has no source files.`);
  }
  if (asset.sourceFiles.length > limits.maxBundleFiles) {
    throw new Error(
      "Default model sources exceed the configured bundle file limit.",
    );
  }

  let aggregateByteLength = 0;
  const seenPaths = new Set<string>();
  const files = asset.sourceFiles.map((source) => {
    if (seenPaths.has(source.path)) {
      throw new Error(
        `Default model source path "${source.path}" is duplicated.`,
      );
    }
    seenPaths.add(source.path);
    const fileName = source.path.slice(source.path.lastIndexOf("/") + 1);
    if (!fileName) {
      throw new Error("Default model source paths must end with a file name.");
    }
    const decoded = decodeDataUrl(
      source.dataUrl,
      limits.maxSourceBytes - aggregateByteLength,
    );
    aggregateByteLength += decoded.bytes.byteLength;
    const fileBytes = Uint8Array.from(decoded.bytes);
    const file = new File([fileBytes.buffer], fileName, {
      type: source.mimeType ?? decoded.mimeType,
    });
    if (source.path !== fileName) {
      Object.defineProperty(file, "webkitRelativePath", {
        configurable: false,
        enumerable: true,
        value: source.path,
        writable: false,
      });
    }
    return file;
  });

  return Object.freeze(files);
}
