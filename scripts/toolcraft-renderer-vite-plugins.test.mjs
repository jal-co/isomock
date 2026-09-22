import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { fetchLatestRendererProviderRelease } from "./renderer-provider-registry-client.mjs";
import { rendererProviderActivationChecks } from "../src/toolcraft/renderer-providers/provider-resolution.mjs";
import { loadToolcraftRendererVitePlugins } from "./toolcraft-renderer-vite-plugins.mjs";

const execFileAsync = promisify(execFile);

const vgpuProvider = {
  adapterContractVersion: 1,
  capability: "shader-webgpu-vgpu",
  dependencies: [
    {
      integrity: "sha512-synthetic-runtime",
      name: "vgpu",
      role: "runtime",
      version: "1.2.3",
    },
    {
      integrity: "sha512-synthetic-wgsl",
      name: "@vgpu/wgsl",
      role: "wgsl-tooling",
      version: "1.2.3",
    },
  ],
  requiredExports: [".", "./mock", "./node"],
  viteLoader: "@vgpu/wgsl/loader-vite",
};

const vgpuDependencies = Object.fromEntries(
  vgpuProvider.dependencies.map(({ name, version }) => [name, version]),
);

function rawProvider(provider) {
  return {
    approvedRelease: provider.approvedRelease ?? {
      adapterContractVersion: provider.adapterContractVersion,
      commands: ["enable", "install", "wgsl-check", "delivery"],
      compatibilitySourceHash: "a".repeat(64),
      dependencies: provider.dependencies,
      testedAt: "2026-08-30T00:00:00.000Z",
    },
    capability: provider.capability,
    requiredExports: provider.requiredExports,
    viteLoader: provider.viteLoader,
  };
}

async function findOwningPackage(entryPath, expectedName) {
  let directory = path.dirname(entryPath);
  while (path.dirname(directory) !== directory) {
    const packagePath = path.join(directory, "package.json");
    try {
      const packageJson = JSON.parse(await fs.readFile(packagePath, "utf8"));
      if (packageJson.name === expectedName) {
        return { directory, packageJson };
      }
    } catch (error) {
      if (error?.code !== "ENOENT") {
        throw error;
      }
    }
    directory = path.dirname(directory);
  }
  throw new Error(`Could not find package ${expectedName} for ${entryPath}.`);
}

async function withTemporaryApp(
  { dependencies = {}, providers = { vgpu: vgpuProvider }, resolution },
  callback,
) {
  const appRoot = await fs.mkdtemp(
    path.join(await fs.realpath(os.tmpdir()), "toolcraft-renderer-vite-plugins-"),
  );
  try {
    const catalogPath = path.join(
      appRoot,
      "src/toolcraft/renderer-providers/catalog.json",
    );
    await fs.mkdir(path.dirname(catalogPath), { recursive: true });
    await Promise.all([
      fs.writeFile(
        catalogPath,
        `${JSON.stringify({
          providers: Object.fromEntries(
            Object.entries(providers).map(([id, provider]) => [id, resolution ? provider : rawProvider(provider)]),
          ),
          schemaVersion: resolution ? 3 : 2,
        }, null, 2)}\n`,
      ),
      fs.writeFile(
        path.join(appRoot, "package.json"),
        `${JSON.stringify({ dependencies, name: "temporary-app", private: true, ...(resolution ? { toolcraft: { rendererProviders: { vgpu: resolution } } } : {}) }, null, 2)}\n`,
      ),
    ]);
    await callback(appRoot);
  } finally {
    await fs.rm(appRoot, { force: true, recursive: true });
  }
}

test("neutral packages do not import or install renderer Vite plugins", async () => {
  await withTemporaryApp({}, async (appRoot) => {
    const imports = [];
    const plugins = await loadToolcraftRendererVitePlugins({
      appRoot,
      importModule: async (specifier) => {
        imports.push(specifier);
        return { default: () => ({ name: "unexpected" }) };
      },
    });

    assert.deepEqual(imports, []);
    assert.deepEqual(plugins, []);
  });
});

