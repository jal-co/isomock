import type { ToolcraftSourceAssetFeedback } from "../../source-assets/source-asset-types";

export const TOOLCRAFT_MODEL_PRESENTATION_CONSUMER_MISSING_FEEDBACK:
  ToolcraftSourceAssetFeedback = Object.freeze({
    category: "resource-unavailable",
    code: "model-presentation-consumer-missing",
    message: "The declared model presentation consumer is not mounted.",
  });

export const TOOLCRAFT_MODEL_PRESENTATION_UNAVAILABLE_FEEDBACK:
  ToolcraftSourceAssetFeedback = Object.freeze({
    category: "resource-unavailable",
    code: "model-presentation-unavailable",
    message: "The model presentation is unavailable. Retry or replace the model package.",
  });
