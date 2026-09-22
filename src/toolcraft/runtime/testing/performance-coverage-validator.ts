import type { ResolvedToolcraftAppSchema } from "../schema/resolved-app-schema";
import type { ToolcraftPerformanceConfig } from "./performance-types";
import { createToolcraftEnvelopeValidationContext } from "./performance-envelope-validation-context";
import { getToolcraftPerformanceFixtureAdapterErrors } from "./performance-fixture-adapters";
import { getToolcraftSchemaDiscreteSnapshotErrors } from "./performance-fixture-discrete-adapters";
import { getToolcraftPerformancePathCoverageErrors } from "./performance-path-coverage-policy";
import { getToolcraftPerformanceProfileErrors } from "./performance-profile-validation";
import { getRendererTechniqueErrors } from "./performance-renderer-technique-validation";
import { getToolcraftWorkloadEnvelopeErrorsForContext } from "./performance-workload-envelope-validation";
import { getRendererPipelineErrorsForEnvelopeContext } from "./performance-renderer-pipeline-validation";
import {
  TOOLCRAFT_STRICT_PERFORMANCE_COVERAGE_POLICY,
  type ToolcraftPerformanceCoverageValidationPolicy,
} from "./performance-coverage-policy";

export {
  TOOLCRAFT_FUNCTIONAL_PERFORMANCE_COVERAGE_POLICY,
  TOOLCRAFT_STRICT_PERFORMANCE_COVERAGE_POLICY,
  type ToolcraftPerformanceCoverageValidationPolicy,
} from "./performance-coverage-policy";

export function validateToolcraftPerformanceCoverage(
  schema: ResolvedToolcraftAppSchema,
  config: ToolcraftPerformanceConfig,
  policy: ToolcraftPerformanceCoverageValidationPolicy = TOOLCRAFT_STRICT_PERFORMANCE_COVERAGE_POLICY,
): string[] {
  const initialContext = createToolcraftEnvelopeValidationContext(
    schema,
    config,
  );
  const workloadEnvelopeErrors =
    getToolcraftWorkloadEnvelopeErrorsForContext(initialContext);
  const context = {
    ...initialContext,
    workloadEnvelopeValid: workloadEnvelopeErrors.length === 0,
  };
  return [
    ...workloadEnvelopeErrors,
    ...getRendererTechniqueErrors(context),
    ...getRendererPipelineErrorsForEnvelopeContext(context, policy),
    ...getToolcraftPerformanceProfileErrors(context.paths),
    ...getToolcraftPerformancePathCoverageErrors(context),
    ...(Object.prototype.hasOwnProperty.call(config, "fixtureAdapters") &&
    context.workloadEnvelopeValid
      ? getToolcraftPerformanceFixtureAdapterErrors(config, context.paths)
      : []),
    ...(context.workloadEnvelopeValid
      ? getToolcraftSchemaDiscreteSnapshotErrors(schema, config)
      : []),
  ];
}
