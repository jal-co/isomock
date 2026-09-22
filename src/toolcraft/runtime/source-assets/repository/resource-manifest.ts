export const TOOLCRAFT_RESOURCE_MANIFEST_VERSION = 1 as const;

export type ToolcraftResourceManifest = {
  readonly canonicalDocumentRefs: readonly string[];
  readonly derivedResourceRefs: readonly string[];
  readonly durableSourceRefs: readonly string[];
  readonly version: typeof TOOLCRAFT_RESOURCE_MANIFEST_VERSION;
};

export type ToolcraftResourceManifestInput = {
  canonicalDocumentRefs?: readonly string[];
  derivedResourceRefs?: readonly string[];
  durableSourceRefs?: readonly string[];
};

const MANIFEST_KEYS = [
  "canonicalDocumentRefs",
  "derivedResourceRefs",
  "durableSourceRefs",
  "version",
] as const;

function fail(reason: string): never {
  throw new Error(`Invalid Toolcraft resource manifest: ${reason}`);
}

function assertResourceRef(ref: unknown): asserts ref is string {
  if (typeof ref !== "string" || ref.length === 0 || ref.trim() !== ref) {
    fail("resource refs must be non-empty trimmed strings");
  }
}

function normalizeRefs(refs: readonly string[] | undefined): readonly string[] {
  if (refs !== undefined && !Array.isArray(refs)) {
    return fail("resource ref collections must be arrays");
  }
  const normalized = [...(refs ?? [])];
  for (const ref of normalized) {
    assertResourceRef(ref);
  }
  return Object.freeze([...new Set(normalized)].sort());
}

function parseCanonicalRefs(value: unknown, field: string): readonly string[] {
  if (!Array.isArray(value)) {
    return fail(`${field} must be an array`);
  }
  for (const ref of value) {
    assertResourceRef(ref);
  }

  const normalized = [...new Set(value)].sort();
  if (
    normalized.length !== value.length ||
    normalized.some((ref, index) => ref !== value[index])
  ) {
    return fail(`${field} must be sorted and deduplicated`);
  }
  return Object.freeze([...normalized]);
}

export function createToolcraftResourceManifest(
  input: ToolcraftResourceManifestInput,
): ToolcraftResourceManifest {
  return Object.freeze({
    canonicalDocumentRefs: normalizeRefs(input.canonicalDocumentRefs),
    derivedResourceRefs: normalizeRefs(input.derivedResourceRefs),
    durableSourceRefs: normalizeRefs(input.durableSourceRefs),
    version: TOOLCRAFT_RESOURCE_MANIFEST_VERSION,
  });
}

export function parseToolcraftResourceManifest(
  input: unknown,
): ToolcraftResourceManifest {
  let value = input;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value) as unknown;
    } catch {
      return fail("input is not valid JSON");
    }
  }

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return fail("input must be an object");
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (
    keys.length !== MANIFEST_KEYS.length ||
    MANIFEST_KEYS.some((key, index) => key !== keys[index])
  ) {
    return fail("input contains missing or unknown fields");
  }
  if (record.version !== TOOLCRAFT_RESOURCE_MANIFEST_VERSION) {
    return fail("version is unsupported");
  }

  return Object.freeze({
    canonicalDocumentRefs: parseCanonicalRefs(
      record.canonicalDocumentRefs,
      "canonicalDocumentRefs",
    ),
    derivedResourceRefs: parseCanonicalRefs(
      record.derivedResourceRefs,
      "derivedResourceRefs",
    ),
    durableSourceRefs: parseCanonicalRefs(
      record.durableSourceRefs,
      "durableSourceRefs",
    ),
    version: TOOLCRAFT_RESOURCE_MANIFEST_VERSION,
  });
}

export function serializeToolcraftResourceManifest(
  manifest: ToolcraftResourceManifest,
): string {
  return JSON.stringify(parseToolcraftResourceManifest(manifest));
}
