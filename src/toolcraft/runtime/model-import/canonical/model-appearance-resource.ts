import type { ToolcraftModelImportLimits } from "../../schema/types";
import type {
  ToolcraftModelAppearanceResource,
} from "../model-import-types";
import { bytesToHex, sha256 } from "./sha256";
import type { ToolcraftModelDocument } from "./model-document";

const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const RESOURCE_REF = /^toolcraft:model-appearance:(sha256:[0-9a-f]{64})$/u;
const MIME_TYPES: ReadonlySet<string> = new Set([
  "image/avif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export function isToolcraftModelAppearanceMimeType(
  value: unknown,
): value is ToolcraftModelAppearanceResource["mimeType"] {
  return typeof value === "string" && MIME_TYPES.has(value);
}

function digestBytes(bytes: Uint8Array): string {
  return `sha256:${bytesToHex(sha256(bytes))}`;
}

export function createToolcraftModelAppearanceResourceRef(
  contentDigest: string,
): string {
  if (!DIGEST.test(contentDigest)) {
    throw new Error("Model appearance resource digest must be SHA-256.");
  }
  return `toolcraft:model-appearance:${contentDigest}`;
}

export function parseToolcraftModelAppearanceResourceRef(
  resourceRef: string,
): string | null {
  return RESOURCE_REF.exec(resourceRef)?.[1] ?? null;
}

export function compareToolcraftModelAppearanceResourceRefs(
  left: string,
  right: string,
): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export type ToolcraftModelAppearanceResourceManifestEntry = Readonly<{
  byteLength: number;
  contentDigest: string;
  mimeType: ToolcraftModelAppearanceResource["mimeType"];
  resourceRef: string;
}>;

export function createToolcraftModelAppearanceResourceManifest(
  resources: readonly ToolcraftModelAppearanceResource[],
): readonly ToolcraftModelAppearanceResourceManifestEntry[] {
  return Object.freeze([...resources]
    .sort((left, right) =>
      compareToolcraftModelAppearanceResourceRefs(
        left.resourceRef,
        right.resourceRef,
      )
    )
    .map((resource) => Object.freeze({
      byteLength: new Uint8Array(resource.bytes).byteLength,
      contentDigest: resource.contentDigest,
      mimeType: resource.mimeType,
      resourceRef: resource.resourceRef,
    })));
}

export function equalToolcraftModelAppearanceResourceManifests(
  left: readonly ToolcraftModelAppearanceResourceManifestEntry[],
  right: readonly ToolcraftModelAppearanceResourceManifestEntry[],
): boolean {
  return left.length === right.length && left.every((entry, index) => {
    const candidate = right[index];
    return candidate !== undefined &&
      candidate.byteLength === entry.byteLength &&
      candidate.contentDigest === entry.contentDigest &&
      candidate.mimeType === entry.mimeType &&
      candidate.resourceRef === entry.resourceRef;
  });
}

function copyResource(
  resource: ToolcraftModelAppearanceResource,
  index: number,
): ToolcraftModelAppearanceResource {
  if (!(resource.bytes instanceof ArrayBuffer) || resource.bytes.byteLength === 0) {
    throw new Error(`Appearance resource ${index} has invalid bytes.`);
  }
  const bytes = resource.bytes.slice(0);
  if (
    !DIGEST.test(resource.contentDigest) ||
    digestBytes(new Uint8Array(bytes)) !== resource.contentDigest ||
    createToolcraftModelAppearanceResourceRef(resource.contentDigest) !==
      resource.resourceRef
  ) {
    throw new Error(`Appearance resource ${index} failed digest verification.`);
  }
  if (!isToolcraftModelAppearanceMimeType(resource.mimeType)) {
    throw new Error(`Appearance resource ${index} has unsupported MIME type.`);
  }
  return Object.freeze({
    bytes,
    contentDigest: resource.contentDigest,
    mimeType: resource.mimeType,
    resourceRef: resource.resourceRef,
  });
}

export function snapshotToolcraftModelAppearanceResources(
  document: ToolcraftModelDocument,
  resources: readonly ToolcraftModelAppearanceResource[],
  limits: Pick<
    ToolcraftModelImportLimits,
    "maxTextureBytes" | "maxTextureCount"
  >,
): readonly ToolcraftModelAppearanceResource[] {
  if (!Array.isArray(resources) || resources.length > limits.maxTextureCount) {
    throw new Error("Model appearance resources exceed maxTextureCount.");
  }
  if (document.version === 1 && resources.length !== 0) {
    throw new Error("Canonical v1 documents cannot own appearance resources.");
  }
  const expected = document.version === 1
    ? new Map<string, { contentDigest: string; mimeType: string }>()
    : new Map(document.textures.map((texture) => [
        texture.resourceRef,
        { contentDigest: texture.contentDigest, mimeType: texture.mimeType },
      ]));
  const seen = new Set<string>();
  let aggregateBytes = 0;
  const snapshot = resources.map((resource, index) => {
    const owned = copyResource(resource, index);
    const expectedTexture = expected.get(owned.resourceRef);
    if (
      seen.has(owned.resourceRef) ||
      expectedTexture?.contentDigest !== owned.contentDigest ||
      expectedTexture.mimeType !== owned.mimeType
    ) {
      throw new Error(`Appearance resource ${index} is not bound to the document.`);
    }
    if (aggregateBytes > limits.maxTextureBytes - owned.bytes.byteLength) {
      throw new Error("Model appearance resources exceed maxTextureBytes.");
    }
    aggregateBytes += owned.bytes.byteLength;
    seen.add(owned.resourceRef);
    return owned;
  });
  if (seen.size !== expected.size) {
    throw new Error("Canonical texture manifest is missing appearance resources.");
  }
  return Object.freeze(
    snapshot.sort((left, right) =>
      compareToolcraftModelAppearanceResourceRefs(
        left.resourceRef,
        right.resourceRef,
      )
    ),
  );
}
