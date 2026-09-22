import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

function deepFreeze(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value)) {
      deepFreeze(nested);
    }
    Object.freeze(value);
  }
  return value;
}

export const syntheticCatalog = deepFreeze({
  schemaVersion: 2,
  providers: {
    vgpu: {
      approvedRelease: {
        adapterContractVersion: 1,
        commands: ["enable", "install", "wgsl-check", "delivery"],
        compatibilitySourceHash: "a".repeat(64),
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
        testedAt: "2026-08-30T00:00:00.000Z",
      },
      capability: "shader-webgpu-vgpu",
      requiredExports: [".", "./mock", "./node"],
      viteLoader: "@vgpu/wgsl/loader-vite",
    },
  },
});

export const syntheticDependencies = deepFreeze(
  Object.fromEntries(
    syntheticCatalog.providers.vgpu.approvedRelease.dependencies.map(
      ({ name, version }) => [name, version],
    ),
  ),
);

export const invalidDependencyValueCases = deepFreeze([
  {
    actualVersion: "<invalid:object>",
    createValue: () => ({ nested: { keepMutable: true } }),
    name: "object",
  },
  {
    actualVersion: "<invalid:array>",
    createValue: () => ["1.2.3"],
    name: "array",
  },
  {
    actualVersion: "<invalid:number>",
    createValue: () => 123,
    name: "number",
  },
  {
    actualVersion: "<invalid:null>",
    createValue: () => null,
    name: "null",
  },
]);

export function assertCallerPackageRemainsMutable(packageJson, value) {
  assert.equal(Object.isFrozen(packageJson), false);
  assert.equal(Object.isFrozen(packageJson.dependencies), false);
  assert.equal(packageJson.dependencies.vgpu, value);
  if (value !== null && typeof value === "object") {
    assert.equal(Object.isFrozen(value), false);
    if (!Array.isArray(value)) {
      assert.equal(Object.isFrozen(value.nested), false);
    }
  }
}

export function catalogWithDependency(role, changes) {
  return {
    ...syntheticCatalog,
    providers: {
      vgpu: {
        ...syntheticCatalog.providers.vgpu,
        approvedRelease: {
          ...syntheticCatalog.providers.vgpu.approvedRelease,
          dependencies:
            syntheticCatalog.providers.vgpu.approvedRelease.dependencies.map(
              (dependency) =>
                dependency.role === role
                  ? { ...dependency, ...changes }
                  : dependency,
            ),
        },
      },
    },
  };
}

export async function createTemporaryRendererProviderApp({
  integrityExitCode = 0,
} = {}) {
  const appRoot = await fs.mkdtemp(
    path.join(await fs.realpath(os.tmpdir()), "toolcraft-renderer-provider-"),
  );
  const catalogPath = path.join(
    appRoot,
    "src/toolcraft/renderer-providers/catalog.json",
  );
  const integrityScriptPath = path.join(
    appRoot,
    "scripts/check-toolcraft-integrity.mjs",
  );
  await fs.mkdir(path.dirname(catalogPath), { recursive: true });
  await fs.mkdir(path.dirname(integrityScriptPath), { recursive: true });
  await fs.writeFile(catalogPath, `${JSON.stringify(syntheticCatalog, null, 2)}\n`);
  await fs.writeFile(
    integrityScriptPath,
    [
      'import fs from "node:fs";',
      'import path from "node:path";',
      'const markerPath = path.join(process.cwd(), "integrity-ran");',
      'fs.writeFileSync(markerPath, JSON.stringify(process.argv.slice(2)));',
      `process.exitCode = ${integrityExitCode};`,
      "",
    ].join("\n"),
  );
  const packageJsonPath = path.join(appRoot, "package.json");
  await fs.writeFile(
    packageJsonPath,
    `${JSON.stringify(
      {
        dependencies: {},
        name: "temporary-app",
        private: true,
        scripts: {
          "toolcraft:renderer": "node scripts/toolcraft-renderer-provider.mjs",
        },
      },
      null,
      2,
    )}\n`,
  );
  return { appRoot, packageJsonPath };
}

export async function withTemporaryRendererProviderApp(options, callback) {
  const app = await createTemporaryRendererProviderApp(options);
  try {
    await callback(app);
  } finally {
    await fs.rm(app.appRoot, { force: true, recursive: true });
  }
}
