import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import test from "node:test";
import spawn from "cross-spawn";

import * as operatorModule from "./run-browser-performance.mjs";
import {
  createFullPerformanceFixture,
} from "./toolcraft-full-performance-test-helpers.mjs";
import {
  failPerformanceMatrix,
  invokeRunner,
  mutateSourceDuringPerformanceMatrix,
  projectDir,
  readCheckpointBundle,
  readPlaywrightShimEvents,
  readProofInvocations,
  runProtectedRunner,
  runnerPath,
} from "./run-browser-performance-test-helpers.mjs";
import { getToolcraftCheckpointBundlePath } from "./toolcraft-checkpoint-paths.mjs";
import { validateToolcraftPerformanceReceipt } from "./toolcraft-verification-receipt.mjs";

const { runToolcraftFullPerformanceCertification } = operatorModule;

test("full certification exposes one locked operator entry point", () => {
  assert.deepEqual(Object.keys(operatorModule).sort(), [
    "runToolcraftFullPerformanceCertification",
  ]);
});

test("full certification runs only build plus the complete performance matrix and preserves delivery", async (t) => {
  const rootDir = await createFullPerformanceFixture();
  t.after(() => rmSync(rootDir, { force: true, recursive: true }));
  const existing = readCheckpointBundle(rootDir);
  assert.equal(existing.currentPerformance, null);
  assert.equal(existing.performanceBaseline, null);

  const updated = await runToolcraftFullPerformanceCertification({
    projectDir: rootDir,
  });

  assert.deepEqual(readProofInvocations(rootDir), [
    "build",
    "playwright-full-performance",
  ]);
  assert.deepEqual(
    readPlaywrightShimEvents(rootDir).findLast(
      ({ event }) => event === "completed",
    )?.args,
    ["test", "--grep", "browser perf:", "--workers=1"],
  );
  assert.deepEqual(updated.delivery, existing.delivery);
  assert.deepEqual(readCheckpointBundle(rootDir), updated);
  assert.equal(updated.currentPerformance, null);
  assert.equal(updated.performanceBaseline.sourceHash, existing.delivery.sourceHash);
  assert.deepEqual(Object.keys(updated.performanceBaseline).sort(), [
    "completedAt",
    "files",
    "kind",
    "performanceEvidence",
    "runner",
    "sourceHash",
    "status",
    "version",
  ]);
  const runnerSource = readFileSync(runnerPath, "utf8");
  assert.doesNotMatch(
    runnerSource,
    /commitToolcraftDeliveryCheckpoint|getToolcraftCheckpointTransactionAuthorityError|readToolcraftDurablePerformanceBaseline|toolcraft-delivery-(?:lifecycle|plan|executor|receipt)/u,
  );
  assert.match(
    runnerSource,
    /expectedSourceInventory:\s*measurement\.inventory/u,
  );
});

test("operator full performance command accepts no arguments", async () => {
  const rootDir = await createFullPerformanceFixture();
  const before = readFileSync(getToolcraftCheckpointBundlePath(rootDir));
  try {
    const result = invokeRunner(rootDir, "run-browser-performance.mjs", [
      "--unexpected=delivery-policy",
    ]);
    assert.notEqual(result.status, 0);
    assert.match(
      `${result.stdout}\n${result.stderr}`,
      /does not accept arguments.*--unexpected=delivery-policy/iu,
    );
    assert.deepEqual(
      readFileSync(getToolcraftCheckpointBundlePath(rootDir)),
      before,
    );
  } finally {
    rmSync(rootDir, { force: true, recursive: true });
  }
});

test("concurrent public operator calls yield one success and one lock rejection", async (t) => {
  const rootDir = await createFullPerformanceFixture();
  t.after(() => rmSync(rootDir, { force: true, recursive: true }));

  const results = await Promise.allSettled([
    runToolcraftFullPerformanceCertification({ projectDir: rootDir }),
    runToolcraftFullPerformanceCertification({ projectDir: rootDir }),
  ]);
  const fulfilled = results.filter((result) => result.status === "fulfilled");
  const rejected = results.filter((result) => result.status === "rejected");

  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  assert.match(String(rejected[0].reason), /verification run is already active/iu);
});

test("protected performance runner rejects malformed canonical authority before tools", async (t) => {
  const rootDir = await createFullPerformanceFixture();
  t.after(() => rmSync(rootDir, { force: true, recursive: true }));
  const bundlePath = getToolcraftCheckpointBundlePath(rootDir);
  mkdirSync(path.dirname(bundlePath), { recursive: true });
  writeFileSync(bundlePath, "{not-json\n");

  await assert.rejects(
    runToolcraftFullPerformanceCertification({ projectDir: rootDir }),
    /checkpoint bundle is malformed JSON/iu,
  );

  assert.equal(
    existsSync(path.join(
      rootDir,
      "node_modules/.toolcraft-playwright-test-shim/events.jsonl",
    )),
    false,
  );
});

test("protected performance runner requires a successful delivery before tools", async (t) => {
  const rootDir = await createFullPerformanceFixture();
  t.after(() => rmSync(rootDir, { force: true, recursive: true }));
  rmSync(getToolcraftCheckpointBundlePath(rootDir), { force: true });

  await assert.rejects(
    runToolcraftFullPerformanceCertification({ projectDir: rootDir }),
    /requires a current successful delivery/iu,
  );

  assert.deepEqual(readProofInvocations(rootDir), []);
});

