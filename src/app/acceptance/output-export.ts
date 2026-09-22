import type { ResolvedToolcraftAppSchema } from "@/toolcraft/runtime";

import { validateToolcraftArtifactExportIntentCorrespondence } from "./artifact-export-intent";
import {
  getToolcraftOutputBackgroundErrors,
  isOutputBackgroundToggleControl,
} from "./output-background-rules";
import {
  schemaHasPngExportPanelAction,
  schemaHasSvgExportPanelAction,
  schemaHasVideoExportPanelAction,
} from "./output-export-actions";
import { getToolcraftOutputExportLayoutErrors } from "./output-export-layout-rules";
import { buildToolcraftOutputExportFacts } from "./output-export-model";
import { getToolcraftImageExportErrors } from "./output-image-export-rules";
import { getToolcraftVideoExportErrors } from "./output-video-export-rules";
import { getToolcraftExportArtifactActionPlacementErrors } from "./export-artifact-coverage";
import type {
  ToolcraftComponentAcceptance,
  ToolcraftProductReadiness,
  ToolcraftVisibleControl,
} from "./types";

export {
  isOutputBackgroundToggleControl,
  schemaHasPngExportPanelAction,
  schemaHasSvgExportPanelAction,
  schemaHasVideoExportPanelAction,
};

export function getToolcraftOutputExportErrors({
  acceptance,
  controls,
  productReadiness,
  schema,
}: {
  acceptance: readonly ToolcraftComponentAcceptance[];
  controls: readonly ToolcraftVisibleControl[];
  productReadiness: ToolcraftProductReadiness;
  schema: ResolvedToolcraftAppSchema;
}): string[] {
  const exportArtifactCoverageErrors =
    getToolcraftExportArtifactActionPlacementErrors(schema);
  if (productReadiness.mode === "starter") {
    return exportArtifactCoverageErrors;
  }

  const facts = buildToolcraftOutputExportFacts({ schema });
  const { delivery, errors: intentErrors } =
    validateToolcraftArtifactExportIntentCorrespondence({
      hasImageExportAction: facts.hasImageExportAction,
      hasImageExportSection: facts.imageExportSection !== undefined,
      hasSvgExportAction: facts.hasSvgExportAction,
      hasVideoExportAction: facts.hasVideoExportAction,
      hasVideoExportSection: facts.videoExportSection !== undefined,
      intent: productReadiness.exportIntent,
    });

  return [
    ...intentErrors,
    ...(delivery.imageEnabled ? getToolcraftImageExportErrors(facts) : []),
    ...(delivery.videoEnabled ? getToolcraftVideoExportErrors(facts) : []),
    ...(delivery.imageEnabled || delivery.svgEnabled || delivery.videoEnabled
      ? getToolcraftOutputBackgroundErrors({ controls, facts })
      : []),
    ...getToolcraftOutputExportLayoutErrors({ delivery, facts }),
    ...exportArtifactCoverageErrors,
  ];
}
