import { getToolcraftArtifactExportActions } from "../schema/artifact-export-actions";
import type { ResolvedToolcraftAppSchema } from "../schema/resolved-app-schema";
import type { ToolcraftProductExportRenderer } from "./product-export-renderer";
import type { ToolcraftProductSvgExportRenderer } from "./product-svg-export-renderer";

export function getToolcraftExportRendererCoverageErrors({
  exportRenderer,
  productSceneRequired,
  schema,
  svgExportRenderer,
}: Readonly<{
  exportRenderer: ToolcraftProductExportRenderer | undefined;
  productSceneRequired: boolean;
  schema: ResolvedToolcraftAppSchema;
  svgExportRenderer: ToolcraftProductSvgExportRenderer | undefined;
}>): string[] {
  const errors: string[] = [];
  const exportRoles = new Set(
    getToolcraftArtifactExportActions(schema).map(({ role }) => role),
  );
  const hasRasterExportAction =
    exportRoles.has("export-image") || exportRoles.has("export-video");
  const hasSvgExportAction = exportRoles.has("export-svg");

  if (hasRasterExportAction && productSceneRequired && !exportRenderer) {
    errors.push(
      "Product-owned image/video export actions require exportRenderer.",
    );
  }
  if (exportRenderer && !productSceneRequired) {
    errors.push("exportRenderer requires a product-owned scene.");
  }
  if (exportRenderer && !hasRasterExportAction) {
    errors.push(
      "exportRenderer requires a typed image or video export action.",
    );
  }
  if (exportRenderer && exportRenderer.baseFileName.trim().length === 0) {
    errors.push("exportRenderer.baseFileName must not be blank.");
  }

  if (hasSvgExportAction && !svgExportRenderer) {
    errors.push("A typed SVG export action requires svgExportRenderer.");
  }
  if (svgExportRenderer && !hasSvgExportAction) {
    errors.push("svgExportRenderer requires a typed SVG export action.");
  }
  if (svgExportRenderer && svgExportRenderer.baseFileName.trim().length === 0) {
    errors.push("svgExportRenderer.baseFileName must not be blank.");
  }

  return errors;
}
