import { getToolcraftPerformanceFixtureRegistryErrors } from "./performance-fixture-plan-analysis";
import type { ToolcraftPerformancePath } from "./performance-path-model";
import { deriveToolcraftPerformancePathsFromParsedPipeline } from "./performance-paths";
import { parseToolcraftRendererPipeline } from "./performance-renderer-pipeline-parser";
import type {
  ToolcraftEnvelopePerformanceConfig,
  ToolcraftPerformanceFixtureAdapter,
} from "./performance-types";

export function defineToolcraftFixtureAdapter<AppliedValue>(
  adapter: ToolcraftPerformanceFixtureAdapter<AppliedValue>,
): ToolcraftPerformanceFixtureAdapter<AppliedValue> {
  return adapter;
}

export function getToolcraftPerformanceFixtureAdapterErrors(
  config: ToolcraftEnvelopePerformanceConfig,
  paths: readonly ToolcraftPerformancePath[] =
    deriveToolcraftPerformancePathsFromParsedPipeline(
      parseToolcraftRendererPipeline(config.rendererPipeline as unknown),
    ),
): string[] {
  return getToolcraftPerformanceFixtureRegistryErrors(config, paths);
}
