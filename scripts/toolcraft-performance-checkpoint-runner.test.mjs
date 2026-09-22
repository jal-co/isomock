import assert from "node:assert/strict";
import { readFileSync, rmSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  readPlaywrightShimEvents,
} from "./run-browser-performance-test-helpers.mjs";
import {
  createFullPerformanceFixture,
} from "./toolcraft-full-performance-test-helpers.mjs";
import * as checkpointRunner from "./toolcraft-performance-checkpoint-runner.mjs";
import { collectToolcraftVerificationInputs } from "./toolcraft-verification-inventory.mjs";

test("performance checkpoint measurement uses the canonical proof process", async (t) => {
  assert.deepEqual(Object.keys(checkpointRunner), [
    "measureToolcraftPerformanceCheckpoint",
  ]);
  const source = readFileSync(
    path.join(import.meta.dirname, "toolcraft-performance-checkpoint-runner.mjs"),
    "utf8",
  );
  assert.match(source, /from "\.\/toolcraft-proof-process\.mjs"/u);
  assert.doesNotMatch(source, /from "cross-spawn"|function runBinary|function getBinaryPath/u);

  const projectDir = await createFullPerformanceFixture();
  t.after(() => rmSync(projectDir, { force: true, recursive: true }));
  const baselineInventory =
    await collectToolcraftVerificationInputs(projectDir);

  const measurement =
    await checkpointRunner.measureToolcraftPerformanceCheckpoint({
      baselineInventory,
      projectDir,
    });

  assert.equal(measurement.inventory.sourceHash, baselineInventory.sourceHash);
  assert.equal(measurement.evidence.measurements.length, 3);
  assert.deepEqual(
    readPlaywrightShimEvents(projectDir).findLast(
      ({ event }) => event === "completed",
    ),
    {
      args: ["test", "--grep", "browser perf:", "--workers=1"],
      event: "completed",
      fixtureResolutionMode: "full-certification",
      fixtureSelector: "maximum",
    },
  );
});
