import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import {
  ToolcraftIntegrityError,
  evaluateToolcraftIntegrity,
} from "./check-toolcraft-integrity.mjs";
import {
  createToolcraftIntegrityFixture,
} from "./toolcraft-integrity-test-utils.mjs";
import { collectToolcraftVerificationInputs } from "./toolcraft-verification-inventory.mjs";

const execFileAsync = promisify(execFile);
const scriptsDir = path.dirname(fileURLToPath(import.meta.url));

async function createIntegrityCliFixture() {
  const rootDir = await fs.realpath(
    await fs.mkdtemp(
      path.join(os.tmpdir(), "toolcraft-integrity-cli-"),
    ),
  );
  const fixtureScriptsDir = path.join(rootDir, "scripts");
  await fs.mkdir(fixtureScriptsDir, { recursive: true });

  for (const fileName of [
    "check-toolcraft-integrity.mjs",
    "toolcraft-contract-doc-integrity.mjs",
    "toolcraft-contract-manifest.json",
    "toolcraft-contract-manifest.mjs",
    "toolcraft-integrity-manifest.mjs",
    "toolcraft-integrity-policy.mjs",
    "toolcraft-verification-inventory.mjs",
  ]) {
    await fs.copyFile(
      path.join(scriptsDir, fileName),
      path.join(fixtureScriptsDir, fileName),
    );
  }
  await fs.writeFile(path.join(rootDir, "package.json"), "{}\n");
  await fs.symlink("package.json", path.join(rootDir, "linked-package.json"));

  return rootDir;
}

test("evaluates reusable immutable Toolcraft integrity evidence", async (t) => {
  const rootDir = await createToolcraftIntegrityFixture();
  t.after(() => fs.rm(rootDir, { force: true, recursive: true }));
  const inventory = await collectToolcraftVerificationInputs(rootDir);

  const evidence = await evaluateToolcraftIntegrity({
    inventory,
    platformOnly: true,
    rootDir,
  });

  assert.deepEqual(Object.keys(evidence).sort(), [
    "manifestHash",
    "sourceHash",
  ]);
  assert.equal(evidence.sourceHash, inventory.sourceHash);
  assert.match(evidence.manifestHash, /^[a-f0-9]{64}$/u);
  assert.equal(
    evidence.manifestHash,
    inventory.entries.find(
      (entry) =>
        entry.path === "src/toolcraft/.toolcraft-manifest.json",
    )?.sha256,
  );
  assert.equal(Object.isFrozen(evidence), true);
});

test("keeps post-delivery observation outside the protected source hash", async (t) => {
  const rootDir = await createToolcraftIntegrityFixture();
  t.after(() => fs.rm(rootDir, { force: true, recursive: true }));
  const docsDir = path.join(rootDir, "docs", "toolcraft");
  const observationPath = path.join(docsDir, "workflow-observation.md");
  const worklogPath = path.join(docsDir, "agent-worklog.md");
  await fs.mkdir(docsDir, { recursive: true });
  await fs.writeFile(observationPath, "first observation\n");
  await fs.writeFile(worklogPath, "first decision\n");
  const initial = await collectToolcraftVerificationInputs(rootDir);

  await fs.writeFile(observationPath, "final receipt summary\n");
  const afterObservation =
    await collectToolcraftVerificationInputs(rootDir);
  assert.equal(afterObservation.sourceHash, initial.sourceHash);
  assert.equal(
    afterObservation.entries.some(
      ({ path: repoPath }) =>
        repoPath === "docs/toolcraft/workflow-observation.md",
    ),
    false,
  );

  await fs.writeFile(worklogPath, "changed decision authority\n");
  const afterWorklog = await collectToolcraftVerificationInputs(rootDir);
  assert.notEqual(afterWorklog.sourceHash, initial.sourceHash);
});

test("rejects inventories collected for a different app root", async (t) => {
  const inventoryRoot = await createToolcraftIntegrityFixture();
  const evaluationRoot = await createToolcraftIntegrityFixture();
  t.after(() =>
    Promise.all(
      [inventoryRoot, evaluationRoot].map((rootDir) =>
        fs.rm(rootDir, { force: true, recursive: true }),
      ),
    ),
  );
  const inventory = await collectToolcraftVerificationInputs(inventoryRoot);

  await assert.rejects(
    evaluateToolcraftIntegrity({
      inventory,
      platformOnly: true,
      rootDir: evaluationRoot,
    }),
    (error) => {
      assert.equal(error instanceof ToolcraftIntegrityError, true);
      assert.deepEqual(error.failures, [
        "Toolcraft integrity inventory was collected for a different app root.",
      ]);
      return true;
    },
  );
});

