import type { ResolvedToolcraftAppSchema } from "../schema/resolved-app-schema";
import { getToolcraftPerformanceProfileForInteraction } from "./performance-interaction-policy";
import { createToolcraftPerformancePathId } from "./performance-path-codec.mjs";
import type { ToolcraftPerformancePath } from "./performance-path-model";
import {
  parseToolcraftRendererPipeline,
  type ToolcraftRendererPipelineParseResult,
} from "./performance-renderer-pipeline-parser";
import type {
  ToolcraftEnvelopePerformanceConfig,
  ToolcraftRenderPass,
} from "./performance-types";

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function uniqueSorted<Value extends string>(values: readonly Value[]): Value[] {
  return [...new Set(values)].sort(compareCodeUnits);
}

function getInvalidatedPasses(
  passesById: ReadonlyMap<string, ToolcraftRenderPass>,
  invalidates: readonly string[],
): ToolcraftRenderPass[] {
  return invalidates.flatMap((passId) => {
    const pass = passesById.get(passId);
    return pass ? [pass] : [];
  });
}

export function deriveToolcraftPerformancePathsFromParsedPipeline(
  parsedPipeline: ToolcraftRendererPipelineParseResult,
): ToolcraftPerformancePath[] {
  if (!parsedPipeline.pipeline) return [];

  const passesById = new Map(
    parsedPipeline.pipeline.passes.map((pass) => [pass.id, pass] as const),
  );
  const pathsByKey = new Map<
    string,
    Omit<ToolcraftPerformancePath, "targets"> & { targets: Set<string> }
  >();

  for (const invalidation of parsedPipeline.pipeline.interactionInvalidation) {
    const invalidates = uniqueSorted(invalidation.invalidates);
    const preparationInvalidates = uniqueSorted(
      invalidation.preparationInvalidates ?? [],
    );
    const retainedAccesses = uniqueSorted(invalidation.retainedAccesses ?? []);
    const invalidatedPasses = getInvalidatedPasses(passesById, invalidates);
    const pathWithoutId = {
      interaction: invalidation.interaction,
      invalidates,
      preparationInvalidates,
      profile: getToolcraftPerformanceProfileForInteraction(
        invalidation.interaction,
      ),
      retainedAccesses,
      runsOn: uniqueSorted(invalidatedPasses.map((pass) => pass.runsOn)),
      workloadDimensions: uniqueSorted(
        invalidatedPasses.flatMap((pass) => pass.cost?.dimensions ?? []),
      ),
    } satisfies Omit<ToolcraftPerformancePath, "id" | "targets">;
    const id = createToolcraftPerformancePathId(pathWithoutId);
    const existing = pathsByKey.get(id);
    if (existing) {
      for (const target of invalidation.targets) existing.targets.add(target);
      continue;
    }
    pathsByKey.set(id, {
      ...pathWithoutId,
      id,
      targets: new Set(invalidation.targets),
    });
  }

  return [...pathsByKey.values()]
    .map((path) => ({ ...path, targets: uniqueSorted([...path.targets]) }))
    .sort((left, right) => compareCodeUnits(left.id, right.id));
}

export function deriveToolcraftPerformancePaths(
  _schema: ResolvedToolcraftAppSchema,
  config: ToolcraftEnvelopePerformanceConfig,
): ToolcraftPerformancePath[] {
  return deriveToolcraftPerformancePathsFromParsedPipeline(
    parseToolcraftRendererPipeline(config.rendererPipeline as unknown),
  );
}

export type { ToolcraftPerformancePath } from "./performance-path-model";
