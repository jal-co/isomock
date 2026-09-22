import {
  compareRendererProviderVersions,
  parseRendererProviderExactVersion,
  parseRendererProviderNormalizedRelease,
  rendererProviderDependencyTuplesEqual,
  rendererProviderFamilyNames,
  rendererProviderRuntimeExports,
  rendererProviderRuntimePackage,
  rendererProviderToolingExports,
  rendererProviderToolingPackage,
} from "./renderer-provider-release-codec.mjs";

export {
  compareRendererProviderVersions,
  parseRendererProviderNormalizedRelease,
  rendererProviderDependencyTuplesEqual,
};

const registryOrigin = "https://registry.npmjs.org/";
const runtimePackage = rendererProviderRuntimePackage;
const toolingPackage = rendererProviderToolingPackage;
const adapterNodePackage = "@vgpu/adapter-node";
const adapterNodePostinstall =
  "node -e \"import('./dist/postinstall.js').catch(() => {})\"";
const runtimeFamily = rendererProviderFamilyNames;
const runtimeExports = rendererProviderRuntimeExports;
const toolingExports = rendererProviderToolingExports;

function assertRecord(value, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object.`);
  }
  return value;
}

async function fetchRegistryJson(fetchImpl, packageName, version) {
  if (typeof fetchImpl !== "function") {
    throw new TypeError("fetchImpl must be a function.");
  }
  const suffix = version === undefined ? "" : `${encodeURIComponent(version)}/`;
  const url = new URL(`${encodeURIComponent(packageName)}/${suffix}`, registryOrigin);
  let response;
  try {
    response = await fetchImpl(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    throw new Error(`npm registry request failed for ${url.href}.`, {
      cause: error,
    });
  }
  if (response === null || typeof response !== "object") {
    throw new TypeError("npm registry fetch must return a response object.");
  }
  if (response.ok !== true) {
    throw new Error(
      `npm registry returned ${response.status ?? "unknown"} ${response.statusText ?? ""} for ${url.href}.`.trim(),
    );
  }
  let value;
  try {
    value = await response.json();
  } catch (error) {
    throw new TypeError(`npm registry response for ${url.href} is not JSON.`, {
      cause: error,
    });
  }
  return assertRecord(value, "npm registry response");
}

function assertLifecycleScripts(document, packageName) {
  const scripts = document.scripts === undefined
    ? {}
    : assertRecord(document.scripts, `${packageName} scripts`);
  for (const lifecycle of ["preinstall", "install", "postinstall"]) {
    if (Object.hasOwn(scripts, lifecycle)) {
      throw new Error(`${packageName} must not declare ${lifecycle}.`);
    }
  }
}

function assertPackageIdentity(document, name, version) {
  if (document.name !== name) {
    throw new Error(`Registry metadata expected package ${name}.`);
  }
  parseRendererProviderExactVersion(document.version, `${name} returned version`);
  if (document.version !== version) {
    throw new Error(`${name} returned version ${document.version}; expected ${version}.`);
  }
  if (document.license !== "MIT") {
    throw new Error(`${name} must retain the MIT license.`);
  }
}

function assertPackage(document, { exports, name, version }) {
  assertPackageIdentity(document, name, version);
  const packageExports = assertRecord(document.exports, `${name} exports`);
  for (const requiredExport of exports) {
    if (!Object.hasOwn(packageExports, requiredExport)) {
      throw new Error(`${name} must export ${requiredExport}.`);
    }
  }
  const dist = assertRecord(document.dist, `${name} dist`);
  if (typeof dist.integrity !== "string" || !dist.integrity.startsWith("sha512-")) {
    throw new Error(`${name} must publish a sha512 integrity.`);
  }
  assertLifecycleScripts(document, name);
  return dist.integrity;
}

function assertFamilyDependencies(document, expectedNames, version, label) {
  const dependencies = assertRecord(document.dependencies, `${label} dependencies`);
  const names = Object.keys(dependencies)
    .filter((name) => name.startsWith("@vgpu/"))
    .sort();
  if (names.join("\n") !== [...expectedNames].sort().join("\n")) {
    throw new Error(`${label} must declare the exact @vgpu family dependencies.`);
  }
  for (const name of names) {
    if (dependencies[name] !== version) {
      throw new Error(`${label} dependency ${name} must equal candidate ${version}.`);
    }
  }
  return Object.freeze(
    Object.fromEntries(names.map((name) => [name, dependencies[name]])),
  );
}

function assertAdapterNode(document, version) {
  assertPackageIdentity(document, adapterNodePackage, version);
  const scripts = assertRecord(document.scripts, `${adapterNodePackage} scripts`);
  for (const lifecycle of ["preinstall", "install"]) {
    if (Object.hasOwn(scripts, lifecycle)) {
      throw new Error(`${adapterNodePackage} must not declare ${lifecycle}.`);
    }
  }
  if (scripts.postinstall !== adapterNodePostinstall) {
    throw new Error(
      `${adapterNodePackage} Dawn postinstall changed; review it and update the allowlist deliberately.`,
    );
  }
  assertFamilyDependencies(document, ["@vgpu/core"], version, adapterNodePackage);
}

function assertProviderName(packageName) {
  if (packageName !== runtimePackage) {
    throw new TypeError(`packageName must be ${runtimePackage}.`);
  }
}

export async function fetchRendererProviderRelease({ fetchImpl = fetch, packageName, version }) {
  assertProviderName(packageName);
  parseRendererProviderExactVersion(version, "requested version");
  const [runtime, tooling, adapterNode] = await Promise.all([
    fetchRegistryJson(fetchImpl, runtimePackage, version),
    fetchRegistryJson(fetchImpl, toolingPackage, version),
    fetchRegistryJson(fetchImpl, adapterNodePackage, version),
  ]);
  const runtimeIntegrity = assertPackage(runtime, {
    exports: runtimeExports,
    name: runtimePackage,
    version,
  });
  const toolingIntegrity = assertPackage(tooling, {
    exports: toolingExports,
    name: toolingPackage,
    version,
  });
  const dependencies = assertFamilyDependencies(runtime, runtimeFamily, version, runtimePackage);
  assertFamilyDependencies(tooling, ["@vgpu/wgsl-std"], version, toolingPackage);
  assertAdapterNode(adapterNode, version);
  return parseRendererProviderNormalizedRelease({
    dependencies,
    license: "MIT",
    providerDependencies: [
      { integrity: runtimeIntegrity, name: runtimePackage, role: "runtime", version },
      { integrity: toolingIntegrity, name: toolingPackage, role: "wgsl-tooling", version },
    ],
    requiredExports: runtimeExports,
    toolingRequiredExports: toolingExports,
  });
}

export async function fetchLatestRendererProviderRelease({ fetchImpl = fetch, packageName }) {
  assertProviderName(packageName);
  const document = await fetchRegistryJson(fetchImpl, packageName);
  if (document.name !== packageName) {
    throw new Error(`${packageName} latest registry document has the wrong package name.`);
  }
  const distTags = assertRecord(document["dist-tags"], `${packageName} dist-tags`);
  const version = distTags.latest;
  parseRendererProviderExactVersion(version, `${packageName} latest tag`);
  const times = assertRecord(document.time, `${packageName} publish times`);
  const publishedAt = times[version];
  const release = await fetchRendererProviderRelease({ fetchImpl, packageName, version });
  return parseRendererProviderNormalizedRelease({ ...release, publishedAt });
}