test("the exact VGPU pins load the catalog WGSL plugin", async () => {
  await withTemporaryApp({ dependencies: vgpuDependencies }, async (appRoot) => {
    const imports = [];
    const importContexts = [];
    const plugins = await loadToolcraftRendererVitePlugins({
      appRoot,
      importModule: async (specifier, context) => {
        imports.push(specifier);
        importContexts.push(context);
        return { default: () => ({ name: "vgpu-wgsl" }) };
      },
    });

    assert.deepEqual(imports, ["@vgpu/wgsl/loader-vite"]);
    assert.deepEqual(importContexts, [
      {
        appRoot,
        dependencyName: "@vgpu/wgsl",
        dependencyRole: "wgsl-tooling",
      },
    ]);
    assert.deepEqual(
      plugins.map((plugin) => plugin.name),
      ["vgpu-wgsl"],
    );
  });
});

test("the VGPU loader accepts the named WGSL factory", async () => {
  await withTemporaryApp({ dependencies: vgpuDependencies }, async (appRoot) => {
    const plugins = await loadToolcraftRendererVitePlugins({
      appRoot,
      importModule: async () => ({
        wgslVitePlugin: () => ({ name: "named-vgpu-wgsl" }),
      }),
    });

    assert.deepEqual(
      plugins.map((plugin) => plugin.name),
      ["named-vgpu-wgsl"],
    );
  });
});

test("the VGPU loader awaits an asynchronous WGSL factory", async () => {
  await withTemporaryApp({ dependencies: vgpuDependencies }, async (appRoot) => {
    const plugins = await loadToolcraftRendererVitePlugins({
      appRoot,
      importModule: async () => ({
        default: async () => ({ name: "async-vgpu-wgsl" }),
      }),
    });

    assert.deepEqual(
      plugins.map((plugin) => plugin.name),
      ["async-vgpu-wgsl"],
    );
  });
});

test("missing, ranged, and mismatched VGPU dependencies fail startup exactly", async () => {
  for (const dependency of vgpuProvider.dependencies) {
    const invalidVersions = [`^${dependency.version}`, "1.2.4"];
    if (dependency.role !== "runtime") {
      invalidVersions.unshift(undefined);
    }
    for (const version of invalidVersions) {
      const dependencies = { ...vgpuDependencies };
      if (version === undefined) {
        delete dependencies[dependency.name];
      } else {
        dependencies[dependency.name] = version;
      }
      await withTemporaryApp({ dependencies }, async (appRoot) => {
        await assert.rejects(
          loadToolcraftRendererVitePlugins({
            appRoot,
            importModule: async () => ({
              default: () => ({ name: "unused" }),
            }),
          }),
          new TypeError(
            `packageJson.dependencies.${dependency.name} must equal approved version "${dependency.version}"; received ${JSON.stringify(version)}.`,
          ),
        );
      });
    }
  }
});

test("enabled unknown catalog providers fail before importing modules", async () => {
  const imports = [];
  const providers = {
    custom: {
      ...vgpuProvider,
      viteLoader: "custom-renderer/vite",
    },
  };
  await withTemporaryApp(
    {
      dependencies: {
        ...vgpuDependencies,
      },
      providers,
    },
    async (appRoot) => {
      await assert.rejects(
        loadToolcraftRendererVitePlugins({
          appRoot,
          importModule: async (specifier) => {
            imports.push(specifier);
            return { default: () => ({ name: "unused" }) };
          },
        }),
        new TypeError('Unknown enabled renderer provider "custom".'),
      );
    },
  );
  assert.deepEqual(imports, []);
});

test("enabled VGPU rejects absent and non-function WGSL factories", async () => {
  for (const importedModule of [
    {},
    { default: true },
    { wgslVitePlugin: "plugin" },
  ]) {
    await withTemporaryApp(
      { dependencies: vgpuDependencies },
      async (appRoot) => {
        await assert.rejects(
          loadToolcraftRendererVitePlugins({
            appRoot,
            importModule: async () => importedModule,
          }),
          new TypeError(
            '@vgpu/wgsl/loader-vite must export a default or named "wgslVitePlugin" factory.',
          ),
        );
      },
    );
  }
});

