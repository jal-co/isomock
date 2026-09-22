import { canvasEditingCapabilityProof } from "./canvas-editing";
import { imageExportCapabilityProof } from "./image-export";
import { layersCapabilityProof } from "./layers";
import { masksCapabilityProof } from "./masks";
import { mediaSourceCapabilityProof } from "./media-source";
import { model3dCapabilityProof } from "./model-3d";
import { spatialViewCapabilityProof } from "./spatial-view";
import { svgExportCapabilityProof } from "./svg-export";
import { timelineKeyframesCapabilityProof } from "./timeline-keyframes";
import { timelinePlaybackCapabilityProof } from "./timeline-playback";
import type { ToolcraftCapabilityProofCatalog } from "./types";
import { videoExportCapabilityProof } from "./video-export";

export const TOOLCRAFT_CAPABILITY_PROOF_CATALOG = Object.freeze({
  "artifact.image-export": imageExportCapabilityProof,
  "artifact.svg-export": svgExportCapabilityProof,
  "artifact.video-export": videoExportCapabilityProof,
  "canvas.editing": canvasEditingCapabilityProof,
  "foreground.soft-ellipses": masksCapabilityProof,
  "layers.management": layersCapabilityProof,
  "media.source": mediaSourceCapabilityProof,
  "model.3d": model3dCapabilityProof,
  "spatial.view": spatialViewCapabilityProof,
  "timeline.keyframes": timelineKeyframesCapabilityProof,
  "timeline.playback": timelinePlaybackCapabilityProof,
} satisfies ToolcraftCapabilityProofCatalog);