test("rejects forged or cloned verification inventories", async (t) => {
  const rootDir = await createToolcraftIntegrityFixture();
  t.after(() => fs.rm(rootDir, { force: true, recursive: true }));
  const inventory = await collectToolcraftVerificationInputs(rootDir);
  const clonedInventory = Object.freeze({
    entries: inventory.entries,
    sourceHash: inventory.sourceHash,
  });

  await assert.rejects(
    evaluateToolcraftIntegrity({
      inventory: clonedInventory,
      platformOnly: true,
      rootDir,
    }),
    (error) => {
      assert.equal(error instanceof ToolcraftIntegrityError, true);
      assert.deepEqual(error.failures, [
        "Toolcraft integrity evaluation requires an inventory returned directly by collectToolcraftVerificationInputs.",
      ]);
      return true;
    },
  );
});

test("rejects a manifest snapshot that differs from the authoritative inventory", async (t) => {
  const rootDir = await createToolcraftIntegrityFixture();
  t.after(() => fs.rm(rootDir, { force: true, recursive: true }));
  const inventory = await collectToolcraftVerificationInputs(rootDir);
  await fs.appendFile(
    path.join(rootDir, "src", "toolcraft", ".toolcraft-manifest.json"),
    "\n",
  );

  await assert.rejects(
    evaluateToolcraftIntegrity({
      inventory,
      platformOnly: true,
      rootDir,
    }),
    (error) => {
      assert.equal(error instanceof ToolcraftIntegrityError, true);
      assert.deepEqual(error.failures, [
        "Toolcraft integrity manifest does not match the authoritative verification inventory.",
      ]);
      return true;
    },
  );
});

test("rejects protected-file mutations with the CLI failure list", async (t) => {
  const rootDir = await createToolcraftIntegrityFixture();
  t.after(() => fs.rm(rootDir, { force: true, recursive: true }));
  const inventory = await collectToolcraftVerificationInputs(rootDir);
  await fs.writeFile(path.join(rootDir, "AGENTS.md"), "mutated\n");

  await assert.rejects(
    evaluateToolcraftIntegrity({
      inventory,
      platformOnly: true,
      rootDir,
    }),
    (error) => {
      assert.equal(error instanceof ToolcraftIntegrityError, true);
      assert.deepEqual(error.failures, ["modified AGENTS.md"]);
      assert.equal(error.message, error.failures.join("\n"));
      assert.equal(Object.isFrozen(error.failures), true);
      return true;
    },
  );
});

test("direct CLI reports inventory collection failures with recovery guidance", async (t) => {
  const rootDir = await createIntegrityCliFixture();
  t.after(() => fs.rm(rootDir, { force: true, recursive: true }));

  await assert.rejects(
    execFileAsync(
      process.execPath,
      [
        path.join(rootDir, "scripts", "check-toolcraft-integrity.mjs"),
        "--platform-only",
      ],
      { cwd: rootDir },
    ),
    (error) => {
      assert.equal(error.code, 1);
      assert.match(
        error.stderr,
        /^Toolcraft generated app integrity check failed\./u,
      );
      assert.match(
        error.stderr,
        /Do not edit src\/toolcraft or framework-owned verification infrastructure/u,
      );
      assert.match(
        error.stderr,
        /Fix the source runtime in the monorepo, generate a fresh app folder/u,
      );
      assert.match(
        error.stderr,
        /- Toolcraft verification inputs must not contain symbolic links: linked-package\.json\./u,
      );
      return true;
    },
  );
});

test("direct CLI runs when invoked through a symlinked app path", async (t) => {
  const rootDir = await createIntegrityCliFixture();
  const aliasRoot = `${rootDir}-alias`;
  await fs.symlink(rootDir, aliasRoot, "dir");
  t.after(() =>
    Promise.all([
      fs.rm(aliasRoot, { force: true, recursive: true }),
      fs.rm(rootDir, { force: true, recursive: true }),
    ]),
  );

  await assert.rejects(
    execFileAsync(
      process.execPath,
      [
        path.join(aliasRoot, "scripts", "check-toolcraft-integrity.mjs"),
        "--platform-only",
      ],
      { cwd: aliasRoot },
    ),
    (error) => {
      assert.equal(error.code, 1);
      assert.match(
        error.stderr,
        /Toolcraft verification inputs must not contain symbolic links: linked-package\.json/u,
      );
      return true;
    },
  );
});
