import { mkdir, open, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === "EPERM";
  }
}

async function clearStaleLock(lockPath) {
  try {
    const lock = JSON.parse(await readFile(lockPath, "utf8"));
    if (isProcessAlive(lock.pid)) return false;
  } catch (error) {
    if (error?.code === "ENOENT") return true;
    const lockStat = await stat(lockPath).catch(() => undefined);
    if (lockStat && Date.now() - lockStat.mtimeMs < 60_000) return false;
  }
  await rm(lockPath, { force: true });
  return true;
}

export async function withToolcraftVerificationLock(projectDir, operation) {
  const verificationDir = path.join(
    path.resolve(projectDir),
    ".toolcraft",
    "verification",
  );
  const lockPath = path.join(verificationDir, "delivery.lock");
  await mkdir(verificationDir, { recursive: true });

  let handle;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      handle = await open(lockPath, "wx");
      break;
    } catch (error) {
      if (error?.code !== "EEXIST" || !(await clearStaleLock(lockPath))) {
        throw new Error(
          "Another Toolcraft verification run is already active for this project.",
        );
      }
    }
  }
  if (!handle) {
    throw new Error(
      "Another Toolcraft verification run is already active for this project.",
    );
  }

  try {
    await handle.writeFile(
      `${JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() })}\n`,
    );
    return await operation();
  } finally {
    await handle.close();
    await rm(lockPath, { force: true });
  }
}
