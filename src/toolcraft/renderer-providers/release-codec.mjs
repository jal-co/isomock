export const rendererProviderRuntimePackage = "vgpu";
export const rendererProviderToolingPackage = "@vgpu/wgsl";
export const rendererProviderFamilyNames = Object.freeze([
  "@vgpu/adapter-mock",
  "@vgpu/adapter-node",
  "@vgpu/core",
  "@vgpu/wgsl",
  "@vgpu/wgsl-std",
]);
export const rendererProviderRuntimeExports = Object.freeze([".", "./mock", "./node"]);
export const rendererProviderToolingExports = Object.freeze([
  ".",
  "./loader-vite",
  "./wgsl-types",
]);

const normalizedKeys = [
  "dependencies",
  "license",
  "providerDependencies",
  "requiredExports",
  "toolingRequiredExports",
];
const dependencyKeys = ["integrity", "name", "role", "version"];
const dependencyNames = [rendererProviderRuntimePackage, rendererProviderToolingPackage];
const dependencyRoles = ["runtime", "wgsl-tooling"];
const semverPattern =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/u;

function assertRecord(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
  return value;
}

function assertExactKeys(value, expected, label) {
  if (Object.keys(value).sort().join("\n") !== [...expected].sort().join("\n")) {
    throw new TypeError(`${label} must contain the exact normalized fields.`);
  }
}

function assertExactStrings(value, expected, label) {
  if (
    !Array.isArray(value) ||
    value.length !== expected.length ||
    value.some((item, index) => item !== expected[index])
  ) {
    throw new TypeError(`${label} must equal ${expected.join(", ")}.`);
  }
  return Object.freeze([...value]);
}

export function parseRendererProviderExactVersion(value, label = "version") {
  if (typeof value !== "string") {
    throw new TypeError(`${label} must be an exact SemVer 2.0.0 version.`);
  }
  const match = value.match(semverPattern);
  if (!match) {
    throw new TypeError(`${label} must be an exact SemVer 2.0.0 version.`);
  }
  const core = match.slice(1, 4).map(Number);
  const prerelease = match[4]?.split(".") ?? [];
  const build = match[5]?.split(".") ?? [];
  if (
    core.some((part) => !Number.isSafeInteger(part)) ||
    prerelease.some(
      (part) => /^\d+$/u.test(part) &&
        (part.length > 1 && part.startsWith("0") || !Number.isSafeInteger(Number(part))),
    ) ||
    build.some((part) => /^\d+$/u.test(part) && !Number.isSafeInteger(Number(part)))
  ) {
    throw new TypeError(`${label} must be an exact SemVer 2.0.0 version.`);
  }
  return Object.freeze({ core: Object.freeze(core), prerelease: Object.freeze(prerelease) });
}

export function compareRendererProviderVersions(left, right) {
  const leftVersion = parseRendererProviderExactVersion(left, "left version");
  const rightVersion = parseRendererProviderExactVersion(right, "right version");
  for (let index = 0; index < 3; index += 1) {
    if (leftVersion.core[index] !== rightVersion.core[index]) {
      return leftVersion.core[index] < rightVersion.core[index] ? -1 : 1;
    }
  }
  if (leftVersion.prerelease.length === 0 || rightVersion.prerelease.length === 0) {
    return leftVersion.prerelease.length === rightVersion.prerelease.length
      ? 0
      : leftVersion.prerelease.length === 0 ? 1 : -1;
  }
  const length = Math.max(leftVersion.prerelease.length, rightVersion.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const leftPart = leftVersion.prerelease[index];
    const rightPart = rightVersion.prerelease[index];
    if (leftPart === rightPart) continue;
    if (leftPart === undefined) return -1;
    if (rightPart === undefined) return 1;
    const leftNumeric = /^\d+$/u.test(leftPart);
    const rightNumeric = /^\d+$/u.test(rightPart);
    if (leftNumeric && rightNumeric) return Number(leftPart) < Number(rightPart) ? -1 : 1;
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
    return leftPart < rightPart ? -1 : 1;
  }
  return 0;
}

export function rendererProviderDependencyTuplesEqual(left, right) {
  return Array.isArray(left) &&
    Array.isArray(right) &&
    left.length === right.length &&
    left.every((dependency, index) =>
      dependencyKeys.every((field) => dependency?.[field] === right[index]?.[field]));
}

function parseDependencies(value) {
  if (
    !Array.isArray(value) ||
    value.length !== dependencyRoles.length ||
    value.some((item, index) =>
      item?.name !== dependencyNames[index] || item?.role !== dependencyRoles[index])
  ) {
    throw new TypeError("normalized providerDependencies must equal the ordered runtime/WGSL tuple.");
  }
  const parsed = value.map((item, index) => {
    assertRecord(item, `normalized providerDependencies[${index}]`);
    assertExactKeys(item, dependencyKeys, `normalized providerDependencies[${index}]`);
    if (typeof item.integrity !== "string" || !item.integrity.startsWith("sha512-")) {
      throw new TypeError(`normalized providerDependencies[${index}] integrity must be sha512.`);
    }
    parseRendererProviderExactVersion(item.version, `normalized providerDependencies[${index}] version`);
    return Object.freeze({ ...item });
  });
  if (parsed[0].version !== parsed[1].version) {
    throw new TypeError("normalized providerDependencies versions must be aligned.");
  }
  return Object.freeze(parsed);
}

function parsePublishedAt(value) {
  const parsed = typeof value === "string" ? Date.parse(value) : Number.NaN;
  const canonical = value?.includes(".") ? value : value?.replace("Z", ".000Z");
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== canonical) {
    throw new TypeError(
      "normalized latest release publishedAt publish time is missing or invalid.",
    );
  }
  return value;
}

export function parseRendererProviderNormalizedRelease(value) {
  const release = assertRecord(value, "normalized release");
  const hasPublishedAt = Object.hasOwn(release, "publishedAt");
  assertExactKeys(
    release,
    hasPublishedAt ? [...normalizedKeys, "publishedAt"] : normalizedKeys,
    "normalized release",
  );
  if (release.license !== "MIT") {
    throw new TypeError("normalized release license must equal MIT.");
  }
  const providerDependencies = parseDependencies(release.providerDependencies);
  const version = providerDependencies[0].version;
  const family = assertRecord(release.dependencies, "normalized VGPU family versions");
  assertExactKeys(family, rendererProviderFamilyNames, "normalized VGPU family versions");
  const dependencies = Object.freeze(Object.fromEntries(
    rendererProviderFamilyNames.map((name) => {
      if (family[name] !== version) {
        throw new TypeError(`normalized VGPU family version ${name} must equal ${version}.`);
      }
      return [name, version];
    }),
  ));
  const parsed = {
    dependencies,
    license: "MIT",
    providerDependencies,
    requiredExports: assertExactStrings(
      release.requiredExports,
      rendererProviderRuntimeExports,
      "normalized runtime exports",
    ),
    toolingRequiredExports: assertExactStrings(
      release.toolingRequiredExports,
      rendererProviderToolingExports,
      "normalized WGSL tooling exports",
    ),
  };
  if (hasPublishedAt) parsed.publishedAt = parsePublishedAt(release.publishedAt);
  return Object.freeze(parsed);
}
