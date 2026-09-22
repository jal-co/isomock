import { bytesToHex, sha256 } from "../model-import/canonical/sha256";
import type { ToolcraftDefaultResource } from "../schema/workspace-defaults-types";
import type { ToolcraftMediaAsset } from "../state/types";
import type { ToolcraftBinaryAssetRepository } from "./repository/binary-asset-repository";
import { collectToolcraftMediaResourceRefs } from "./repository/resource-reachability";
import { getToolcraftDefaultResourcePath } from "./default-resource-path";

export type ToolcraftDefaultResourceUpload = Readonly<{ resource: ToolcraftDefaultResource; bytes: Uint8Array }>;

export async function captureToolcraftDefaultResources(
  assets: readonly ToolcraftMediaAsset[], repository: ToolcraftBinaryAssetRepository,
  retain: (ref: string) => () => void,
): Promise<readonly ToolcraftDefaultResourceUpload[]> {
  if (assets.some(asset => !["ready", "clean", "fixed", "repairable"].includes(asset.lifecycle))) {
    throw new Error("Wait for all files to finish loading before saving defaults.");
  }
  const roots = [...collectToolcraftMediaResourceRefs(assets)];
  const release = roots.map(retain);
  try {
    const pending = [...roots];
    const seen = new Set<string>();
    const uploads: ToolcraftDefaultResourceUpload[] = [];
    while (pending.length) {
      const ref = pending.pop()!;
      if (seen.has(ref)) continue;
      seen.add(ref);
      const entry = await repository.get(ref);
      if (!entry) throw new Error(`Cannot save defaults: a file is unavailable (${ref}).`);
      const digest = bytesToHex(sha256(entry.bytes));
      uploads.push({ bytes: entry.bytes, resource: {
        ref, path: getToolcraftDefaultResourcePath(ref, digest), sha256: digest,
        byteLength: entry.bytes.byteLength, contentType: entry.contentType,
        dependencies: [...entry.dependencies], durable: entry.durable,
      } });
      pending.push(...entry.dependencies);
    }
    return uploads;
  } finally { release.forEach(dispose => dispose()); }
}
