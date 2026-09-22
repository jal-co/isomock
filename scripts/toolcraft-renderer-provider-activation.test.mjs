import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";

import { configureRendererProvider } from "./toolcraft-renderer-provider.mjs";
import {
  invalidDependencyValueCases,
  syntheticCatalog,
  syntheticDependencies,
  withTemporaryRendererProviderApp,
} from "./toolcraft-renderer-provider-test-helpers.mjs";

const execFileAsync = promisify(execFile);

test("filesystem configurator rejects invalid dependency values before staging", async () => {
  for (const { actualVersion, createValue } of invalidDependencyValueCases) {
    await withTemporaryRendererProviderApp({}, async ({ appRoot, packageJsonPath }) => {
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, "utf8"));
      packageJson.dependencies = {
        ...syntheticDependencies,
        vgpu: createValue(),
      };
      const source = `${JSON.stringify(packageJson, null, 2)}\n`;
      await fs.writeFile(packageJsonPath, source);

      await assert.rejects(
        configureRendererProvider({ appRoot, providerId: "vgpu" }),
        new TypeError(
          `packageJson.dependencies.vgpu must equal approved version "1.2.3"; received ${actualVersion}.`,
        ),
      );
      assert.equal(await fs.readFile(packageJsonPath, "utf8"), source);
      assert.deepEqual(
        (await fs.readdir(appRoot)).filter((entry) =>
          entry.includes("renderer-provider"),
        ),
        [],
      );
    });
  }
});

test("filesystem configurator enables the exact catalog pin and is byte-idempotent", async () => {
  await withTemporaryRendererProviderApp({}, async ({ appRoot, packageJsonPath }) => {
    const first = await configureRendererProvider({ appRoot, providerId: "vgpu" });
    const firstPackageSource = await fs.readFile(packageJsonPath, "utf8");
    const packageJson = JSON.parse(firstPackageSource);

    assert.equal(first.changed, true);
    assert.deepEqual(packageJson.dependencies, syntheticDependencies);
    assert.deepEqual(
      JSON.parse(await fs.readFile(path.join(appRoot, "integrity-ran"), "utf8")),
      ["--platform-only"],
    );

    const second = await configureRendererProvider({ appRoot, providerId: "vgpu" });
    assert.equal(second.changed, false);
    assert.equal(await fs.readFile(packageJsonPath, "utf8"), firstPackageSource);
  });
});

test("filesystem configurator leaves package.json byte-identical when commit is interrupted", async () => {
  await withTemporaryRendererProviderApp({}, async ({ appRoot, packageJsonPath }) => {
    const originalPackageSource = await fs.readFile(packageJsonPath, "utf8");
    const unrelatedStagingPath = path.join(
      appRoot,
      ".package.json.toolcraft-renderer-provider-unrelated",
    );
    await fs.writeFile(unrelatedStagingPath, "keep me");

    await assert.rejects(
      configureRendererProvider({
        appRoot,
        async beforeCommit() {
          const ownStagingFiles = (await fs.readdir(appRoot)).filter(
            (entry) =>
              entry.startsWith(".package.json.toolcraft-renderer-provider-") &&
              entry !== path.basename(unrelatedStagingPath),
          );
          assert.equal(ownStagingFiles.length, 1);
          assert.deepEqual(
            JSON.parse(
              await fs.readFile(path.join(appRoot, ownStagingFiles[0]), "utf8"),
            ).dependencies,
            syntheticDependencies,
          );
          throw new Error("interrupt before rename");
        },
        providerId: "vgpu",
      }),
      /interrupt before rename/,
    );

    assert.equal(await fs.readFile(packageJsonPath, "utf8"), originalPackageSource);
    assert.deepEqual(
      (await fs.readdir(appRoot)).filter((entry) => entry.includes("renderer-provider")),
      [path.basename(unrelatedStagingPath)],
    );
    assert.equal(await fs.readFile(unrelatedStagingPath, "utf8"), "keep me");
  });
});

test("filesystem configurator aborts a concurrent package change without overwriting it", async () => {
  await withTemporaryRendererProviderApp({}, async ({ appRoot, packageJsonPath }) => {
    const concurrentPackageSource = `${JSON.stringify(
      {
        dependencies: { "concurrent-product-dependency": "2.0.0" },
        name: "temporary-app",
        private: true,
      },
      null,
      2,
    )}\n`;

    await assert.rejects(
      configureRendererProvider({
        appRoot,
        async beforeCommit() {
          await fs.writeFile(packageJsonPath, concurrentPackageSource);
        },
        providerId: "vgpu",
      }),
      new Error(
        "package.json changed concurrently; retry renderer provider activation.",
      ),
    );

    assert.equal(await fs.readFile(packageJsonPath, "utf8"), concurrentPackageSource);
    assert.deepEqual(
      (await fs.readdir(appRoot)).filter((entry) => entry.includes("renderer-provider")),
      [],
    );
  });
});

