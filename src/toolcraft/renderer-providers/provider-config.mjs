import { parseVersionlessRendererProvider, resolveRendererProviderDefinition, rendererProviderDependencyNames } from "./provider-resolution.mjs";
import { inspectRendererProviderDependencies } from "./provider-dependency-inspection.mjs";
const catalogKeys = ["providers", "schemaVersion"];
const providerKeys = [
  "approvedRelease",
  "capability",
  "requiredExports",
  "viteLoader",
];
const approvedReleaseKeys = [
  "adapterContractVersion",
  "commands",
  "compatibilitySourceHash",
  "dependencies",
  "testedAt",
];
const dependencyKeys = ["integrity", "name", "role", "version"];
const dependencyRoles = ["runtime", "wgsl-tooling"];
const dependencyNames = ["vgpu", "@vgpu/wgsl"];
const exactSemver =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

export const rendererProviderCompatibilityCommandIds = Object.freeze([
  "enable",
  "install",
  "wgsl-check",
  "delivery",
]);
function assertRecord(value, path) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${path} must be an object.`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${path} must be an object.`);
  }
}
function assertClosedKeys(value, allowedKeys, path) {
  for (const key of Object.keys(value)) {
    if (!allowedKeys.includes(key)) {
      throw new TypeError(`${path} contains unsupported key "${key}".`);
    }
  }
  for (const key of allowedKeys) {
    if (!Object.hasOwn(value, key)) {
      throw new TypeError(`${path}.${key} is required.`);
    }
  }
}
function assertNonEmptyString(value, path) {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${path} must be a non-empty string.`);
  }
}
function assertSortedUniqueStrings(value, path) {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some((item) => typeof item !== "string" || item.length === 0)
  ) {
    throw new TypeError(`${path} must be a non-empty array of strings.`);
  }
  if (new Set(value).size !== value.length) {
    throw new TypeError(`${path} must not contain duplicate values.`);
  }
  if (value.some((item, index) => index > 0 && value[index - 1] > item)) {
    throw new TypeError(`${path} must be sorted.`);
  }
}
function deepFreeze(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) {
      deepFreeze(nested);
    }
    Object.freeze(value);
  }
  return value;
}

function parseDependencies(value, path) {
  if (
    !Array.isArray(value) ||
    value.length !== dependencyRoles.length ||
    value.some(
      (dependency, index) =>
        dependency?.role !== dependencyRoles[index] ||
        dependency?.name !== dependencyNames[index],
    )
  ) {
    throw new TypeError(
      `${path} must equal the ordered runtime:vgpu and wgsl-tooling:@vgpu/wgsl tuple.`,
    );
  }
  const dependencies = value.map((dependency, index) => {
    const dependencyPath = `${path}[${index}]`;
    assertRecord(dependency, dependencyPath);
    assertClosedKeys(dependency, dependencyKeys, dependencyPath);
    assertNonEmptyString(dependency.integrity, `${dependencyPath}.integrity`);
    if (!dependency.integrity.startsWith("sha512-")) {
      throw new TypeError(`${dependencyPath}.integrity must begin with sha512-.`);
    }
    if (
      typeof dependency.version !== "string" ||
      !exactSemver.test(dependency.version)
    ) {
      throw new TypeError(
        `${dependencyPath}.version must be an exact semver; received ${JSON.stringify(dependency.version)}.`,
      );
    }
    return {
      integrity: dependency.integrity,
      name: dependency.name,
      role: dependency.role,
      version: dependency.version,
    };
  });
  if (dependencies[0].version !== dependencies[1].version) {
    throw new TypeError(`${path} versions must be aligned.`);
  }
  return dependencies;
}

export function parseRendererProviderApprovedRelease(value, path = "approvedRelease") {
  assertRecord(value, path);
  assertClosedKeys(value, approvedReleaseKeys, path);
  if (
    value.adapterContractVersion !== 1
  ) {
    throw new TypeError(`${path}.adapterContractVersion must equal 1.`);
  }
  if (
    !Array.isArray(value.commands) ||
    value.commands.length !== rendererProviderCompatibilityCommandIds.length ||
    value.commands.some(
      (command, index) => command !== rendererProviderCompatibilityCommandIds[index],
    )
  ) {
    throw new TypeError(`${path}.commands must equal the compatibility command ids.`);
  }
  if (!/^[a-f0-9]{64}$/u.test(value.compatibilitySourceHash)) {
    throw new TypeError(`${path}.compatibilitySourceHash must be a SHA-256 hex digest.`);
  }
  const parsedTime =
    typeof value.testedAt === "string" ? Date.parse(value.testedAt) : NaN;
  if (!Number.isFinite(parsedTime) || new Date(parsedTime).toISOString() !== value.testedAt) {
    throw new TypeError(`${path}.testedAt must be a canonical ISO-8601 timestamp.`);
  }
  return deepFreeze({
    adapterContractVersion: value.adapterContractVersion,
    commands: [...value.commands],
    compatibilitySourceHash: value.compatibilitySourceHash,
    dependencies: parseDependencies(value.dependencies, `${path}.dependencies`),
    testedAt: value.testedAt,
  });
}

function parseProvider(value, path) {
  assertRecord(value, path);
  assertClosedKeys(value, providerKeys, path);
  const approvedRelease = parseRendererProviderApprovedRelease(
    value.approvedRelease,
    `${path}.approvedRelease`,
  );
  assertNonEmptyString(value.capability, `${path}.capability`);
  assertSortedUniqueStrings(value.requiredExports, `${path}.requiredExports`);
  assertNonEmptyString(value.viteLoader, `${path}.viteLoader`);

  return {
    adapterContractVersion: approvedRelease.adapterContractVersion,
    approvedRelease,
    capability: value.capability,
    dependencies: approvedRelease.dependencies,
    requiredExports: [...value.requiredExports],
    viteLoader: value.viteLoader,
  };
}

export function parseRendererProviderCatalog(value) {
  assertRecord(value, "catalog");
  assertClosedKeys(value, catalogKeys, "catalog");
  if (value.schemaVersion !== 2 && value.schemaVersion !== 3) {
    throw new TypeError("catalog.schemaVersion must equal 2 or 3.");
  }
  assertRecord(value.providers, "catalog.providers");
  const providerIds = Object.keys(value.providers);
  if (providerIds.length === 0) {
    throw new TypeError("catalog.providers must not be empty.");
  }
  if (providerIds.some((id, index) => index > 0 && providerIds[index - 1] > id)) {
    throw new TypeError("catalog.providers keys must be sorted.");
  }

  const providers = Object.fromEntries(
    providerIds.map((providerId) => {
      if (!/^[a-z0-9][a-z0-9-]*$/.test(providerId)) {
        throw new TypeError(`catalog.providers contains invalid id "${providerId}".`);
      }
      return [
        providerId,
        value.schemaVersion === 3
          ? parseVersionlessRendererProvider(value.providers[providerId])
          : parseProvider(value.providers[providerId], `catalog.providers.${providerId}`),
      ];
    }),
  );

  return deepFreeze({ schemaVersion: value.schemaVersion, providers });
}

function parseRendererProviderInput(input) {
  assertRecord(input, "input");
  assertClosedKeys(input, ["catalog", "packageJson", "providerId"], "input");
  const catalog = parseRendererProviderCatalog(input.catalog);
  if (typeof input.providerId !== "string") {
    throw new TypeError("input.providerId must be a string.");
  }
  if (!Object.hasOwn(catalog.providers, input.providerId)) {
    throw new TypeError(`Unknown renderer provider "${input.providerId}".`);
  }
  assertRecord(input.packageJson, "packageJson");
  const provider = resolveRendererProviderDefinition(catalog.providers[input.providerId], input.packageJson);
  const dependencies = input.packageJson.dependencies ?? {};
  assertRecord(dependencies, "packageJson.dependencies");

  return { dependencies, provider };
}

export function inspectRendererProvider(input) {
  const { dependencies, provider } = parseRendererProviderInput(input);
  if (provider.resolutionPolicy === "latest-stable" && provider.dependencies.length === 0) {
    const present = rendererProviderDependencyNames.some((name) => Object.hasOwn(dependencies, name));
    return deepFreeze({ provider, providerId: input.providerId, status: present ? "drifted" : "absent",
      errors: present ? ["VGPU dependencies have no verified app-local resolution. Run toolcraft:renderer enable vgpu."] : [],
      missingDependencies: [], mismatchedDependencies: [] });
  }
  return deepFreeze({
    ...inspectRendererProviderDependencies({ dependencies, provider }),
    provider,
    providerId: input.providerId,
  });
}

export function enableRendererProvider(input) {
  const inspection = inspectRendererProvider(input);
  if (inspection.provider.resolutionPolicy === "latest-stable" && inspection.provider.dependencies.length === 0) {
    throw new TypeError("VGPU activation requires automatic latest-stable resolution and compatibility checks.");
  }
  const conflict = inspection.mismatchedDependencies[0];
  if (conflict) {
    throw new TypeError(conflict.error);
  }

  const changed = inspection.status !== "exact";
  const dependencies = input.packageJson.dependencies ?? {};
  const packageJson = changed
    ? {
        ...structuredClone(input.packageJson),
        dependencies: {
          ...structuredClone(dependencies),
          ...Object.fromEntries(
            inspection.provider.dependencies.map(({ name, version }) => [
              name,
              version,
            ]),
          ),
        },
      }
    : structuredClone(input.packageJson);

  return deepFreeze({ changed, packageJson });
}
