import { cloneToolcraftMediaAssets } from "../../../../state/media-defaults";
import { readMediaAssets } from "../../../../state/persistence-reader-media";
import type { ToolcraftMediaAsset } from "../../../../state/types";
import type { ToolcraftWorkspaceSliceCodec } from "../../../../state/persistence-codec-types";

export function createMediaPersistenceCodec(project: (asset: ToolcraftMediaAsset) => ToolcraftMediaAsset): ToolcraftWorkspaceSliceCodec {
  return Object.freeze({
    fields: ["mediaAssets"],
    read: (_schema, data) => { const mediaAssets = readMediaAssets(data.mediaAssets); return mediaAssets ? { mediaAssets } : undefined; },
    write: state => ({ mediaAssets: cloneToolcraftMediaAssets(state.mediaAssets).map(project) }),
  });
}