test("filesystem configurator preserves a primary file-operation failure while attempting every cleanup", async () => {
  await withTemporaryRendererProviderApp({}, async ({ appRoot }) => {
    let removalAttempted = false;
    const fileOperations = {
      ...fs,
      async open(...args) {
        const handle = await fs.open(...args);
        return {
          close: handle.close.bind(handle),
          async sync() {
            throw new Error("primary staging flush failure");
          },
          writeFile: handle.writeFile.bind(handle),
        };
      },
      async rm(filePath, options) {
        removalAttempted = true;
        await fs.rm(filePath, options);
        throw new Error("secondary staging cleanup failure");
      },
    };

    await assert.rejects(
      configureRendererProvider({
        appRoot,
        fileOperations,
        providerId: "vgpu",
      }),
      new Error("primary staging flush failure"),
    );
    assert.equal(removalAttempted, true);
    assert.deepEqual(
      (await fs.readdir(appRoot)).filter((entry) => entry.includes("renderer-provider")),
      [],
    );
  });
});

test("filesystem configurator still removes staging after close failure", async () => {
  await withTemporaryRendererProviderApp({}, async ({ appRoot, packageJsonPath }) => {
    const originalPackageSource = await fs.readFile(packageJsonPath, "utf8");
    let removalAttempted = false;
    const fileOperations = {
      ...fs,
      async open(...args) {
        const handle = await fs.open(...args);
        let closeCalls = 0;
        return {
          async close() {
            closeCalls += 1;
            await handle.close();
            if (closeCalls === 1) {
              throw new Error("primary staging close failure");
            }
          },
          sync: handle.sync.bind(handle),
          writeFile: handle.writeFile.bind(handle),
        };
      },
      async rm(filePath, options) {
        removalAttempted = true;
        await fs.rm(filePath, options);
      },
    };

    await assert.rejects(
      configureRendererProvider({
        appRoot,
        fileOperations,
        providerId: "vgpu",
      }),
      new Error("primary staging close failure"),
    );
    assert.equal(removalAttempted, true);
    assert.equal(await fs.readFile(packageJsonPath, "utf8"), originalPackageSource);
  });
});

test("filesystem configurator preserves rename failure while cleaning its stage", async () => {
  await withTemporaryRendererProviderApp({}, async ({ appRoot, packageJsonPath }) => {
    const originalPackageSource = await fs.readFile(packageJsonPath, "utf8");
    let removalAttempted = false;
    const fileOperations = {
      ...fs,
      async rename() {
        throw new Error("primary package rename failure");
      },
      async rm(filePath, options) {
        removalAttempted = true;
        await fs.rm(filePath, options);
        throw new Error("secondary staging cleanup failure");
      },
    };

    await assert.rejects(
      configureRendererProvider({
        appRoot,
        fileOperations,
        providerId: "vgpu",
      }),
      new Error("primary package rename failure"),
    );
    assert.equal(removalAttempted, true);
    assert.equal(await fs.readFile(packageJsonPath, "utf8"), originalPackageSource);
  });
});

test("filesystem configurator never removes a staging path it did not create", async () => {
  await withTemporaryRendererProviderApp({}, async ({ appRoot, packageJsonPath }) => {
    const originalPackageSource = await fs.readFile(packageJsonPath, "utf8");
    let foreignStagingPath;
    let removalAttempted = false;
    const fileOperations = {
      ...fs,
      async open(filePath) {
        foreignStagingPath = filePath;
        await fs.writeFile(filePath, "foreign staging owner");
        const error = new Error("staging path already exists");
        error.code = "EEXIST";
        throw error;
      },
      async rm(filePath, options) {
        removalAttempted = true;
        await fs.rm(filePath, options);
      },
    };

    await assert.rejects(
      configureRendererProvider({
        appRoot,
        fileOperations,
        providerId: "vgpu",
      }),
      (error) => error?.code === "EEXIST",
    );
    assert.equal(removalAttempted, false);
    assert.equal(await fs.readFile(foreignStagingPath, "utf8"), "foreign staging owner");
    assert.equal(await fs.readFile(packageJsonPath, "utf8"), originalPackageSource);
  });
});