test("enabled VGPU rejects every invalid WGSL factory result", async () => {
  for (const result of [
    undefined,
    null,
    true,
    1,
    "plugin",
    () => {},
    {},
    { name: "" },
  ]) {
    await withTemporaryApp(
      { dependencies: vgpuDependencies },
      async (appRoot) => {
        await assert.rejects(
          loadToolcraftRendererVitePlugins({
            appRoot,
            importModule: async () => ({ default: async () => result }),
          }),
          new TypeError(
            "@vgpu/wgsl/loader-vite factory must return a plugin object with a non-empty string name.",
          ),
        );
      },
    );
  }
});

test("module resolution failures remain visible", async () => {
  await withTemporaryApp(
    { dependencies: vgpuDependencies },
    async (appRoot) => {
      const resolutionFailure = new Error("synthetic module resolution failure");
      await assert.rejects(
        loadToolcraftRendererVitePlugins({
          appRoot,
          importModule: async () => {
            throw resolutionFailure;
          },
        }),
        (error) => error === resolutionFailure,
      );
    },
  );
});

test(
  "one pnpm install resolves the real loader and activated WGSL types",
  { skip: process.env.TOOLCRAFT_TEST_REAL_VGPU_INSTALL !== "1" },
  async () => {
    const productionCatalog = JSON.parse(await fs.readFile(
      new URL("../src/toolcraft/renderer-providers/catalog.json", import.meta.url),
      "utf8",
    ));
    const latest = await fetchLatestRendererProviderRelease({ packageName: "vgpu" });
    const resolution = {
      schemaVersion: 1, resolvedAt: new Date().toISOString(),
      compatibilitySourceHash: "a".repeat(64), checks: rendererProviderActivationChecks,
      dependencies: latest.providerDependencies,
    };
    const dependencies = Object.fromEntries(
      resolution.dependencies.map(
        ({ name, version }) => [name, version],
      ),
    );
    await withTemporaryApp(
      {
        dependencies,
        providers: productionCatalog.providers,
        resolution,
      },
      async (appRoot) => {
        await execFileAsync(
          "pnpm",
          ["install", "--ignore-scripts", "--reporter=silent"],
          { cwd: appRoot },
        );

        const provider = productionCatalog.providers.vgpu;
        const toolingDependency = resolution.dependencies.find(
          ({ role }) => role === "wgsl-tooling",
        );
        const appRequire = createRequire(path.join(appRoot, "package.json"));
        const directLoaderPath = appRequire.resolve(provider.viteLoader);
        const owningPackage = await findOwningPackage(
          directLoaderPath,
          toolingDependency.name,
        );
        assert.equal(owningPackage.packageJson.version, toolingDependency.version);
        assert.equal(
          path.relative(owningPackage.directory, directLoaderPath).startsWith(".."),
          false,
        );

        const plugins = await loadToolcraftRendererVitePlugins({ appRoot });

        assert.equal(plugins.length, 1);
        assert.equal(typeof plugins[0].name, "string");
        assert.notEqual(plugins[0].name.length, 0);

        const sourceRoot = path.join(appRoot, "src");
        await fs.mkdir(sourceRoot, { recursive: true });
        await Promise.all([
          fs.writeFile(
            path.join(sourceRoot, "activated-reference.ts"),
            [
              '/// <reference types="@vgpu/wgsl/wgsl-types" />',
              "export const activatedWgslTypes = true;",
              "",
            ].join("\n"),
          ),
          fs.writeFile(
            path.join(appRoot, "tsconfig.json"),
            `${JSON.stringify(
              {
                compilerOptions: {
                  module: "ESNext",
                  moduleResolution: "Bundler",
                  noEmit: true,
                  strict: true,
                  target: "ES2022",
                },
                include: ["src"],
              },
              null,
              2,
            )}\n`,
          ),
        ]);
        const packagePath = path.join(appRoot, "package.json");
        const packageJson = JSON.parse(await fs.readFile(packagePath, "utf8"));
        const typeScriptBin = await fs.realpath(
          new URL("../../node_modules/typescript/bin/tsc", import.meta.url),
        );
        await fs.writeFile(
          packagePath,
          `${JSON.stringify(
            {
              ...packageJson,
              scripts: {
                typecheck: `node ${JSON.stringify(typeScriptBin)} -p tsconfig.json`,
              },
            },
            null,
            2,
          )}\n`,
        );
        await execFileAsync("pnpm", ["typecheck"], { cwd: appRoot });
      },
    );
  },
);
