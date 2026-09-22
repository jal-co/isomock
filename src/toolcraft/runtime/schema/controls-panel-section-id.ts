import type {
  ResolvedToolcraftControlSectionSchema,
  ToolcraftControlSchema,
  ToolcraftControlSectionSchema,
} from "./types";

const runtimeSectionIdPrefix = "runtime.";
const splitSectionIdMarker = ".part-";
const internalToolcraftSectionIds = new WeakMap<object, string>();

// Authored IDs are lowercase ASCII segments separated by one dot, underscore, or hyphen.
const stableSectionIdPattern = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/u;

function compareSectionIdentity(left: string, right: string): number {
  if (left === right) {
    return 0;
  }

  return left < right ? -1 : 1;
}

function normalizeSectionIdPart(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "");

  return normalized || "section";
}

function hashSectionIdentity(value: string): string {
  let hash = 0x811c9dc5;

  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(36);
}

function getControlIdentitySeed(
  entries: readonly [string, ToolcraftControlSchema][],
): string {
  const sortedSeeds = entries
    .map(([controlId, control]) => control.target.trim() || controlId.trim())
    .sort(compareSectionIdentity);

  return sortedSeeds.length > 0 ? JSON.stringify(sortedSeeds) : "";
}

function getSectionIdentityLabel(
  entries: readonly [string, ToolcraftControlSchema][],
  fallbackTitle?: string,
): string {
  const [firstControlId, firstControl] = [...entries].sort(
    ([leftId, leftControl], [rightId, rightControl]) =>
      compareSectionIdentity(
        leftControl.target.trim() || leftId,
        rightControl.target.trim() || rightId,
      ),
  )[0] ?? ["", undefined];
  const authoredIdentity =
    firstControl?.target || firstControlId || fallbackTitle || "section";

  return normalizeSectionIdPart(authoredIdentity);
}

function isSectionIdNamespace(id: string, prefix: string): boolean {
  return id === prefix.slice(0, -1) || id.startsWith(prefix);
}

function isStableSectionId(id: string): boolean {
  return stableSectionIdPattern.test(id);
}

function isInternallyGeneratedSectionId(
  section: ToolcraftControlSectionSchema,
): boolean {
  return (
    section.id !== undefined &&
    internalToolcraftSectionIds.get(section) === section.id
  );
}

function getReservedSectionIdNamespace(id: string): string | null {
  if (isSectionIdNamespace(id, runtimeSectionIdPrefix)) {
    return "runtime";
  }

  if (isSectionIdNamespace(id, "legacy.")) {
    return "legacy";
  }

  return id.includes(splitSectionIdMarker) ? "internally derived" : null;
}

export function normalizeExplicitToolcraftControlSectionId(id: string): string {
  if (!isStableSectionId(id)) {
    throw new Error(
      `Toolcraft control section id ${JSON.stringify(id)} is invalid. Use lowercase ASCII segments separated by a single dot, underscore, or hyphen.`,
    );
  }

  const reservedNamespace = getReservedSectionIdNamespace(id);

  if (reservedNamespace) {
    throw new Error(
      `Toolcraft control section id "${id}" uses the reserved ${reservedNamespace} namespace.`,
    );
  }

  return id;
}

export function registerToolcraftInternalControlSection<
  TSection extends { id: string },
>(section: TSection): TSection {
  internalToolcraftSectionIds.set(section, section.id);
  return section;
}

export function preserveToolcraftInternalControlSectionRegistration<
  TSection extends object,
>(source: object, section: TSection): TSection {
  const sourceId = (source as { id?: unknown }).id;
  const sectionId = (section as { id?: unknown }).id;

  if (
    typeof sourceId === "string" &&
    sourceId === sectionId &&
    internalToolcraftSectionIds.get(source) === sourceId
  ) {
    internalToolcraftSectionIds.set(section, sourceId);
  }

  return section;
}

export function resolveToolcraftControlSectionId(
  section: ToolcraftControlSectionSchema,
): string {
  if (section.id === undefined) {
    throw new Error(
      "Toolcraft product-authored control sections require an explicit stable id.",
    );
  }

  if (!isStableSectionId(section.id)) {
    return normalizeExplicitToolcraftControlSectionId(section.id);
  }

  const reservedNamespace = getReservedSectionIdNamespace(section.id);

  if (!reservedNamespace) {
    return section.id;
  }

  if (isInternallyGeneratedSectionId(section)) {
    return section.id;
  }

  throw new Error(
    `Toolcraft control section id "${section.id}" uses the reserved ${reservedNamespace} namespace without a matching internal runtime identity.`,
  );
}

export function deriveSplitToolcraftControlSectionId(
  parentId: string,
  entries: readonly [string, ToolcraftControlSchema][],
): string {
  const seed = getControlIdentitySeed(entries) || "section";
  const label = getSectionIdentityLabel(entries);

  return `${parentId}.part-${label}-${hashSectionIdentity(seed)}`;
}

export function assertUniqueToolcraftControlSectionIds(
  sections: readonly Pick<ResolvedToolcraftControlSectionSchema, "id">[],
): void {
  const seenIds = new Set<string>();

  for (const section of sections) {
    if (seenIds.has(section.id)) {
      throw new Error(`Duplicate control section id "${section.id}".`);
    }

    seenIds.add(section.id);
  }
}
