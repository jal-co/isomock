import { describe, expect, it } from "vitest";
import type { ToolcraftRenderPass, ToolcraftRendererPipeline } from "@/toolcraft/runtime";
import { contractSchemaFixture } from "../app-acceptance.contract-fixtures";
import { getToolcraftInfinityOverflowErrors } from "./infinity-overflow";
import type { ToolcraftComponentAcceptance } from "./types";

function pass(id: string): ToolcraftRenderPass {
  return { id, inputs: [], invalidatedBy: [], kind: "composite", output: "intermediate", quality: "full", runsOn: "main", sceneBounds: { kind: "content", proofIds: [id] } };
}
function proof(id: string): ToolcraftComponentAcceptance {
  return { id, target: "canvas.infinity", kind: "runtime", componentType: "switch", automated: true,
    automatedTestName: "overflow", browser: { file: "e2e/product-overflow.spec.ts", testName: id, budget: "standard" },
    evidence: "rendered-pixels", fixture: "outside edges", userAction: "enable branch", expectedObservable: "ink outside frame",
    infinityOverflowCoverage: { passIds: [id], controlValues: {}, edges: ["left", "right", "top", "bottom"] } };
}
const pipeline: ToolcraftRendererPipeline = { runtimeId: "fixture", interactionInvalidation: [], passes: [pass("raw"), pass("processed")] };
const errors = (acceptance: readonly ToolcraftComponentAcceptance[], rendererPipeline = pipeline) =>
  getToolcraftInfinityOverflowErrors({ acceptance, rendererPipeline, schema: contractSchemaFixture });

describe("mandatory Infinity renderer branch proof", () => {
  it("rejects a missing processed pass even when raw geometry has proof", () => {
    expect(errors([proof("raw")])).toEqual([expect.stringContaining('pass "processed"')]);
  });
  it("accepts independently owned raw and processed proofs", () => {
    expect(errors([proof("raw"), proof("processed")])).toEqual([]);
  });
  it("rejects relabeling a raw proof as processed", () => {
    expect(errors([proof("raw"), { ...proof("processed"), infinityOverflowCoverage: proof("raw").infinityOverflowCoverage }])).toEqual(expect.arrayContaining([expect.stringContaining('pass "processed"')]));
  });
  it.each(["source", "intermediate", "preview"] as const)("requires bounds classification for every %s pass", output => {
    expect(errors([], { ...pipeline, passes: [{ ...pass("unclassified"), output, sceneBounds: undefined }] })).toEqual([expect.stringContaining("requires sceneBounds")]);
  });
  it("does not infer finite source bounds from the decode kind", () => {
    expect(errors([], { ...pipeline, passes: [{ ...pass("decode"), kind: "decode", output: "source", sceneBounds: undefined }] })).toEqual([expect.stringContaining("requires sceneBounds")]);
  });
  it("requires generated-source proof even when all downstream passes have proofs", () => {
    const generated: ToolcraftRenderPass = { ...pass("generated"), kind: "pixel-transform", output: "source" };
    const withSource = { ...pipeline, passes: [generated, ...pipeline.passes] };
    expect(errors([proof("raw"), proof("processed")], withSource)).toEqual([expect.stringContaining('pass "generated"')]);
    expect(errors([proof("generated"), proof("raw"), proof("processed")], withSource)).toEqual([]);
  });
  it("rejects borrowing downstream proof without observing the generated source pass", () => {
    const generated: ToolcraftRenderPass = { ...pass("generated"), output: "source", sceneBounds: { kind: "content", proofIds: ["raw"] } };
    const withSource = { ...pipeline, passes: [generated, ...pipeline.passes] };
    expect(errors([proof("raw"), proof("processed")], withSource)).toEqual([expect.stringContaining('pass "generated"')]);
    const linked = { ...proof("raw"), infinityOverflowCoverage: { ...proof("raw").infinityOverflowCoverage!, passIds: ["generated", "raw"] } };
    expect(errors([linked, proof("processed")], withSource)).toEqual([]);
  });
  it("accepts explicitly bounded imported pixels and requires no live proof for editor overlays or export", () => {
    expect(errors([], { ...pipeline, passes: [
      { ...pass("decode"), kind: "decode", output: "source", sceneBounds: { kind: "intrinsic", reason: "The complete imported bitmap is its authored pixel domain; this pass only decodes it." } },
      { ...pass("handles"), output: "overlay", sceneBounds: undefined },
      { ...pass("artifact"), output: "export", sceneBounds: undefined },
    ] })).toEqual([]);
  });
  it("rejects missing edges, missing pass links, unknown controls and non-pixel evidence", () => {
    expect(errors([{ ...proof("raw"), evidence: "viewport-side-effect", infinityOverflowCoverage: { passIds: ["absent"], edges: [], controlValues: { absent: true } } }]).length).toBeGreaterThanOrEqual(4);
  });
});
