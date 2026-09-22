import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createToolcraftDeliveryArchitectureReport } from "./toolcraft-delivery-architecture-policy.mjs";

export async function withDeliveryArchitectureFixture(
  files,
  assertion,
  policy = {},
) {
  const rootDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "toolcraft-delivery-architecture-"),
  );
  try {
    for (const [repoPath, source] of Object.entries(files)) {
      const absolutePath = path.join(rootDir, repoPath);
      await fs.mkdir(path.dirname(absolutePath), { recursive: true });
      await fs.writeFile(absolutePath, source);
    }
    await assertion(
      await createToolcraftDeliveryArchitectureReport({
        allowedProcessImporters: [],
        behaviorModules: [],
        directionRules: [],
        obsoleteBasenames: [],
        productionEntryRoots: ["scripts/run-delivery-verification.mjs"],
        rootDir,
        scriptsRoot: "scripts",
        ...policy,
      }),
    );
  } finally {
    await fs.rm(rootDir, { force: true, recursive: true });
  }
}

export function repeatedLines(line, count) {
  return line.repeat(count);
}
