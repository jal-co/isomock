import type { ResolvedToolcraftAppSchema } from "../schema/resolved-app-schema";
import type {
  ToolcraftRenderPass,
  ToolcraftRenderPassQuality,
  ToolcraftRendererStrategy,
} from "./performance-types";

export type ToolcraftRenderPlanBenchmarkRequirement = {
  candidates: readonly ToolcraftRendererStrategy[];
  passId: string;
  workload: Readonly<Record<string, number>>;
};

export type ToolcraftRenderPlanInvariants = {
  readonly backingResolution: Readonly<{
    canvasSizeSource: "runtime-state" | "schema";
    canvasSize: Readonly<ResolvedToolcraftAppSchema["canvas"]["size"]>;
    defaultBackingSize: Readonly<{ height: number; width: number }>;
    effectiveDefaultScale: number;
    renderScale: Readonly<ResolvedToolcraftAppSchema["canvas"]["renderScale"]>;
    renderScaleSource: "runtime-state" | "schema";
    runtimeTargets: Readonly<{
      height: "canvas.size.height";
      renderScale: "canvas.renderScale" | null;
      width: "canvas.size.width";
    }>;
    sizeSource: ResolvedToolcraftAppSchema["canvas"]["sizeSource"];
    sizingMode: ResolvedToolcraftAppSchema["canvas"]["sizing"]["mode"];
  }>;
  readonly outputQuality: readonly Readonly<{
    output: "export" | "preview";
    passId: string;
    quality: ToolcraftRenderPassQuality;
  }>[];
};

export type ToolcraftRenderPlanAssessment = {
  errors: readonly string[];
  invariants: ToolcraftRenderPlanInvariants;
  requiredBenchmarks: readonly ToolcraftRenderPlanBenchmarkRequirement[];
  warnings: readonly string[];
};

export function createToolcraftRenderPlanInvariants(
  schema: ResolvedToolcraftAppSchema,
  passes: readonly ToolcraftRenderPass[],
): ToolcraftRenderPlanInvariants {
  const effectiveDefaultScale = schema.canvas.renderScale.enabled
    ? schema.canvas.renderScale.defaultValue
    : 1;
  const backingResolution = Object.freeze({
    canvasSizeSource:
      schema.canvas.sizing.mode === "fixed-output"
        ? ("schema" as const)
        : ("runtime-state" as const),
    canvasSize: Object.freeze({ ...schema.canvas.size }),
    defaultBackingSize: Object.freeze({
      height: schema.canvas.size.height * effectiveDefaultScale,
      width: schema.canvas.size.width * effectiveDefaultScale,
    }),
    effectiveDefaultScale,
    renderScale: Object.freeze({ ...schema.canvas.renderScale }),
    renderScaleSource: schema.canvas.renderScale.enabled
      ? ("runtime-state" as const)
      : ("schema" as const),
    runtimeTargets: Object.freeze({
      height: "canvas.size.height" as const,
      renderScale: schema.canvas.renderScale.enabled
        ? ("canvas.renderScale" as const)
        : null,
      width: "canvas.size.width" as const,
    }),
    sizeSource: schema.canvas.sizeSource,
    sizingMode: schema.canvas.sizing.mode,
  });
  const outputQuality = Object.freeze(
    passes.flatMap((pass) =>
      pass.output === "preview" || pass.output === "export"
        ? [
            Object.freeze({
              output: pass.output,
              passId: pass.id,
              quality: pass.quality,
            }),
          ]
        : [],
    ),
  );

  return Object.freeze({ backingResolution, outputQuality });
}
