import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";

import {
  enableRendererProvider,
  inspectRendererProvider,
  parseRendererProviderCatalog,
  rendererProviderCompatibilityCommandIds,
} from "../src/toolcraft/renderer-providers/provider-config.mjs";
import {
  assertCallerPackageRemainsMutable,
  catalogWithDependency,
  invalidDependencyValueCases,
  syntheticCatalog,
  syntheticDependencies,
} from "./toolcraft-renderer-provider-test-helpers.mjs";

const syntheticProvider = parseRendererProviderCatalog(
  syntheticCatalog,
).providers.vgpu;

test("provider compatibility command ids are the closed frozen sequence", () => {
  assert.deepEqual(rendererProviderCompatibilityCommandIds, [
    "enable",
    "install",
    "wgsl-check",
    "delivery",
  ]);
  assert.equal(Object.isFrozen(rendererProviderCompatibilityCommandIds), true);
});

test("catalog parser returns a stable deeply immutable provider view", () => {
  assert.equal(Object.isFrozen(syntheticCatalog), true);
  assert.equal(Object.isFrozen(syntheticCatalog.providers), true);
  assert.equal(
    Object.isFrozen(syntheticCatalog.providers.vgpu.approvedRelease.dependencies),
    true,
  );
  assert.equal(
    Object.isFrozen(syntheticCatalog.providers.vgpu.approvedRelease.dependencies[0]),
    true,
  );
  assert.equal(Object.isFrozen(syntheticDependencies), true);
  assert.equal(Object.isFrozen(invalidDependencyValueCases), true);
  assert.equal(Object.isFrozen(invalidDependencyValueCases[0]), true);
  const parsed = parseRendererProviderCatalog(syntheticCatalog);

  assert.equal(parsed.schemaVersion, 2);
  assert.deepEqual(parsed.providers.vgpu, syntheticProvider);
  assert.equal(Object.isFrozen(parsed), true);
  assert.equal(Object.isFrozen(parsed.providers), true);
  assert.equal(Object.isFrozen(parsed.providers.vgpu), true);
  assert.equal(Object.isFrozen(parsed.providers.vgpu.dependencies), true);
  assert.equal(Object.isFrozen(parsed.providers.vgpu.dependencies[0]), true);
  assert.equal(Object.isFrozen(parsed.providers.vgpu.requiredExports), true);
  assert.equal(
    parsed.providers.vgpu.adapterContractVersion,
    parsed.providers.vgpu.approvedRelease.adapterContractVersion,
  );
  assert.equal(
    parsed.providers.vgpu.dependencies,
    parsed.providers.vgpu.approvedRelease.dependencies,
  );
});

test("production provider catalog is semantically valid", async () => {
  const source = await fs.readFile(
    new URL("../src/toolcraft/renderer-providers/catalog.json", import.meta.url),
    "utf8",
  );
  const parsed = parseRendererProviderCatalog(JSON.parse(source));

  assert.equal(Object.keys(parsed.providers).length > 0, true);
  assert.equal(Object.isFrozen(parsed), true);
});

