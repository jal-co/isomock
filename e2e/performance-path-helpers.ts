import type { Page } from "@playwright/test";

import {
  TOOLCRAFT_CANVAS_RENDER_SCALE,
  compileToolcraftPerformanceFixturePlan,
  deriveToolcraftPerformancePaths,
  type ResolvedToolcraftAppSchema,
  type ToolcraftEnvelopePerformanceConfig,
  type ToolcraftPerformancePath,
} from "@/toolcraft/runtime";

import {
  expectToolcraftCanvasBackingPixelsForRenderScale,
  expectToolcraftPerformanceRenderScaleBackingEvidence,
} from "./browser-render-scale-evidence";
import { attachToolcraftBrowserRuntimeEvidence } from "./browser-runtime-evidence";
import { expectToolcraftPerformanceBudget } from "./performance-budget-helpers";
import { applyToolcraftPerformancePathCompiledFixture } from "./performance-fixture-helpers";
import {
  readToolcraftPerformanceFixtureResolutionMode,
  readToolcraftPerformanceFixtureSelector,
  resolveToolcraftPerformanceFixtureSelector,
} from "./performance-fixture-selection";
import {
  measureToolcraftClipboardActionByLabel,
  measureToolcraftDownloadActionByLabel,
} from "./performance-output-action-helpers";
import { createToolcraftPerformanceCanvasQualityGuard } from "./performance-canvas-quality-guard";
import {
  getToolcraftPerformancePathSettleFrames,
  type ToolcraftCompiledPerformancePathAdapter,
} from "./performance-path-adapter-matrix";
import { expectToolcraftPipelineInvariant } from "./performance-pipeline-evidence";
import { getToolcraftPerformancePathBudget } from "./performance-profile-helpers";
import {
  measureToolcraftAnimationFrames,
  measureToolcraftInteraction,
} from "./performance-probe-helpers";

export type ToolcraftPerformancePathRuntime = Readonly<{
  measureInteraction?: typeof measureToolcraftInteraction;
}>;

function getPathTarget(path: ToolcraftPerformancePath): string | undefined {
  return path.targets.length === 1 ? path.targets[0] : undefined;
}

async function attachPathEvidence(
  evidenceType:
    | "performance-budget"
    | "performance-control-drag"
    | "performance-viewport",
  path: ToolcraftPerformancePath,
): Promise<void> {
  await attachToolcraftBrowserRuntimeEvidence({
    evidenceType,
    requirementId: path.id,
    target: getPathTarget(path),
  });
}

