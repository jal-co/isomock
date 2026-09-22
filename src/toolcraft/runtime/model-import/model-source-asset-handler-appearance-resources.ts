import type { ToolcraftSourceAssetPrepareContext } from "../source-assets/source-asset-types";
import type { ToolcraftModelAppearanceResource } from "./model-import-types";

export async function stageToolcraftModelAppearanceResources(
  context: ToolcraftSourceAssetPrepareContext,
  resources: readonly ToolcraftModelAppearanceResource[],
  stagedRefs: Set<string>,
): Promise<void> {
  const unstaged = resources.filter(
    ({ resourceRef }) => !stagedRefs.has(resourceRef),
  );
  await Promise.all(unstaged.map((resource) =>
    context.stageResource(
      resource.resourceRef,
      new Uint8Array(resource.bytes),
      { contentType: resource.mimeType, durable: false },
    )
  ));
  for (const { resourceRef } of unstaged) stagedRefs.add(resourceRef);
}
