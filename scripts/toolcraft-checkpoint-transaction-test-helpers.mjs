import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export async function createCheckpointFixture() {
  const rootDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "toolcraft-checkpoint-transaction-"),
  );
  const verificationDir = path.join(rootDir, ".toolcraft", "verification");
  await fs.mkdir(verificationDir, { recursive: true });
  return { rootDir, verificationDir };
}
