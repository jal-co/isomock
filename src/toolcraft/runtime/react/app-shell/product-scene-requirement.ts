import * as React from "react";

import { getToolcraftExportRendererCoverageErrors } from "../../export/export-renderer-coverage";
import type { ToolcraftProductExportRenderer } from "../../export/product-export-renderer";
import type { ToolcraftProductSvgExportRenderer } from "../../export/product-svg-export-renderer";
import type { AnyToolcraftRendererPipelineRegistration } from "../../rendering";
import type { ResolvedToolcraftAppSchema } from "../../schema/resolved-app-schema";
import type { ToolcraftModelPresentationMode } from "../model-rendering/model-render-binding";

export type ToolcraftProductSceneRequirement = Readonly<{
  independentlyRequired: boolean;
  productSceneRequired: boolean;
  suppressedModelTargets: readonly string[];
}>;

export function hasToolcraftProductSceneContent(
  canvasContent: React.ReactNode,
): boolean {
  return React.Children.count(canvasContent) > 0;
}

export function resolveToolcraftProductSceneRequirement({
  canvasContent,
  modelPresentation,
  rendererPipelineRegistration,
}: Readonly<{
  canvasContent: React.ReactNode;
  modelPresentation: ToolcraftModelPresentationMode;
  rendererPipelineRegistration:
    | AnyToolcraftRendererPipelineRegistration
    | undefined;
}>): ToolcraftProductSceneRequirement {
  const suppressedModelTargets =
    modelPresentation.mode === "custom"
      ? modelPresentation.consumers.map(({ sourceTarget }) => sourceTarget)
      : [];
  const independentlyRequired =
    rendererPipelineRegistration !== undefined ||
    suppressedModelTargets.length > 0;

  return Object.freeze({
    independentlyRequired,
    productSceneRequired:
      hasToolcraftProductSceneContent(canvasContent) || independentlyRequired,
    suppressedModelTargets: Object.freeze(suppressedModelTargets),
  });
}

export function assertToolcraftProductSceneExportCoverage({
  exportRenderer,
  productSceneRequired,
  schema,
  svgExportRenderer,
}: Readonly<{
  exportRenderer: ToolcraftProductExportRenderer | undefined;
  productSceneRequired: boolean;
  schema: ResolvedToolcraftAppSchema;
  svgExportRenderer: ToolcraftProductSvgExportRenderer | undefined;
}>): void {
  const errors = getToolcraftExportRendererCoverageErrors({
    exportRenderer,
    productSceneRequired,
    schema,
    svgExportRenderer,
  });
  if (errors.length > 0) {
    throw new Error(
      `Toolcraft export renderer configuration is invalid:\n- ${errors.join("\n- ")}`,
    );
  }
}
