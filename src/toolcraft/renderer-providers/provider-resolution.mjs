import { parseRendererProviderExactVersion } from "./release-codec.mjs";

export const rendererProviderActivationChecks = Object.freeze([
  "wgsl-check", "adapter-types", "adapter-tests", "surface-browser",
]);
export const rendererProviderDependencyNames = Object.freeze(["vgpu", "@vgpu/wgsl"]);

function closedRecord(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).sort().join() !== [...keys].sort().join()) {
    throw new TypeError(`${label} must contain exactly ${keys.join(", ")}.`);
  }
}

export function parseVersionlessRendererProvider(value) {
  closedRecord(value, ["adapterContractVersion", "capability", "requiredExports", "resolutionPolicy", "viteLoader"], "provider descriptor");
  if (value.adapterContractVersion !== 1 || value.capability !== "shader-webgpu-vgpu" ||
      value.resolutionPolicy !== "latest-stable" || value.viteLoader !== "@vgpu/wgsl/loader-vite" ||
      JSON.stringify(value.requiredExports) !== JSON.stringify([".", "./mock", "./node"])) {
    throw new TypeError("Unsupported versionless VGPU descriptor.");
  }
  return Object.freeze({ ...value, requiredExports: Object.freeze([...value.requiredExports]),
    approvedRelease: null, dependencies: Object.freeze([]) });
}

export function parseRendererProviderResolution(value) {
  closedRecord(value, ["schemaVersion", "resolvedAt", "compatibilitySourceHash", "dependencies", "checks"], "app renderer resolution");
  if (value.schemaVersion !== 1 || !/^[a-f0-9]{64}$/u.test(value.compatibilitySourceHash) ||
      !Number.isFinite(Date.parse(value.resolvedAt)) || new Date(value.resolvedAt).toISOString() !== value.resolvedAt ||
      JSON.stringify(value.checks) !== JSON.stringify(rendererProviderActivationChecks)) {
    throw new TypeError("Invalid app renderer compatibility record.");
  }
  if (!Array.isArray(value.dependencies) || value.dependencies.length !== 2) {
    throw new TypeError("App renderer resolution requires both dependency roles.");
  }
  const dependencies = value.dependencies.map((entry, index) => {
    closedRecord(entry, ["name", "role", "version", "integrity"], "app renderer dependency");
    if (entry.name !== rendererProviderDependencyNames[index] || entry.role !== ["runtime", "wgsl-tooling"][index] ||
        typeof entry.integrity !== "string" || !entry.integrity.startsWith("sha512-") ||
        parseRendererProviderExactVersion(entry.version).prerelease.length) {
      throw new TypeError("App renderer dependencies require exact stable versions and integrities.");
    }
    return Object.freeze({ ...entry });
  });
  if (dependencies[0].version !== dependencies[1].version) throw new TypeError("VGPU dependency roles must be aligned.");
  return Object.freeze({ ...value, dependencies: Object.freeze(dependencies), checks: rendererProviderActivationChecks });
}

export function resolveRendererProviderDefinition(provider, packageJson) {
  if (provider.resolutionPolicy !== "latest-stable") return provider;
  const raw = packageJson.toolcraft?.rendererProviders?.vgpu;
  if (!raw) return provider;
  const resolution = parseRendererProviderResolution(raw);
  return Object.freeze({ ...provider, dependencies: resolution.dependencies, resolution });
}
