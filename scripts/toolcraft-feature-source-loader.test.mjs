import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createToolcraftProductBoundaryFixture } from "./toolcraft-product-boundary-test-fixtures.mjs";

import {
  loadToolcraftFeatureVerificationPlanFromSource,
  loadToolcraftFeatureVerificationPlanInIsolatedProcess,
} from "./toolcraft-feature-source-loader.mjs";

const request = Object.freeze({
  acceptanceIds: Object.freeze(["material.layer"]),
  mode: "ids",
  version: 1,
});
const plan = Object.freeze({
  acceptanceIds: Object.freeze(["material.layer"]),
  scenarios: Object.freeze([
    Object.freeze({
      acceptanceIds: Object.freeze(["material.layer"]),
      budget: "standard",
      file: "e2e/product-material.spec.ts",
      testName: "browser: material layer",
    }),
  ]),
  version: 2,
});

test("feature loading rejects current UI/CSS violations before executing Vite or product code", async (context) => {
  for (const files of [
    { "src/editor.tsx": 'import { InputGroupInput } from "@/toolcraft/ui"; export const Editor = <InputGroupInput type="color" />;' },
    { "src/editor.module.css": '.scope [data-slot="input"] { background: red; }' },
  ]) {
    const projectDir = await createToolcraftProductBoundaryFixture(context, files);
    const fixture = createDependencies();
    await assert.rejects(loadToolcraftFeatureVerificationPlanFromSource({
      dependencies: fixture.dependencies, projectDir, request,
    }), /feature product boundary failed/u);
    assert.deepEqual(fixture.calls, []);
  }
});

test("feature loading checks edits after an earlier successful source check", async (context) => {
  const file = "src/editor.tsx";
  const projectDir = await createToolcraftProductBoundaryFixture(context, {
    [file]: 'import { Input } from "@/toolcraft/ui"; export const Editor = <Input type="text" />;',
  });
  const first = createDependencies();
  await loadToolcraftFeatureVerificationPlanFromSource({ dependencies: first.dependencies, projectDir, request });
  await writeFile(path.join(projectDir, file), 'import { Input } from "@/toolcraft/ui"; export const Editor = <Input style={{ background: "red" }} />;');
  const second = createDependencies();
  await assert.rejects(loadToolcraftFeatureVerificationPlanFromSource({ dependencies: second.dependencies, projectDir, request }), /feature product boundary failed/u);
  assert.deepEqual(second.calls, []);
});

function createDependencies({ close, load, select } = {}) {
  const calls = [];
  let createOptions;
  let closeCount = 0;
  const dependencies = {
    createServer: async (options) => {
      createOptions = options;
      calls.push(`create:${options.root}`);
      return {
        close: async () => {
          closeCount += 1;
          calls.push("close");
          if (close) return close();
        },
        ssrLoadModule: async (sourcePath) => {
          calls.push(`load:${sourcePath}`);
          if (load) return load(sourcePath, calls);
          return {
            createToolcraftFeaturePlanFromCurrentApp: async (input) => {
              calls.push(`select:${input.acceptanceIds.join(",")}`);
              return select ? select(input) : plan;
            },
          };
        },
      };
    },
  };
  return {
    calls,
    dependencies,
    get closeCount() {
      return closeCount;
    },
    get createOptions() {
      return createOptions;
    },
  };
}

test("loads and validates the current app plan before closing Vite", async () => {
  const fixture = createDependencies();

  assert.deepEqual(
    await loadToolcraftFeatureVerificationPlanFromSource({
      dependencies: fixture.dependencies,
      projectDir: "/app",
      request,
    }),
    plan,
  );
  assert.deepEqual(fixture.calls, [
    "create:/app",
    "load:/src/app/app-acceptance.ts",
    "select:material.layer",
    "close",
  ]);
  assert.deepEqual(fixture.createOptions, {
    appType: "custom",
    logLevel: "error",
    root: path.resolve("/app"),
    server: { hmr: false, middlewareMode: true },
  });
  assert.equal(fixture.closeCount, 1);
});

test("fails closed for an absent current-app export", async () => {
  const fixture = createDependencies({ load: async () => ({}) });

  await assert.rejects(
    loadToolcraftFeatureVerificationPlanFromSource({
      dependencies: fixture.dependencies,
      projectDir: "/app",
      request,
    }),
    /createToolcraftFeaturePlanFromCurrentApp/iu,
  );
  assert.equal(fixture.closeCount, 1);
});

test("fails closed for an invalid returned plan", async () => {
  const fixture = createDependencies({ select: async () => ({ version: 2 }) });

  await assert.rejects(
    loadToolcraftFeatureVerificationPlanFromSource({
      dependencies: fixture.dependencies,
      projectDir: "/app",
      request,
    }),
    /invalid Toolcraft feature verification plan/iu,
  );
  assert.equal(fixture.closeCount, 1);
});

