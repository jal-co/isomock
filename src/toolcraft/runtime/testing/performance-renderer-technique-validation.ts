import type {
  ToolcraftRendererLayer,
  ToolcraftRendererLayerContent,
  ToolcraftRendererStrategy,
  ToolcraftRendererTechnique,
} from "./performance-types";
import type { ToolcraftEnvelopeValidationContext } from "./performance-envelope-validation-context";
import { getToolcraftRendererGpuErrors } from "./performance-renderer-gpu-validation";

const rasterRendererStrategies = new Set<ToolcraftRendererStrategy>([
  "canvas-2d",
  "webgl",
  "webgpu",
]);

const semanticForegroundContent = new Set<ToolcraftRendererLayerContent>([
  "geometry",
  "text",
]);

const vectorLayerRendererStrategies = new Set<ToolcraftRendererStrategy>(["dom", "svg"]);

function hasNonEmptyItems(items: readonly string[]): boolean {
  return items.length > 0;
}

function getLayerContentFamily(content: ToolcraftRendererLayerContent): string {
  if (content === "geometry" || content === "handles") {
    return "vector";
  }

  if (content === "text") {
    return "text";
  }

  if (
    content === "bitmap-media" ||
    content === "dense-pattern" ||
    content === "noise" ||
    content === "shader"
  ) {
    return "pixel";
  }

  return "composite";
}

function hasSemanticForegroundContent(layer: ToolcraftRendererLayer): boolean {
  return layer.content.some((content) => semanticForegroundContent.has(content));
}

function getRendererLayerErrors(technique: ToolcraftRendererTechnique): string[] {
  const errors: string[] = [];
  const layers = technique.layers ?? [];

  if (technique.productRepresentation === "mixed" && layers.length === 0) {
    errors.push(
      'productRepresentation "mixed" requires rendererTechnique.layers so mixed output is machine-checkable.',
    );
  }

  if (technique.productRepresentation === "mixed") {
    const contentFamilies = new Set(
      layers.flatMap((layer) => layer.content.map((content) => getLayerContentFamily(content))),
    );
    contentFamilies.delete("composite");

    if (contentFamilies.size < 2) {
      errors.push(
        'productRepresentation "mixed" requires rendererTechnique.layers with at least two different content families.',
      );
    }
  }

  for (const layer of layers) {
    if (!layer.id.trim()) {
      errors.push("rendererTechnique layers must have non-empty ids.");
    }

    if (!hasNonEmptyItems(layer.content)) {
      errors.push(`rendererTechnique layer "${layer.id}" must list content.`);
    }

    if (
      layer.kind === "product-foreground" &&
      hasSemanticForegroundContent(layer) &&
      layer.primitiveCount !== "high" &&
      rasterRendererStrategies.has(layer.renderer) &&
      !layer.intentionalRasterizationReason?.trim()
    ) {
      errors.push(
        `rendererTechnique layer "${layer.id}" uses ${layer.renderer} for low-count semantic geometry/text. Use dom/svg for semantic foreground or provide intentionalRasterizationReason.`,
      );
    }

    if (
      (layer.kind === "product-foreground" || layer.kind === "editing-handles") &&
      !layer.uiSelector?.trim()
    ) {
      errors.push(
        `rendererTechnique layer "${layer.id}" is ${layer.kind} and must declare uiSelector so browser tests can verify the visible renderer layer.`,
      );
    }

    if (
      layer.kind === "editing-handles" &&
      (!vectorLayerRendererStrategies.has(layer.renderer) || layer.exportMode !== "excluded")
    ) {
      errors.push(
        `rendererTechnique layer "${layer.id}" is editing-handles and must use dom/svg with exportMode "excluded".`,
      );
    }
  }

  return errors;
}

export function getRendererTechniqueErrors(
  context: ToolcraftEnvelopeValidationContext,
): string[] {
  const errors: string[] = [];
  const { config } = context;
  const technique = config.rendererTechnique;

  if (config.usesCustomRenderer && !technique) {
    return [
      "Custom renderers must declare rendererTechnique so renderer choice is machine-checkable.",
    ];
  }

  if (!config.usesCustomRenderer && technique) {
    errors.push("Non-custom renderer configs must omit rendererTechnique.");
  }

  if (!technique) {
    return errors;
  }

  if (technique.rendererStrategy !== config.rendererStrategy) {
    errors.push(
      `rendererTechnique.rendererStrategy "${technique.rendererStrategy}" must match rendererStrategy "${config.rendererStrategy}".`,
    );
  }

  if (config.usesCustomRenderer && !hasNonEmptyItems(technique.whyNotAlternativeStrategies)) {
    errors.push(
      "Custom renderer technique must explain why alternative renderer strategies were rejected.",
    );
  }

  if (config.usesCustomRenderer && !hasNonEmptyItems(technique.fidelityRisks)) {
    errors.push("Custom renderer technique must list fidelity risks.");
  }

  if (config.usesCustomRenderer && !hasNonEmptyItems(technique.performanceRisks)) {
    errors.push("Custom renderer technique must list performance risks.");
  }

  if (
    technique.previewRenderer !== technique.exportRenderer &&
    technique.exportRenderer !== "none" &&
    !technique.previewExportDifferenceReason?.trim()
  ) {
    errors.push("Different preview/export renderers require previewExportDifferenceReason.");
  }

  if (
    technique.sourceRepresentation === "reference-runtime" &&
    technique.previewRenderer !== technique.rendererStrategy &&
    !technique.referenceRendererChangeReason?.trim()
  ) {
    errors.push("Reference runtime renderer changes require referenceRendererChangeReason.");
  }

  errors.push(...getRendererLayerErrors(technique));
  errors.push(...getToolcraftRendererGpuErrors(context));

  return errors;
}
