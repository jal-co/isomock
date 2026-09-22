import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { writeDurableCheckpointAtomic } from "./toolcraft-checkpoint-durable-fs.mjs";
import {
  createCheckpointFixture,
} from "./toolcraft-checkpoint-transaction-test-helpers.mjs";

test("rename failure preserves the original bundle and removes the prepared artifact", async (t) => {
  const { rootDir, verificationDir } = await createCheckpointFixture();
  t.after(() => fs.rm(rootDir, { force: true, recursive: true }));
  const filePath = path.join(verificationDir, "checkpoint.json");
  const temporaryPath = path.join(
    verificationDir,
    ".checkpoint-rename-failure.tmp",
  );
  const original = Buffer.from("original checkpoint bytes\n");
  await fs.writeFile(filePath, original);
  const renameFailure = Object.assign(
    new Error("adversarial rename failure"),
    { code: "EISDIR" },
  );
  const events = [];

  await assert.rejects(
    writeDurableCheckpointAtomic({
      contents: "replacement checkpoint bytes\n",
      filePath,
      observeDurabilityBarrier: ({ phase }) => events.push(phase),
      phase: "checkpoint-committed",
      renameFile: async () => {
        throw renameFailure;
      },
      temporaryPath,
    }),
    (error) => error === renameFailure,
  );

  assert.deepEqual(events, ["checkpoint-prepared"]);
  assert.deepEqual(await fs.readFile(filePath), original);
  assert.deepEqual(
    (await fs.readdir(verificationDir)).filter((entry) =>
      /^\.checkpoint-.*\.tmp$/u.test(entry),
    ),
    [],
  );
});
