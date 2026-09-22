import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runRendererProviderTypecheck } from "./toolcraft-renderer-provider-typecheck.mjs";

const syntheticCatalog = {
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
};

async function withApp(dependencies, callback) {
  const appRoot = await fs.mkdtemp(
    path.join(await fs.realpath(os.tmpdir()), "toolcraft-provider-typecheck-"),
  );
  try {
    await fs.mkdir(
      path.join(appRoot, "src/toolcraft/renderer-providers"),
      { recursive: true },
    );
    await fs.writeFile(
      path.join(appRoot, "src/toolcraft/renderer-providers/catalog.json"),
      `${JSON.stringify(syntheticCatalog)}\n`,
    );
    await fs.writeFile(
      path.join(appRoot, "package.json"),
      `${JSON.stringify({ dependencies })}\n`,
    );
    await callback(appRoot);
  } finally {
    await fs.rm(appRoot, { force: true, recursive: true });
  }
}

test("neutral applications skip the dormant provider typecheck", async () => {
  await withApp({}, async (appRoot) => {
    const executeTypecheck = async () => {
      throw new Error("neutral typecheck must not execute");
    };
    assert.deepEqual(
      await runRendererProviderTypecheck({ appRoot, executeTypecheck }),
      { providerId: null, status: "skipped" },
    );
  });
});

test("the exact enabled dependency tuple runs the bounded public API project", async () => {
  await withApp(
    { "@vgpu/wgsl": "1.2.3", vgpu: "1.2.3" },
    async (appRoot) => {
      const calls = [];
      const result = await runRendererProviderTypecheck({
        appRoot,
        executeTypecheck: async (input) => calls.push(input),
      });

      assert.deepEqual(result, { providerId: "vgpu", status: "passed" });
      assert.deepEqual(calls, [
        {
          appRoot,
          projectPath: path.join(
            appRoot,
            "toolcraft/renderer-providers/vgpu/tsconfig.json",
          ),
        },
      ]);
    },
  );
});

test("provider drift and child typecheck failures propagate", async () => {
  await withApp({ vgpu: "1.2.3" }, async (appRoot) => {
    await assert.rejects(
      runRendererProviderTypecheck({
        appRoot,
        executeTypecheck: async () => undefined,
      }),
      /requires packageJson\.dependencies\.@vgpu\/wgsl to equal "1\.2\.3"/,
    );
  });

  await withApp(
    { "@vgpu/wgsl": "1.2.3", vgpu: "1.2.3" },
    async (appRoot) => {
      const failure = new Error("tsc failed");
      await assert.rejects(
        runRendererProviderTypecheck({
          appRoot,
          executeTypecheck: async () => Promise.reject(failure),
        }),
        (error) => error === failure,
      );
    },
  );
});
