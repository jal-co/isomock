export type ToolcraftPerformanceCoverageValidationPolicy = Readonly<{
  unresolvedKernelBenchmarks: "defer" | "error";
}>;

export const TOOLCRAFT_STRICT_PERFORMANCE_COVERAGE_POLICY:
  ToolcraftPerformanceCoverageValidationPolicy = Object.freeze({
    unresolvedKernelBenchmarks: "error",
  });

export const TOOLCRAFT_FUNCTIONAL_PERFORMANCE_COVERAGE_POLICY:
  ToolcraftPerformanceCoverageValidationPolicy = Object.freeze({
    unresolvedKernelBenchmarks: "defer",
  });
