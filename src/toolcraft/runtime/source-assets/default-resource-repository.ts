import { bytesToHex, sha256 } from "../model-import/canonical/sha256";
import type { ToolcraftDefaultResource } from "../schema/workspace-defaults-types";
import { createToolcraftBinaryAssetRepositoryEntry, type ToolcraftBinaryAssetRepository, type ToolcraftBinaryAssetRepositoryEntry } from "./repository/binary-asset-repository";

/** Published source resources enter through the canonical repository boundary. */
export function withToolcraftDefaultResources(
  repository: ToolcraftBinaryAssetRepository,
  resources: readonly ToolcraftDefaultResource[],
  fetchResource: typeof fetch = (...args) => fetch(...args),
): ToolcraftBinaryAssetRepository {
  if (!resources.length) return repository;
  const manifest = new Map(resources.map(resource => [resource.ref, resource]));
  const pending = new Map<string, Promise<ToolcraftBinaryAssetRepositoryEntry>>();
  const abort = new AbortController();
  return {
    beginLease: jobId => repository.beginLease(jobId),
    collect: refs => repository.collect(new Set([...refs, ...manifest.keys()])),
    dispose: async () => {
      abort.abort();
      await Promise.allSettled(pending.values());
      await repository.dispose();
    },
    async get(ref) {
      const stored = await repository.get(ref);
      if (stored) return stored;
      const resource = manifest.get(ref);
      if (!resource) return null;
      let task = pending.get(ref);
      if (!task) {
        task = (async () => {
          // Manifest paths are validated fixed public paths, never sourcePaths.
          const response = await fetchResource(`/${resource.path}`, { signal: abort.signal });
          if (!response.ok) throw new Error(`Default asset could not be loaded (${response.status}).`);
          const bytes = new Uint8Array(await response.arrayBuffer());
          if (bytes.byteLength !== resource.byteLength || bytesToHex(sha256(bytes)) !== resource.sha256) {
            throw new Error("Default asset failed its integrity check.");
          }
          const entry = createToolcraftBinaryAssetRepositoryEntry(ref, bytes, resource);
          const lease = await repository.beginLease(`default-resource:${ref}`);
          try {
            await lease.put(ref, bytes, resource);
            await lease.commit();
          } catch (error) { await lease.rollback(); throw error; }
          return entry;
        })();
        pending.set(ref, task);
      }
      try { return await task; }
      finally { pending.delete(ref); }
    },
  };
}
