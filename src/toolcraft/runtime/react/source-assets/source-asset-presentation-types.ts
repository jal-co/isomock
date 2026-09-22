import type { FileDropPresentation } from "@/toolcraft/ui";

import type {
  ToolcraftSourceAssetFeedback,
  ToolcraftSourceAssetKind,
  ToolcraftSourceAssetOperationPhase,
} from "../../source-assets/source-asset-types";

export type ToolcraftFileDropPresentationStatus = {
  label: string;
  phase: Exclude<ToolcraftSourceAssetOperationPhase, "idle">;
  progress?: number;
};

export type ToolcraftFileDropPresentation = FileDropPresentation<
  ToolcraftSourceAssetKind,
  ToolcraftSourceAssetFeedback,
  ToolcraftFileDropPresentationStatus
>;
