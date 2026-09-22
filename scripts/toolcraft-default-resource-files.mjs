import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

const digestPattern = /^[a-f0-9]{64}$/;
const maximumFileBytes = 512 * 1024 * 1024;
const fail = message => new Error(message);

export async function requireDefaultResourceDirectory(appRoot, parts, create = false) {
  let current = appRoot;
  for (const part of parts) {
    current = path.join(current, part);
    if (create) await fs.mkdir(current).catch(error => { if (error.code !== "EEXIST") throw error; });
    const stat = await fs.lstat(current);
    if (!stat.isDirectory() || stat.isSymbolicLink() || await fs.realpath(current) !== current) {
      throw fail("Default files must stay inside this project.");
    }
  }
  return current;
}

export function parseDefaultResourcePath(resourcePath) {
  const match = typeof resourcePath === "string" && /^toolcraft-defaults\/(?:(?:images|files|models\/(?:sources|bundles|documents|repairs|textures))\/)?([a-f0-9]{64})\.bin$/.exec(resourcePath);
  if (!match) throw fail("Invalid default resource path.");
  return { digest: match[1], parts: ["public", ...resourcePath.split("/")] };
}

async function verify(file, digest, byteLength) {
  const stat = await fs.lstat(file);
  if (!stat.isFile() || stat.isSymbolicLink() || (byteLength !== undefined && stat.size !== byteLength)) {
    throw fail("Invalid packaged default file.");
  }
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  if (hash.digest("hex") !== digest) throw fail("Default file failed its integrity check.");
}

/** Immutable blobs are staged first; the JSON rename publishes the snapshot. */
export async function saveDefaultResourceFile(appRoot, address, request, recordUpload) {
  const resourcePath = `toolcraft-defaults/${digestPattern.test(address) ? `${address}.bin` : address}`;
  const { digest, parts } = parseDefaultResourcePath(resourcePath);
  const dir = await requireDefaultResourceDirectory(appRoot, parts.slice(0, -1), true);
  const scratch = await requireDefaultResourceDirectory(appRoot, [".toolcraft", "scratch", "default-uploads"], true);
  const temporary = path.join(scratch, `${randomUUID()}.tmp`);
  const target = path.join(dir, `${digest}.bin`);
  const file = await fs.open(temporary, "wx");
  let byteLength = 0;
  const hash = createHash("sha256");
  try {
    for await (const chunk of request) {
      byteLength += chunk.length;
      if (byteLength > maximumFileBytes) throw Object.assign(fail("Default file exceeds 512 MB."), { status: 413 });
      hash.update(chunk);
      await file.writeFile(chunk);
    }
    if (hash.digest("hex") !== digest) throw fail("Uploaded default file failed its integrity check.");
    await file.close();
    const existing = await fs.lstat(target).catch(error => { if (error.code !== "ENOENT") throw error; return null; });
    if (existing) await verify(target, digest, byteLength);
    const owned = await fs.stat(existing ? target : temporary, { bigint: true });
    await recordUpload({
      path: resourcePath, sha256: digest, byteLength,
      createdFile: { dev: owned.dev.toString(), ino: owned.ino.toString() },
    }, existing ? "reused" : "created");
    // Never overwrite/adopt a destination created outside our upload queue.
    if (!existing) await fs.link(temporary, target);
    await verify(target, digest, byteLength);
  } finally {
    await file.close();
    await fs.rm(temporary, { force: true });
  }
  return { byteLength };
}

export async function verifyDefaultResourceFiles(appRoot, resources) {
  if (!resources?.length) return;
  for (const resource of resources) await verifyDefaultResourceFile(appRoot, resource);
}

export async function verifyDefaultResourceFile(appRoot, resource) {
  const { digest, parts } = parseDefaultResourcePath(resource.path);
  if (digest !== resource.sha256 || !Number.isSafeInteger(resource.byteLength) || resource.byteLength < 0) {
    throw fail("Invalid default resource metadata.");
  }
  const dir = await requireDefaultResourceDirectory(appRoot, parts.slice(0, -1));
  const file = path.join(dir, parts.at(-1));
  await verify(file, digest, resource.byteLength);
  return file;
}

export async function pruneEmptyDefaultResourceDirectories(appRoot, resourcePath) {
  const { parts } = parseDefaultResourcePath(resourcePath);
  // Only the exact managed ancestors are candidates; never recurse into files.
  for (let length = parts.length - 1; length >= 2; length -= 1) {
    try { await fs.rmdir(path.join(appRoot, ...parts.slice(0, length))); }
    catch (error) {
      if (error.code === "ENOENT") continue;
      if (error.code === "ENOTEMPTY" || error.code === "EEXIST") return;
      throw error;
    }
  }
}
