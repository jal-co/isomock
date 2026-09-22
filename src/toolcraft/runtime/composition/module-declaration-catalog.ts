import { validateContribution as masks } from "../modules/built-ins/masks/declaration";
import { validateContribution as canvas_editing } from "../modules/built-ins/canvas-editing/declaration";
import { validateContribution as spatial_view } from "../modules/built-ins/spatial-view/declaration";
import { validateContribution as layers } from "../modules/built-ins/layers/declaration";
import { validateContribution as media_source } from "../modules/built-ins/media-source/declaration";
import { validateContribution as timeline } from "../modules/built-ins/timeline/declaration";
import { validateContribution as svg_export } from "../modules/built-ins/svg-export/declaration";
import { validateContribution as image_export } from "../modules/built-ins/image-export/declaration";
import { validateContribution as video_export } from "../modules/built-ins/video-export/declaration";
import { validateContribution as model_3d } from "../modules/built-ins/model-3d/declaration";
import type { ToolcraftProductModuleId } from "../modules/contract/capability";
import type { ToolcraftProductModuleContribution } from "../modules/contract/contribution";
import type { ToolcraftContributionValidator } from "../modules/contract/validate-module-contribution";

const validators = Object.freeze({
  masks,
  "canvas-editing": canvas_editing,
  "spatial-view": spatial_view,
  "layers": layers,
  "media-source": media_source,
  "timeline": timeline,
  "svg-export": svg_export,
  "image-export": image_export,
  "video-export": video_export,
  "model-3d": model_3d,
} satisfies Record<ToolcraftProductModuleId, ToolcraftContributionValidator>);

export function validateBuiltInModuleContribution(contribution: ToolcraftProductModuleContribution): ToolcraftProductModuleContribution {
  const validate = validators[contribution.moduleId];
  if (!validate) throw new Error(`Unknown Toolcraft module contribution id "${contribution.id}".`);
  return validate(contribution);
}
