import type { ToolcraftDefaultResource } from "../schema/workspace-defaults-types";
import { isToolcraftPersistenceRecord as isRecord } from "../state/persistence-shared";
import { collectToolcraftMediaResourceRefs } from "./repository/resource-reachability";
import { isToolcraftDefaultResourcePath } from "./default-resource-path";

export function parseToolcraftDefaultResources(input: unknown, assets: unknown): readonly ToolcraftDefaultResource[] {
  if (!Array.isArray(input)) throw new Error("Missing default resource manifest.");
  const resources = new Map<string, ToolcraftDefaultResource>();
  for (const entry of input) {
    if (!isRecord(entry) || Object.keys(entry).sort().join() !== "byteLength,contentType,dependencies,durable,path,ref,sha256" ||
        typeof entry.ref !== "string" || !entry.ref.length || entry.ref.trim() !== entry.ref || resources.has(entry.ref) ||
        typeof entry.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(entry.sha256) ||
        !isToolcraftDefaultResourcePath(entry.path, entry.ref, entry.sha256) ||
        !Number.isSafeInteger(entry.byteLength) || Number(entry.byteLength) < 0 ||
        typeof entry.contentType !== "string" || !entry.contentType.trim() || entry.contentType.trim() !== entry.contentType || typeof entry.durable !== "boolean" ||
        !Array.isArray(entry.dependencies) || entry.dependencies.length > 4096 ||
        !entry.dependencies.every(ref => typeof ref === "string" && ref.length > 0 && ref.trim() === ref && ref !== entry.ref) ||
        new Set(entry.dependencies).size !== entry.dependencies.length) {
      throw new Error("Invalid packaged default resource.");
    }
    resources.set(entry.ref, entry as ToolcraftDefaultResource);
  }
  if (Array.isArray(assets)) {
    for (const asset of assets) {
      if (!isRecord(asset) || (asset.assetKind !== "image" && asset.assetKind !== "file")) continue;
      const resource = resources.get(String(asset.resourceRef));
      if (resource && resource.ref !== `media:${asset.assetKind}:sha256:${resource.sha256}`) {
        throw new Error("Default media identity does not match its packaged bytes.");
      }
    }
  }
  const pending = [...collectToolcraftMediaResourceRefs(assets)];
  const seen = new Set<string>();
  while (pending.length) {
    const ref = pending.pop()!;
    if (seen.has(ref)) continue;
    seen.add(ref);
    const resource = resources.get(ref);
    if (!resource) throw new Error(`Default media resource is missing: ${ref}.`);
    pending.push(...resource.dependencies);
  }
  if (seen.size !== resources.size) throw new Error("Default resources contain unreferenced files.");
  return [...resources.values()];
}
