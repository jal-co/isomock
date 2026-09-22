import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { parseDefaultResourcePath, pruneEmptyDefaultResourceDirectories, requireDefaultResourceDirectory, verifyDefaultResourceFile } from "./toolcraft-default-resource-files.mjs";
import { developmentFileGraceMs } from "./toolcraft-development-file-policy.mjs";

function resources(snapshot) {
  if (snapshot === null || snapshot?.version === 1) return [];
  if (snapshot?.version !== 2 || !Array.isArray(snapshot.resources)) throw new Error("Cannot read the previous default resource manifest.");
  return snapshot.resources;
}

function entry(resource) {
  const { digest } = parseDefaultResourcePath(resource?.path);
  if (digest !== resource.sha256 || !Number.isSafeInteger(resource.byteLength) || resource.byteLength < 0) throw new Error("Invalid retired resource metadata.");
  return { path: resource.path, sha256: digest, byteLength: resource.byteLength };
}

/** Host-private recovery record. A pending path never overrides current reachability. */
export function createDefaultResourceCleanup(appRoot, { now = Date.now } = {}) {
  const file = path.join(appRoot, ".toolcraft/default-resource-cleanup.json");
  let queue = Promise.resolve();
  const serialize = action => {
    const result = queue.then(action);
    queue = result.catch(() => {});
    return result;
  };
  async function read() {
    try {
      await requireDefaultResourceDirectory(appRoot, [".toolcraft"]);
      const stat = await fs.lstat(file);
      if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Default resource cleanup record must be a regular project file.");
      const value = JSON.parse(await fs.readFile(file, "utf8"));
      if (value.version !== 1 || !Array.isArray(value.resources)) throw new Error("Invalid default resource cleanup record.");
      return value.resources.map(resource => {
        const record = entry(resource);
        if (resource.eligibleAfter === undefined) return record;
        if (!Number.isSafeInteger(resource.eligibleAfter) || resource.eligibleAfter < 0) throw new Error("Invalid upload retention deadline.");
        if (!resource.createdFile || ![resource.createdFile.dev, resource.createdFile.ino].every(value => typeof value === "string" && /^\d+$/.test(value))) throw new Error("Invalid upload file identity.");
        return { ...record, eligibleAfter: resource.eligibleAfter, createdFile: resource.createdFile };
      });
    } catch (error) { if (error.code === "ENOENT") return []; throw error; }
  }
  async function write(pending) {
    await requireDefaultResourceDirectory(appRoot, [".toolcraft"], true);
    const temporary = `${file}.${randomUUID()}.tmp`;
    try {
      await fs.writeFile(temporary, JSON.stringify({ version: 1, resources: pending }, null, 2) + "\n", { flag: "wx" });
      await fs.rename(temporary, file);
    } finally { await fs.rm(temporary, { force: true }); }
  }
  return {
    // Persist ownership before a new public blob is linked. A crash before the
    // link leaves a harmless missing-file record; parallel uploads cannot lose it.
    recordUpload: (resource, ownership) => serialize(async () => {
      const pending = new Map((await read()).map(item => [item.path, item]));
      const previous = pending.get(resource.path);
      // Reusing an existing blob renews only our own unpublished file; hashes
      // alone never authorize adopting a pre-existing authored asset.
      if (ownership === "reused" && (!previous?.createdFile ||
          previous.createdFile.dev !== resource.createdFile.dev || previous.createdFile.ino !== resource.createdFile.ino)) return;
      if (ownership !== "created" && ownership !== "reused") throw new Error("Unknown default upload ownership.");
      pending.set(resource.path, {
        ...entry(resource), eligibleAfter: now() + developmentFileGraceMs, createdFile: resource.createdFile,
      });
      await write([...pending.values()]);
    }),
    prepare: (previous, next) => serialize(async () => {
      const active = new Set(resources(next).map(resource => resource.path));
      const pending = new Map((await read()).map(resource => [resource.path, resource]));
      for (const resource of resources(previous)) {
        if (!active.has(resource.path)) pending.set(resource.path, entry(resource));
      }
      // Active candidates remain recorded until the JSON commit succeeds.
      // finish() releases them against the actual on-disk snapshot.
      await write([...pending.values()]);
    }),
    finish: readCurrent => serialize(async () => {
      const pending = await read();
      if (!pending.length) return;
      const remaining = [];
      const failures = [];
      for (const resource of pending) {
        try {
          const active = new Set(resources(await readCurrent()).map(item => item.path));
          if (active.has(resource.path)) continue;
          if (resource.eligibleAfter > now()) { remaining.push(resource); continue; }
          const target = await verifyDefaultResourceFile(appRoot, resource);
          if (resource.createdFile) {
            const stat = await fs.lstat(target, { bigint: true });
            if (stat.dev.toString() !== resource.createdFile.dev || stat.ino.toString() !== resource.createdFile.ino) throw new Error("An unpublished default file was replaced outside Toolcraft.");
          }
          // Recheck after file I/O, in case the source was edited outside this server.
          if (resources(await readCurrent()).some(item => item.path === resource.path)) continue;
          await fs.unlink(target);
          await pruneEmptyDefaultResourceDirectories(appRoot, resource.path);
        } catch (error) {
          if (error.code === "ENOENT") continue;
          remaining.push(resource);
          failures.push(error);
        }
      }
      await write(remaining);
      if (failures.length) throw new Error(`Defaults were saved, but ${failures.length} unused managed file(s) could not be removed. Retry Save State as Default after resolving: ${failures[0].message}`);
    }),
  };
}