test("filesystem configurator releases staging ownership immediately after rename", async () => {
  await withTemporaryRendererProviderApp({}, async ({ appRoot, packageJsonPath }) => {
    let recreatedStagingPath;
    let removalAttempted = false;
    const fileOperations = {
      ...fs,
      async rename(fromPath, toPath) {
        await fs.rename(fromPath, toPath);
        recreatedStagingPath = fromPath;
        await fs.writeFile(fromPath, "foreign owner after rename");
      },
      async rm(filePath, options) {
        removalAttempted = true;
        await fs.rm(filePath, options);
        throw new Error("must not clean a released staging path");
      },
    };

    const result = await configureRendererProvider({
      appRoot,
      fileOperations,
      providerId: "vgpu",
    });

    assert.equal(result.changed, true);
    assert.equal(removalAttempted, false);
    assert.equal(
      await fs.readFile(recreatedStagingPath, "utf8"),
      "foreign owner after rename",
    );
    assert.deepEqual(
      JSON.parse(await fs.readFile(packageJsonPath, "utf8")).dependencies,
      syntheticDependencies,
    );
  });
});

test("filesystem configurator checks platform integrity before editable state", async () => {
  await withTemporaryRendererProviderApp(
    { integrityExitCode: 1 },
    async ({ appRoot, packageJsonPath }) => {
      const originalPackageSource = await fs.readFile(packageJsonPath, "utf8");
      await fs.rm(packageJsonPath);

      await assert.rejects(
        configureRendererProvider({ appRoot, providerId: "vgpu" }),
        (error) => {
          assert.equal(error?.code, 1);
          assert.doesNotMatch(String(error), /ENOENT/u);
          return true;
        },
      );

      assert.deepEqual(
        JSON.parse(await fs.readFile(path.join(appRoot, "integrity-ran"), "utf8")),
        ["--platform-only"],
      );
      await fs.writeFile(packageJsonPath, originalPackageSource);
    },
  );
});

test("CLI accepts direct and documented pnpm enable forms without running install", async () => {
  await withTemporaryRendererProviderApp({}, async ({ appRoot }) => {
    const scriptPath = new URL("./toolcraft-renderer-provider.mjs", import.meta.url);
    const copiedScriptPath = path.join(appRoot, "scripts/toolcraft-renderer-provider.mjs");
    const copiedConfigPath = path.join(
      appRoot,
      "src/toolcraft/renderer-providers/provider-config.mjs",
    );
    const copiedDependencyInspectionPath = path.join(
      appRoot,
      "src/toolcraft/renderer-providers/provider-dependency-inspection.mjs",
    );
    await fs.copyFile(scriptPath, copiedScriptPath);
    await Promise.all([
      fs.copyFile(
        new URL("../src/toolcraft/renderer-providers/provider-config.mjs", import.meta.url),
        copiedConfigPath,
      ),
      fs.copyFile(
        new URL(
          "../src/toolcraft/renderer-providers/provider-dependency-inspection.mjs",
          import.meta.url,
        ),
        copiedDependencyInspectionPath,
      ),
    ]);

    for (const relative of [
      "scripts/toolcraft-renderer-activation.mjs",
      "scripts/toolcraft-renderer-activation-proof.mjs",
      "scripts/renderer-provider-registry-client.mjs",
      "scripts/renderer-provider-release-codec.mjs",
      "src/toolcraft/renderer-providers/provider-resolution.mjs",
      "src/toolcraft/renderer-providers/release-codec.mjs",
    ]) {
      await fs.copyFile(new URL(`../${relative}`, import.meta.url), path.join(appRoot, relative));
    }

    const { stdout } = await execFileAsync(
      "pnpm",
      ["toolcraft:renderer", "--", "enable", "vgpu"],
      { cwd: appRoot },
    );
    assert.deepEqual(stdout.trimEnd().split("\n").at(-1), "pnpm install");
    const direct = await execFileAsync(
      process.execPath,
      [copiedScriptPath, "enable", "vgpu"],
      { cwd: appRoot },
    );
    assert.match(direct.stdout, /already enabled/u);
    await assert.rejects(
      execFileAsync(process.execPath, [copiedScriptPath, "enable", "missing"], {
        cwd: appRoot,
      }),
      /Usage: pnpm toolcraft:renderer -- enable vgpu/,
    );
    for (const invalidArgs of [
      ["--", "--", "enable", "vgpu"],
      ["--", "enable", "vgpu", "extra"],
      ["enable", "vgpu", "extra"],
    ]) {
      await assert.rejects(
        execFileAsync(process.execPath, [copiedScriptPath, ...invalidArgs], {
          cwd: appRoot,
        }),
        /Usage: pnpm toolcraft:renderer -- enable vgpu/,
      );
    }
    await assert.rejects(
      fs.stat(path.join(appRoot, "node_modules")),
      { code: "ENOENT" },
    );
  });
});
