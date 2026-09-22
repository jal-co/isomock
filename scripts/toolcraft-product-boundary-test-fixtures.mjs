import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export async function createToolcraftProductBoundaryFixture(context, files) {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "toolcraft-boundary-"));
  context.after(() => fs.rm(rootDir, { force: true, recursive: true }));

  for (const [relativePath, source] of Object.entries(files)) {
    const filePath = path.join(rootDir, relativePath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, source);
  }

  return rootDir;
}
