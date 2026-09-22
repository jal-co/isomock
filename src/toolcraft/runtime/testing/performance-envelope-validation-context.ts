import type { ResolvedToolcraftAppSchema } from "../schema/resolved-app-schema";
import type { ToolcraftPerformancePath } from "./performance-path-model";
import { deriveToolcraftPerformancePathsFromParsedPipeline } from "./performance-paths";
import {
  parseToolcraftRendererPipeline,
  type ToolcraftRendererPipelineParseResult,
} from "./performance-renderer-pipeline-parser";
import type { ToolcraftEnvelopePerformanceConfig } from "./performance-types";
import { getEnvelopeDimensions } from "./performance-workload-envelope-shared";

export type ToolcraftEnvelopeValidationContext = {
  config: ToolcraftEnvelopePerformanceConfig;
  parsedPipeline: ToolcraftRendererPipelineParseResult;
  paths: readonly ToolcraftPerformancePath[];
  schema: ResolvedToolcraftAppSchema;
  workloadEnvelopeValid: boolean;
};

export function createToolcraftEnvelopeValidationContext(
  schema: ResolvedToolcraftAppSchema,
  config: ToolcraftEnvelopePerformanceConfig,
): ToolcraftEnvelopeValidationContext {
  const parsedPipeline = parseToolcraftRendererPipeline(
    config.rendererPipeline as unknown,
  );
  return {
    config,
    parsedPipeline,
    paths: deriveToolcraftPerformancePathsFromParsedPipeline(parsedPipeline),
    schema,
    workloadEnvelopeValid: getEnvelopeDimensions(config).dimensions !== null,
  };
}
