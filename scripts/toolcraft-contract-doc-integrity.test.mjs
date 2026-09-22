import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";

import { getToolcraftContractDocIntegrityFailures } from "./toolcraft-contract-doc-integrity.mjs";

const temporaryRoots = [];

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((rootDir) =>
      fs.rm(rootDir, { force: true, recursive: true }),
    ),
  );
});

async function createContractDocs(files) {
  const appRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "toolcraft-contract-doc-integrity-"),
  );
  temporaryRoots.push(appRoot);

  for (const [relativePath, source] of Object.entries(files)) {
    const filePath = path.join(appRoot, relativePath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, source);
  }

  return appRoot;
}

test("rejects unrecorded contract docs", async () => {
  const appRoot = await createContractDocs({
    "docs/toolcraft/agent-worklog.md": "# Worklog\n",
    "docs/toolcraft/core/layout.md": "# Layout\n",
    "docs/toolcraft/core/override.md": "# Override\n",
  });

  assert.deepEqual(
    await getToolcraftContractDocIntegrityFailures({
      appRoot,
      protectedRelativePaths: ["docs/toolcraft/core/layout.md"],
    }),
    ["added docs/toolcraft/core/override.md"],
  );
});

test("requires the editable agent worklog without hashing its contents", async () => {
  const appRoot = await createContractDocs({
    "docs/toolcraft/core/layout.md": "# Layout\n",
  });

  assert.deepEqual(
    await getToolcraftContractDocIntegrityFailures({
      appRoot,
      protectedRelativePaths: ["docs/toolcraft/core/layout.md"],
    }),
    ["deleted docs/toolcraft/agent-worklog.md"],
  );
});

test("accepts an optional product-owned workflow observation", async () => {
  const appRoot = await createContractDocs({
    "docs/toolcraft/agent-worklog.md": "# Worklog\n",
    "docs/toolcraft/workflow-observation.md": "# Observation\n",
    "docs/toolcraft/core/layout.md": "# Layout\n",
  });

  assert.deepEqual(
    await getToolcraftContractDocIntegrityFailures({
      appRoot,
      protectedRelativePaths: ["docs/toolcraft/core/layout.md"],
    }),
    [],
  );
});

test("rejects symbolic links inside the contract docs directory", async () => {
  const appRoot = await createContractDocs({
    "docs/toolcraft/agent-worklog.md": "# Worklog\n",
    "docs/toolcraft/core/layout.md": "# Layout\n",
  });
  await fs.symlink(
    path.join(appRoot, "docs/toolcraft/core/layout.md"),
    path.join(appRoot, "docs/toolcraft/core/linked-contract.md"),
  );

  assert.deepEqual(
    await getToolcraftContractDocIntegrityFailures({
      appRoot,
      protectedRelativePaths: ["docs/toolcraft/core/layout.md"],
    }),
    ["unsupported contract doc entry docs/toolcraft/core/linked-contract.md"],
  );
});