test("closes Vite once when SSR loading rejects", async () => {
  const failure = new Error("SSR load failed");
  const fixture = createDependencies({
    load: async () => {
      throw failure;
    },
  });

  await assert.rejects(
    loadToolcraftFeatureVerificationPlanFromSource({
      dependencies: fixture.dependencies,
      projectDir: "/app",
      request,
    }),
    failure,
  );
  assert.equal(fixture.closeCount, 1);
});

test("closes Vite once when current-app selection rejects", async () => {
  const failure = new Error("selection failed");
  const fixture = createDependencies({
    select: async () => {
      throw failure;
    },
  });

  await assert.rejects(
    loadToolcraftFeatureVerificationPlanFromSource({
      dependencies: fixture.dependencies,
      projectDir: "/app",
      request,
    }),
    failure,
  );
  assert.equal(fixture.closeCount, 1);
});

test("preserves primary and cleanup failures when both reject", async () => {
  const primaryFailure = new Error("SSR load failed");
  const cleanupFailure = new Error("Vite close failed");
  const fixture = createDependencies({
    close: async () => {
      throw cleanupFailure;
    },
    load: async () => {
      throw primaryFailure;
    },
  });

  await assert.rejects(
    loadToolcraftFeatureVerificationPlanFromSource({
      dependencies: fixture.dependencies,
      projectDir: "/app",
      request,
    }),
    (error) => {
      assert.ok(error instanceof AggregateError);
      assert.deepEqual(error.errors, [primaryFailure, cleanupFailure]);
      return true;
    },
  );
  assert.equal(fixture.closeCount, 1);
});

test("surfaces a close-only failure after successful selection", async () => {
  const cleanupFailure = new Error("Vite close failed");
  const fixture = createDependencies({
    close: async () => {
      throw cleanupFailure;
    },
  });

  await assert.rejects(
    loadToolcraftFeatureVerificationPlanFromSource({
      dependencies: fixture.dependencies,
      projectDir: "/app",
      request,
    }),
    cleanupFailure,
  );
  assert.equal(fixture.closeCount, 1);
});

test("isolated IPC keeps noisy product stdout and stderr outside plan transport", async () => {
  const projectDir = await mkdtemp(path.join(tmpdir(), "toolcraft-noisy-source-"));
  try {
    await mkdir(path.join(projectDir, "src/app"), { recursive: true });
    await writeFile(
      path.join(projectDir, "src/app/app-acceptance.ts"),
      `export function createToolcraftFeaturePlanFromCurrentApp() { console.log("product stdout"); console.error("product stderr"); return ${JSON.stringify(plan)}; }\n`,
      "utf8",
    );
    assert.deepEqual(
      await loadToolcraftFeatureVerificationPlanInIsolatedProcess({ env: process.env, projectDir, request }),
      plan,
    );
  } finally {
    await rm(projectDir, { force: true, recursive: true });
  }
});

test("isolated source loading rejects product output floods with the protected resource error", async () => {
  const projectDir = await mkdtemp(path.join(tmpdir(), "toolcraft-source-flood-"));
  try {
    await mkdir(path.join(projectDir, "src/app"), { recursive: true });
    await writeFile(path.join(projectDir, "src/app/app-acceptance.ts"),
      `console.log("x".repeat(5 * 1024 * 1024)); export function createToolcraftFeaturePlanFromCurrentApp() { return ${JSON.stringify(plan)}; }\n`);
    await assert.rejects(loadToolcraftFeatureVerificationPlanInIsolatedProcess({ env: process.env, projectDir, request }),
      (error) => error.code === "TOOLCRAFT_PROOF_PROCESS_RESOURCE_LIMIT" && error.resource === "stdout-bytes");
  } finally { await rm(projectDir, { force: true, recursive: true }); }
});

test("isolated IPC rejects missing, malformed, and duplicate early protocol messages", async () => {
  const validMessage = { kind: "toolcraft-feature-verification-plan", plan, version: 1 };
  for (const messages of [[], [{ kind: "forged", plan, version: 1 }], [{ kind: "forged", plan, version: 1 }, validMessage], [validMessage, validMessage]]) {
    await assert.rejects(
      loadToolcraftFeatureVerificationPlanInIsolatedProcess({
        dependencies: { runIpcProcess: async () => ({ messages, stderr: "noise", stdout: "noise" }) },
        env: {},
        projectDir: "/app",
        request,
      }),
      /invalid IPC protocol/iu,
    );
  }
});
