import fs from "node:fs/promises";
import path from "node:path";

const windowsUnsupportedDirectorySyncErrors = new Set([
  "EACCES",
  "EBADF",
  "EISDIR",
  "EINVAL",
  "ENOTSUP",
  "EPERM",
]);

async function writeDurableCheckpointFile(filePath, contents) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const handle = await fs.open(filePath, "w", 0o600);
  try {
    await handle.writeFile(contents);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function syncDirectory(directoryPath) {
  let handle;
  try {
    handle = await fs.open(directoryPath, "r");
    await handle.sync();
  } catch (error) {
    if (
      process.platform === "win32" &&
      windowsUnsupportedDirectorySyncErrors.has(error?.code)
    ) {
      return;
    }
    throw error;
  } finally {
    await handle?.close();
  }
}

async function runDurableCheckpointMutation({
  directoryPath,
  mutate,
  observeDurabilityBarrier,
  phase,
  targetPath,
}) {
  await mutate();
  await syncDirectory(directoryPath);
  await observeDurabilityBarrier?.({ phase, targetPath });
}

export async function writeDurableCheckpointAtomic({
  assertCommitPrecondition,
  contents,
  filePath,
  observeDurabilityBarrier,
  phase,
  renameFile = fs.rename,
  temporaryPath,
}) {
  await writeDurableCheckpointFile(temporaryPath, contents);
  try {
    await observeDurabilityBarrier?.({
      phase: "checkpoint-prepared",
      targetPath: filePath,
    });
    await assertCommitPrecondition?.();
  } catch (error) {
    await fs.rm(temporaryPath, { force: true });
    throw error;
  }
  try {
    await runDurableCheckpointMutation({
      directoryPath: path.dirname(filePath),
      mutate: () => renameFile(temporaryPath, filePath),
      observeDurabilityBarrier,
      phase,
      targetPath: filePath,
    });
  } catch (error) {
    try {
      await fs.rm(temporaryPath, { force: true });
    } catch {
      // Preserve the rename, sync, or observer failure that prevented completion.
    }
    throw error;
  }
}
