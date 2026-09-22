import { resolveRendererProviderDefinition, rendererProviderDependencyNames } from "../src/toolcraft/renderer-providers/provider-resolution.mjs";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { parseRendererProviderCatalog } from "../src/toolcraft/renderer-providers/provider-config.mjs";

const supportedProviderId = "vgpu";

async function importFromToolingDependency(
  specifier,
  { appRoot, dependencyName, dependencyRole },
) {
  if (dependencyRole !== "wgsl-tooling") {
    throw new TypeError('renderer Vite imports require dependencyRole "wgsl-tooling".');
  }
  if (
    specifier !== dependencyName &&
    !specifier.startsWith(`${dependencyName}/`)
  ) {
    throw new TypeError(
      `renderer Vite loader "${specifier}" must belong to ${dependencyName}.`,
    );
  }
  const appRequire = createRequire(path.join(appRoot, "package.json"));
  const resolvedSpecifier = appRequire.resolve(specifier);
  return import(pathToFileURL(resolvedSpecifier).href);
}

function assertRecord(value, field) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${field} must be an object.`);
  }
}

function getProviderDependency(provider, role) {
  return provider.dependencies.find((dependency) => dependency.role === role);
}

export async function loadToolcraftRendererVitePlugins({
  appRoot,
  importModule = importFromToolingDependency,
}) {
  const resolvedAppRoot = path.resolve(appRoot);
  const [catalogSource, packageSource] = await Promise.all([
    fs.readFile(
      path.join(
        resolvedAppRoot,
        "src/toolcraft/renderer-providers/catalog.json",
      ),
      "utf8",
    ),
    fs.readFile(path.join(resolvedAppRoot, "package.json"), "utf8"),
  ]);
  const catalog = parseRendererProviderCatalog(JSON.parse(catalogSource));
  const packageJson = JSON.parse(packageSource);
  assertRecord(packageJson, "packageJson");
  const dependencies = packageJson.dependencies ?? {};
  assertRecord(dependencies, "packageJson.dependencies");

  const enabledProviders = Object.entries(catalog.providers).map(([id, provider]) => [id, resolveRendererProviderDefinition(provider, packageJson)]).filter(
    ([, provider]) => {
      const runtimeDependency = getProviderDependency(provider, "runtime");
      return provider.resolutionPolicy === "latest-stable"
        ? rendererProviderDependencyNames.some((name) => Object.hasOwn(dependencies, name))
        : Object.hasOwn(dependencies, runtimeDependency.name);
    },
  );
  for (const [providerId, provider] of enabledProviders) {
    if (providerId !== supportedProviderId) {
      throw new TypeError(`Unknown enabled renderer provider "${providerId}".`);
    }
    if (provider.dependencies.length === 0) throw new Error("VGPU dependencies require verified app-local resolution; run toolcraft:renderer enable vgpu.");
    for (const dependency of provider.dependencies) {
      const actualVersion = dependencies[dependency.name];
      if (actualVersion !== dependency.version) {
        throw new TypeError(
          `packageJson.dependencies.${dependency.name} must equal approved version "${dependency.version}"; received ${JSON.stringify(actualVersion)}.`,
        );
      }
    }
  }

  const plugins = [];
  for (const [, provider] of enabledProviders) {
    const toolingDependency = getProviderDependency(provider, "wgsl-tooling");
    const importedModule = await importModule(provider.viteLoader, {
      appRoot: resolvedAppRoot,
      dependencyName: toolingDependency.name,
      dependencyRole: toolingDependency.role,
    });
    const factory =
      typeof importedModule.wgslVitePlugin === "function"
        ? importedModule.wgslVitePlugin
        : importedModule.default;
    if (typeof factory !== "function") {
      throw new TypeError(
        `${provider.viteLoader} must export a default or named "wgslVitePlugin" factory.`,
      );
    }
    const plugin = await factory();
    if (
      plugin === null ||
      typeof plugin !== "object" ||
      Array.isArray(plugin) ||
      typeof plugin.name !== "string" ||
      plugin.name.length === 0
    ) {
      throw new TypeError(
        `${provider.viteLoader} factory must return a plugin object with a non-empty string name.`,
      );
    }
    plugins.push(plugin);
  }

  return plugins;
}