test("provider inspection returns closed frozen absent exact and drifted states", () => {
  const input = {
    catalog: syntheticCatalog,
    providerId: "vgpu",
  };
  const absentPackage = { dependencies: {}, name: "absent-app" };
  const absentSource = JSON.stringify(absentPackage);
  const absent = inspectRendererProvider({
    ...input,
    packageJson: absentPackage,
  });

  assert.deepEqual(absent, {
    errors: [],
    mismatchedDependencies: [],
    missingDependencies: syntheticProvider.dependencies,
    provider: syntheticProvider,
    providerId: "vgpu",
    status: "absent",
  });
  assert.deepEqual(Object.keys(absent).sort(), [
    "errors",
    "mismatchedDependencies",
    "missingDependencies",
    "provider",
    "providerId",
    "status",
  ]);
  assert.equal(JSON.stringify(absentPackage), absentSource);

  const exactPackage = {
    dependencies: syntheticDependencies,
    name: "exact-app",
  };
  const exactSource = JSON.stringify(exactPackage);
  const exact = inspectRendererProvider({
    ...input,
    packageJson: exactPackage,
  });
  assert.deepEqual(exact, {
    errors: [],
    mismatchedDependencies: [],
    missingDependencies: [],
    provider: syntheticProvider,
    providerId: "vgpu",
    status: "exact",
  });
  assert.equal(JSON.stringify(exactPackage), exactSource);

  const driftedPackage = {
    dependencies: { vgpu: "^1.2.3" },
    name: "drifted-app",
  };
  const driftedSource = JSON.stringify(driftedPackage);
  const drifted = inspectRendererProvider({
    ...input,
    packageJson: driftedPackage,
  });
  assert.deepEqual(drifted, {
    errors: [
      'packageJson.dependencies.vgpu must equal approved version "1.2.3"; received "^1.2.3".',
      'packageJson.dependencies.@vgpu/wgsl must equal approved version "1.2.3"; received undefined.',
    ],
    mismatchedDependencies: [
      {
        actualVersion: "^1.2.3",
        dependency: syntheticProvider.dependencies[0],
        error:
          'packageJson.dependencies.vgpu must equal approved version "1.2.3"; received "^1.2.3".',
      },
    ],
    missingDependencies: [syntheticProvider.dependencies[1]],
    provider: syntheticProvider,
    providerId: "vgpu",
    status: "drifted",
  });
  assert.equal(JSON.stringify(driftedPackage), driftedSource);

  for (const inspection of [absent, exact, drifted]) {
    assert.equal(Object.isFrozen(inspection), true);
    assert.equal(Object.isFrozen(inspection.errors), true);
    assert.equal(Object.isFrozen(inspection.missingDependencies), true);
    assert.equal(Object.isFrozen(inspection.mismatchedDependencies), true);
    assert.equal(Object.isFrozen(inspection.provider), true);
  }
});

test("provider inspection represents invalid dependency values without freezing caller input", () => {
  for (const { actualVersion, createValue, name } of invalidDependencyValueCases) {
    const value = createValue();
    const packageJson = {
      dependencies: { ...syntheticDependencies, vgpu: value },
      name: `${name}-value-app`,
    };
    const before = JSON.stringify(packageJson);
    const inspection = inspectRendererProvider({
      catalog: syntheticCatalog,
      packageJson,
      providerId: "vgpu",
    });

    assert.equal(inspection.status, "drifted");
    assert.deepEqual(inspection.errors, [
      `packageJson.dependencies.vgpu must equal approved version "1.2.3"; received ${actualVersion}.`,
    ]);
    assert.deepEqual(inspection.mismatchedDependencies, [
      {
        actualVersion,
        dependency: syntheticProvider.dependencies[0],
        error: inspection.errors[0],
      },
    ]);
    assert.equal(JSON.stringify(packageJson), before);
    assertCallerPackageRemainsMutable(packageJson, value);

    assert.throws(
      () =>
        enableRendererProvider({
          catalog: syntheticCatalog,
          packageJson,
          providerId: "vgpu",
        }),
      new TypeError(inspection.errors[0]),
    );
    assert.equal(JSON.stringify(packageJson), before);
    assertCallerPackageRemainsMutable(packageJson, value);
  }
});

test("enabling a provider changes only dependencies and is idempotent", () => {
  const packageJson = {
    dependencies: {},
    name: "synthetic-app",
    scripts: { test: "node --test" },
  };
  const originalSource = JSON.stringify({ syntheticCatalog, packageJson });

  const first = enableRendererProvider({
    catalog: syntheticCatalog,
    packageJson,
    providerId: "vgpu",
  });

  assert.deepEqual(first, {
    changed: true,
    packageJson: {
      dependencies: syntheticDependencies,
      name: "synthetic-app",
      scripts: { test: "node --test" },
    },
  });
  assert.equal(JSON.stringify({ syntheticCatalog, packageJson }), originalSource);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.packageJson), true);
  assert.equal(Object.isFrozen(first.packageJson.dependencies), true);
  assert.equal(Object.isFrozen(first.packageJson.scripts), true);

  assert.deepEqual(
    enableRendererProvider({
      catalog: syntheticCatalog,
      packageJson: first.packageJson,
      providerId: "vgpu",
    }),
    {
      changed: false,
      packageJson: first.packageJson,
    },
  );
});

