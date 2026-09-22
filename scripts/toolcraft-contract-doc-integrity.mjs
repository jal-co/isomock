import fs from "node:fs/promises";
import path from "node:path";

const contractDocsRoot = "docs/toolcraft";
const requiredEditableContractDocPaths = new Set([
  "docs/toolcraft/agent-worklog.md",
]);
const optionalEditableContractDocPaths = new Set([
  "docs/toolcraft/workflow-observation.md",
]);

async function collectRelativeEntries(rootDir, relativeRoot) {
  const entriesFound = [];

  async function visit(currentDir, currentRelativeDir) {
    let entries;

    try {
      entries = await fs.readdir(currentDir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const filePath = path.join(currentDir, entry.name);
      const relativePath = path.posix.join(currentRelativeDir, entry.name);

      if (entry.isDirectory()) {
        await visit(filePath, relativePath);
      } else {
        entriesFound.push({
          isFile: entry.isFile(),
          relativePath,
        });
      }
    }
  }

  await visit(rootDir, relativeRoot);
  return entriesFound;
}

export async function getToolcraftContractDocIntegrityFailures({
  appRoot,
  protectedRelativePaths,
}) {
  const actualEntries = await collectRelativeEntries(
    path.join(appRoot, ...contractDocsRoot.split("/")),
    contractDocsRoot,
  );
  const actualPaths = new Set(
    actualEntries.map(({ relativePath }) => relativePath),
  );
  const allowedPaths = new Set([
    ...requiredEditableContractDocPaths,
    ...optionalEditableContractDocPaths,
    ...[...protectedRelativePaths].filter((relativePath) =>
      relativePath.startsWith(`${contractDocsRoot}/`),
    ),
  ]);
  const failures = [];

  for (const relativePath of requiredEditableContractDocPaths) {
    if (!actualPaths.has(relativePath)) {
      failures.push(`deleted ${relativePath}`);
    }
  }

  for (const { isFile, relativePath } of actualEntries) {
    if (!isFile) {
      failures.push(`unsupported contract doc entry ${relativePath}`);
      continue;
    }

    if (!allowedPaths.has(relativePath)) {
      failures.push(`added ${relativePath}`);
    }
  }

  return failures;
}