export async function runToolcraftPerformancePath(
  page: Page,
  schema: ResolvedToolcraftAppSchema,
  config: ToolcraftEnvelopePerformanceConfig,
  entry: ToolcraftCompiledPerformancePathAdapter,
  runtime: ToolcraftPerformancePathRuntime = {},
): Promise<void> {
  const fixtureResolutionMode = readToolcraftPerformanceFixtureResolutionMode();
  const { adapter, canvasBacking, path } = entry;
  const canonicalPath = deriveToolcraftPerformancePaths(schema, config).find(
    (candidate) => candidate.id === path.id,
  );
  if (
    !canonicalPath ||
    JSON.stringify(canonicalPath) !== JSON.stringify(path)
  ) {
    throw new Error(
      `Toolcraft performance path adapter "${adapter.pathId}" no longer matches the canonical derived path.`,
    );
  }

  await adapter.prepare(page);
  const fixturePlan = compileToolcraftPerformanceFixturePlan(config, path);
  if (fixturePlan.dimensionIds.length > 0) {
    if (!adapter.fixtureApplications) {
      throw new Error(
        `Toolcraft performance path adapter "${adapter.pathId}" must implement all compiled fixture dimensions: ${fixturePlan.dimensionIds.join(", ")}.`,
      );
    }
    const fixtureSelector = resolveToolcraftPerformanceFixtureSelector(
      fixturePlan,
      readToolcraftPerformanceFixtureSelector(),
      { mode: fixtureResolutionMode },
    );
    await applyToolcraftPerformancePathCompiledFixture(
      config,
      path.id,
      fixturePlan,
      fixtureSelector,
      adapter.fixtureApplications(page),
      getPathTarget(path),
    );
  } else if (adapter.fixtureApplications) {
    throw new Error(
      `Toolcraft performance path adapter "${adapter.pathId}" cannot declare fixture applications because the compiled path has no workload dimensions.`,
    );
  }

  const renderScaleEnabled = schema.canvas.renderScale.enabled;
  if (renderScaleEnabled !== (canvasBacking !== undefined)) {
    throw new Error(
      "Toolcraft performance canvas backing presence must match the resolved render-scale schema.",
    );
  }
  const baselineCssSize = renderScaleEnabled
    ? await expectToolcraftCanvasBackingPixelsForRenderScale(
        page,
        canvasBacking!.canvasSelector,
        TOOLCRAFT_CANVAS_RENDER_SCALE.defaultValue,
        { state: "performance-baseline" },
      )
    : undefined;
  const canvasQualityGuard = baselineCssSize
    ? await createToolcraftPerformanceCanvasQualityGuard(page, {
        baselineCssSize,
        canvasSelector: canvasBacking!.canvasSelector,
        cssSizePolicy:
          path.interaction === "viewport-zoom" ? "viewport-driven" : "fixed",
        pathId: path.id,
        preparationScale: adapter.preparationRenderScale,
      })
    : undefined;

  const budget = getToolcraftPerformancePathBudget(path, config.scenarios);
  const target = getPathTarget(path);
  let hasPrimaryFailure = false;
  try {
    await expectToolcraftPipelineInvariant(page, config, path.id, {
      preparePhase: adapter.preparePhase
        ? async (phase) => {
            await adapter.preparePhase!(Object.freeze({ page, path, phase }));
          }
        : undefined,
      settlePreparedPhase: adapter.settlePhase
        ? async (phase) => {
            await adapter.settlePhase!(Object.freeze({ page, path, phase }));
            if (canvasBacking && adapter.preparationRenderScale !== undefined) {
              await expectToolcraftCanvasBackingPixelsForRenderScale(
                page,
                canvasBacking.canvasSelector,
                adapter.preparationRenderScale,
                {
                  baselineCssSize: baselineCssSize!,
                  state: `performance-${phase}`,
                },
              );
            }
          }
        : undefined,
      runPhase: async (phase) => {
        const context = Object.freeze({ page, path, phase });
        const measurePhase = async () => {
          if (adapter.output?.kind === "download") {
            const measured = await measureToolcraftDownloadActionByLabel(
              page,
              adapter.output.label,
              { pathId: path.id, phase, profile: path.profile, target },
            );
            await adapter.output.verify(measured.completion, page);
            return measured.result;
          }
          if (adapter.output?.kind === "clipboard") {
            const measured = await measureToolcraftClipboardActionByLabel(
              page,
              adapter.output.label,
              { pathId: path.id, phase, profile: path.profile, target },
            );
            await adapter.output.verify(measured.completion, page);
            return measured.result;
          }
          const action = adapter.action;
          if (!action) {
            throw new Error(
              `Performance path ${path.id} requires its typed action adapter.`,
            );
          }
          if (path.interaction === "animation-frame") {
            await action(context);
            const result = await measureToolcraftAnimationFrames(page, 120, {
              pathId: path.id,
              phase,
              profile: path.profile,
              target,
            });
            await adapter.verifyOutcome?.(context);
            return result;
          }
          const result = await (
            runtime.measureInteraction ?? measureToolcraftInteraction
          )(page, () => action(context), {
            ...(adapter.observeOutcome
              ? { observeOutcome: async () => adapter.observeOutcome!(context) }
              : {}),
            pathId: path.id,
            phase,
            profile: path.profile,
            settleFrames: getToolcraftPerformancePathSettleFrames(path),
            target,
          });
          await adapter.verifyOutcome?.(context);
          return result;
        };
        const result = canvasQualityGuard
          ? await canvasQualityGuard.runPhase(phase, measurePhase)
          : await measurePhase();
        expectToolcraftPerformanceBudget(result, budget);
        await attachPathEvidence("performance-budget", path);

        if (
          path.interaction === "control-drag" ||
          path.interaction === "mask-drag"
        ) {
          await attachPathEvidence("performance-control-drag", path);
        }
        if (
          path.interaction === "viewport-drag" ||
          path.interaction === "viewport-zoom"
        ) {
          await attachPathEvidence("performance-viewport", path);
        }
        if (canvasBacking) {
          await expectToolcraftPerformanceRenderScaleBackingEvidence(page, {
            baselineCssSize: baselineCssSize!,
            canvasSelector: canvasBacking.canvasSelector,
            cssSizePolicy:
              path.interaction === "viewport-zoom"
                ? "viewport-driven"
                : "fixed",
            pathId: path.id,
            phase,
            target,
          });
        }
      },
    });
  } catch (error) {
    hasPrimaryFailure = true;
    throw error;
  } finally {
    try {
      await canvasQualityGuard?.dispose();
    } catch (error) {
      if (!hasPrimaryFailure) throw error;
    }
  }
}