test("protected performance runner rejects a malformed delivery before tools", async (t) => {
  const rootDir = await createFullPerformanceFixture();
  t.after(() => rmSync(rootDir, { force: true, recursive: true }));
  const bundlePath = getToolcraftCheckpointBundlePath(rootDir);
  const bundle = readCheckpointBundle(rootDir);
  writeFileSync(
    bundlePath,
    `${JSON.stringify({ ...bundle, delivery: {} }, null, 2)}\n`,
  );
  const before = readFileSync(bundlePath);

  await assert.rejects(
    runToolcraftFullPerformanceCertification({ projectDir: rootDir }),
    /delivery receipt uses an unsupported version/iu,
  );

  assert.deepEqual(readProofInvocations(rootDir), []);
  assert.deepEqual(readFileSync(bundlePath), before);
});

test("protected performance runner rejects Playwright filters before launching tools", () => {
  const bundlePath = getToolcraftCheckpointBundlePath(projectDir);
  const original = existsSync(bundlePath) ? readFileSync(bundlePath) : undefined;
  mkdirSync(path.dirname(bundlePath), { recursive: true });
  writeFileSync(bundlePath, Buffer.from("protected bundle sentinel\n"));

  try {
    const result = spawn.sync(
      process.execPath,
      [runnerPath, "e2e/app-performance.spec.ts"],
      { cwd: projectDir, encoding: "utf8", timeout: 5_000 },
    );
    assert.equal(result.signal, null);
    assert.notEqual(result.status, 0);
    assert.match(
      `${result.stdout}\n${result.stderr}`,
      /does not accept arguments.*app-performance\.spec\.ts/iu,
    );
    assert.equal(readFileSync(bundlePath, "utf8"), "protected bundle sentinel\n");
  } finally {
    if (original) writeFileSync(bundlePath, original);
    else rmSync(bundlePath, { force: true });
  }
});

test("operator full certification creates and refreshes the independent checkpoint", async (t) => {
  const rootDir = await createFullPerformanceFixture();
  t.after(() => rmSync(rootDir, { force: true, recursive: true }));
  runProtectedRunner(rootDir);
  const firstBundle = readCheckpointBundle(rootDir);
  const firstBaseline = firstBundle.performanceBaseline;
  assert.equal(firstBundle.currentPerformance, null);
  assert.match(firstBaseline.performanceEvidence.reportHash, /^[a-f0-9]{64}$/u);
  assert.equal(firstBaseline.performanceEvidence.profileCatalogVersion, 1);
  assert.equal(firstBaseline.performanceEvidence.measurements.length, 3);
  assert.equal(
    readPlaywrightShimEvents(rootDir).findLast(
      (event) => event.event === "completed",
    )?.fixtureSelector,
    "maximum",
  );

  writeFileSync(path.join(rootDir, "src", "app.ts"), "export const value = 2;\n");
  runProtectedRunner(rootDir);
  const secondBundle = readCheckpointBundle(rootDir);
  const secondBaseline = secondBundle.performanceBaseline;
  assert.notEqual(secondBaseline.sourceHash, firstBaseline.sourceHash);
  assert.equal(secondBundle.currentPerformance, null);
  assert.equal(secondBaseline.kind, "performance-checkpoint");
  assert.deepEqual(await validateToolcraftPerformanceReceipt({ rootDir }), []);
});

test("source mutation during build preserves the previous checkpoint bundle", async (t) => {
  const rootDir = await createFullPerformanceFixture();
  t.after(() => rmSync(rootDir, { force: true, recursive: true }));
  const before = readFileSync(getToolcraftCheckpointBundlePath(rootDir));
  const previousMutationSetting =
    process.env.TOOLCRAFT_FIXTURE_MUTATE_DURING_BUILD;

  process.env.TOOLCRAFT_FIXTURE_MUTATE_DURING_BUILD = "1";
  try {
    await assert.rejects(
      runToolcraftFullPerformanceCertification({
        projectDir: rootDir,
      }),
      /verification inputs changed before the protected performance checkpoint/iu,
    );
  } finally {
    if (previousMutationSetting === undefined) {
      delete process.env.TOOLCRAFT_FIXTURE_MUTATE_DURING_BUILD;
    } else {
      process.env.TOOLCRAFT_FIXTURE_MUTATE_DURING_BUILD =
        previousMutationSetting;
    }
  }

  assert.deepEqual(readFileSync(getToolcraftCheckpointBundlePath(rootDir)), before);
});

test("source mutation during the matrix preserves the previous checkpoint bundle", async (t) => {
  const rootDir = await createFullPerformanceFixture();
  t.after(() => rmSync(rootDir, { force: true, recursive: true }));
  const bundlePath = getToolcraftCheckpointBundlePath(rootDir);
  const before = readFileSync(bundlePath);
  mutateSourceDuringPerformanceMatrix(rootDir);

  await assert.rejects(
    runToolcraftFullPerformanceCertification({ projectDir: rootDir }),
    /verification inputs changed during Playwright/iu,
  );

  assert.deepEqual(readFileSync(bundlePath), before);
});

test("matrix failure preserves the entire previous checkpoint bundle", async (t) => {
  const rootDir = await createFullPerformanceFixture();
  t.after(() => rmSync(rootDir, { force: true, recursive: true }));
  const bundlePath = getToolcraftCheckpointBundlePath(rootDir);
  await runToolcraftFullPerformanceCertification({ projectDir: rootDir });
  const before = readFileSync(bundlePath);
  failPerformanceMatrix(rootDir);

  await assert.rejects(
    runToolcraftFullPerformanceCertification({ projectDir: rootDir }),
    /playwright.*code 1/iu,
  );

  assert.deepEqual(readFileSync(bundlePath), before);
});
