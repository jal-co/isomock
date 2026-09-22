import type { ResolvedToolcraftAppSchema, ToolcraftRendererPipeline } from "@/toolcraft/runtime";
import type { ToolcraftComponentAcceptance } from "./types";

const edges = new Set(["left", "right", "top", "bottom"]);
const valueControls = new Set(["checkbox", "switch", "segmented", "imagePicker", "select", "tabs", "slider"]);

export function getToolcraftInfinityOverflowErrors({ acceptance, rendererPipeline, schema }: {
  acceptance: readonly ToolcraftComponentAcceptance[];
  rendererPipeline?: ToolcraftRendererPipeline;
  schema: ResolvedToolcraftAppSchema;
}): string[] {
  const errors: string[] = [];
  const passes = new Map((rendererPipeline?.passes ?? []).map(pass => [pass.id, pass]));
  const controls = new Map((schema.panels.controls?.sections ?? []).flatMap(section =>
    Object.values(section.controls).map(control => [control.target, control] as const)));
  for (const pass of passes.values()) {
    // Source buffers can lose generated content before a downstream pass sees it.
    if (pass.output === "overlay" || pass.output === "export") continue;
    if (!pass.sceneBounds) {
      errors.push(`Renderer pass "${pass.id}" requires sceneBounds: intrinsic product domain or content with overflow proofIds.`);
      continue;
    }
    if (pass.sceneBounds.kind === "intrinsic") {
      if (!pass.sceneBounds.reason.trim()) errors.push(`Intrinsic pass "${pass.id}" requires a domain reason.`);
      continue;
    }
    if (pass.sceneBounds.proofIds.length === 0) errors.push(`Content pass "${pass.id}" requires overflow proofIds.`);
    for (const id of pass.sceneBounds.proofIds) {
      const matches = acceptance.filter(entry => entry.id === id);
      const entry = matches[0];
      if (matches.length !== 1 || !entry?.automated || !entry.browser || entry.kind !== "runtime" ||
          entry.evidence !== "rendered-pixels" || !entry.infinityOverflowCoverage?.passIds.includes(pass.id)) {
        errors.push(`Renderer pass "${pass.id}" requires its own executable Infinity overflow proof "${id}"; continuity or raw-pass evidence cannot replace it.`);
      }
    }
  }
  for (const entry of acceptance) {
    const proof = entry.infinityOverflowCoverage;
    if (!proof) continue;
    if (proof.passIds.length === 0 || new Set(proof.passIds).size !== proof.passIds.length) {
      errors.push(`Infinity overflow "${entry.id}" requires unique passIds.`);
    }
    for (const id of proof.passIds) {
      const bounds = passes.get(id)?.sceneBounds;
      if (bounds?.kind !== "content" || !bounds.proofIds.includes(entry.id)) {
        errors.push(`Infinity overflow "${entry.id}" is not registered by content pass "${id}".`);
      }
    }
    if (proof.edges.length === 0 || new Set(proof.edges).size !== proof.edges.length || proof.edges.some(edge => !edges.has(edge))) {
      errors.push(`Infinity overflow "${entry.id}" requires unique affected edges.`);
    }
    for (const [target, value] of Object.entries(proof.controlValues)) {
      const control = controls.get(target);
      if (!control || !valueControls.has(control.type) ||
          !["string", "number", "boolean"].includes(typeof value) || (typeof value === "number" && !Number.isFinite(value))) {
        errors.push(`Infinity overflow "${entry.id}" has an unobservable branch value for "${target}".`);
      }
    }
  }
  return errors;
}
