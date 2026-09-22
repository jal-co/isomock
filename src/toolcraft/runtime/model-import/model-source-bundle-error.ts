import type { ToolcraftSourceAssetFeedback } from "../source-assets/source-asset-types";

export class ToolcraftModelSourceBundleError
  extends Error
  implements ToolcraftSourceAssetFeedback
{
  readonly category: ToolcraftSourceAssetFeedback["category"];
  readonly code: string;

  constructor(
    category: ToolcraftSourceAssetFeedback["category"],
    code: string,
    message: string,
  ) {
    super(message);
    this.name = "ToolcraftModelSourceBundleError";
    this.category = category;
    this.code = code;
  }
}

export function failModelSourceBundle(
  category: ToolcraftSourceAssetFeedback["category"],
  code: string,
  message: string,
): never {
  throw new ToolcraftModelSourceBundleError(category, code, message);
}