test("enabling a provider rejects unknown ids and dependency drift", () => {
  for (const providerId of ["missing", "constructor", "toString", "__proto__"]) {
    assert.throws(
      () =>
        enableRendererProvider({
          catalog: syntheticCatalog,
          packageJson: { dependencies: {} },
          providerId,
        }),
      new TypeError(`Unknown renderer provider "${providerId}".`),
    );
  }

  for (const dependency of syntheticProvider.dependencies) {
    for (const version of ["^1.2.3", "1.2.2"]) {
      const packageJson = {
        dependencies: { [dependency.name]: version },
        scripts: {},
      };
      const before = JSON.stringify(packageJson);
      assert.throws(
        () =>
          enableRendererProvider({
            catalog: syntheticCatalog,
            packageJson,
            providerId: "vgpu",
          }),
        new TypeError(
          `packageJson.dependencies.${dependency.name} must equal approved version "1.2.3"; received "${version}".`,
        ),
      );
      assert.equal(JSON.stringify(packageJson), before);
    }
  }
});

test("catalog parsing rejects ranges, unsorted ids, and malformed closed objects", () => {
  const cases = [
    {
      catalog: catalogWithDependency("runtime", { version: "^1.2.3" }),
      error:
        'catalog.providers.vgpu.approvedRelease.dependencies[0].version must be an exact semver; received "^1.2.3".',
    },
    {
      catalog: {
        schemaVersion: 2,
        providers: {
          zeta: syntheticCatalog.providers.vgpu,
          alpha: syntheticCatalog.providers.vgpu,
        },
      },
      error: "catalog.providers keys must be sorted.",
    },
    {
      catalog: { ...syntheticCatalog, unexpected: true },
      error: 'catalog contains unsupported key "unexpected".',
    },
    {
      catalog: { ...syntheticCatalog, schemaVersion: 1 },
      error: "catalog.schemaVersion must equal 2 or 3.",
    },
    {
      catalog: {
        ...syntheticCatalog,
        providers: {
          vgpu: {
            capability: "shader-webgpu-vgpu",
            requiredExports: [".", "./mock", "./node"],
            viteLoader: "@vgpu/wgsl/loader-vite",
          },
        },
      },
      error: "catalog.providers.vgpu.approvedRelease is required.",
    },
    {
      catalog: catalogWithDependency("runtime", { integrity: "synthetic" }),
      error:
        "catalog.providers.vgpu.approvedRelease.dependencies[0].integrity must begin with sha512-.",
    },
    {
      catalog: {
        ...syntheticCatalog,
        providers: {
          vgpu: {
            ...syntheticCatalog.providers.vgpu,
            approvedRelease: {
              ...syntheticCatalog.providers.vgpu.approvedRelease,
              dependencies: [
                syntheticProvider.dependencies[1],
                syntheticProvider.dependencies[0],
              ],
            },
          },
        },
      },
      error:
        "catalog.providers.vgpu.approvedRelease.dependencies must equal the ordered runtime:vgpu and wgsl-tooling:@vgpu/wgsl tuple.",
    },
    {
      catalog: catalogWithDependency("wgsl-tooling", { name: "vgpu" }),
      error:
        "catalog.providers.vgpu.approvedRelease.dependencies must equal the ordered runtime:vgpu and wgsl-tooling:@vgpu/wgsl tuple.",
    },
  ];

  for (const { catalog, error } of cases) {
    const before = JSON.stringify(catalog);
    assert.throws(() => parseRendererProviderCatalog(catalog), new TypeError(error));
    assert.equal(JSON.stringify(catalog), before);
  }
});

test("catalog versions follow exact SemVer prerelease identifier rules", () => {
  const catalogWithVersion = (version) =>
    ({
      ...syntheticCatalog,
      providers: {
        vgpu: {
          ...syntheticCatalog.providers.vgpu,
          approvedRelease: {
            ...syntheticCatalog.providers.vgpu.approvedRelease,
            dependencies:
              syntheticCatalog.providers.vgpu.approvedRelease.dependencies.map(
                (dependency) => ({ ...dependency, version }),
              ),
          },
        },
      },
    });

  for (const version of [
    "1.2.3-0",
    "1.2.3-alpha.1",
    "1.2.3-alpha-1+build.01",
  ]) {
    assert.equal(
      parseRendererProviderCatalog(catalogWithVersion(version)).providers.vgpu
        .dependencies[0].version,
      version,
    );
  }

  for (const version of ["1.2.3-01", "1.2.3-alpha.01"]) {
    assert.throws(
      () => parseRendererProviderCatalog(catalogWithVersion(version)),
      new TypeError(
        `catalog.providers.vgpu.approvedRelease.dependencies[0].version must be an exact semver; received "${version}".`,
      ),
    );
  }
});
