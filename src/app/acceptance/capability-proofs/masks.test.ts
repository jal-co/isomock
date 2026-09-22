import { defineToolcraft, masksModule, toolcraftMaskTargets } from "@/toolcraft/runtime";
import { describe, expect, it } from "vitest";

import type { ToolcraftComponentAcceptance } from "../types";
import { createResolvedProductModulePlanFixture } from "./test-plan-fixtures";
import { createRuntimeAcceptance } from "./test-proof-fixtures";
import { createCapabilityProofValidationContextFixture } from "./test-validation-fixtures";
import { validateToolcraftCapabilityProofs } from "./validate-capability-proofs";

function createMasksSchema(guides = false) {
  return defineToolcraft({
    base: {
      identity: { id: "masks-proof-fixture", title: "Masks proof fixture" },
      canvas: { enabled: true },
      panels: { controls: { sections: [], title: "Controls" } },
    },
    modules: [masksModule(guides ? { guideSurface: "canvas" } : {})],
  });
}

function createMasksAcceptance(): ToolcraftComponentAcceptance[] {
  return [
    createRuntimeAcceptance("masks.apply", {
      kind: "control", componentType: "switch", target: toolcraftMaskTargets.apply,
      evidence: "rendered-pixels",
    }),
    createRuntimeAcceptance("masks.items", {
      kind: "control", componentType: "collectionActions", target: toolcraftMaskTargets.items,
      evidence: "rendered-pixels", controlPartCoverage: "all-visible-parts",
    }),
  ];
}

function validateMasks(
  acceptance: readonly ToolcraftComponentAcceptance[] = createMasksAcceptance(),
  schema = createMasksSchema(),
) {
  return validateToolcraftCapabilityProofs({
    context: createCapabilityProofValidationContextFixture(acceptance, { schema }),
    plan: schema.modulePlan,
  });
}

describe("Toolcraft soft ellipse masks capability proof", () => {
  it("accepts canonical mask output and complete collection part proof", () => {
    expect(validateMasks()).toEqual([]);
  });

  it("requires Apply and collection proof when the module is active", () => {
    const errors = validateMasks([]).join("\n");
    expect(errors).toContain('requires control acceptance for "masks.apply"');
    expect(errors).toContain('requires control acceptance for "masks.items"');
  });

  it.each([toolcraftMaskTargets.apply, toolcraftMaskTargets.items])(
    "rejects state-only and unexecuted %s claims",
    (target) => {
      for (const overrides of [
        { evidence: "command-side-effect" as const },
        { automated: false },
        { automatedTestName: "" },
        { browser: false as const },
        { kind: "runtime" as const },
        { componentType: "custom-mask" },
      ]) {
        const acceptance = createMasksAcceptance().map((row) => row.target === target
          ? { ...row, ...overrides } : row);
        expect(validateMasks(acceptance).join("\n")).toContain(target);
        expect(validateMasks(acceptance)).not.toEqual([]);
      }
    },
  );

  it("requires add, remove and item output instead of a generic collection row", () => {
    for (const controlPartCoverage of [undefined, ["collectionActions.add"] as const]) {
      const acceptance = createMasksAcceptance().map((row) => row.target === toolcraftMaskTargets.items
        ? { ...row, controlPartCoverage } : row);
      expect(validateMasks(acceptance).join("\n")).toContain("collectionActions.remove");
    }
  });

  it("rejects duplicate mask proof rows", () => {
    const acceptance = createMasksAcceptance();
    expect(validateMasks([...acceptance, { ...acceptance[0]!, id: "duplicate-apply" }]).join("\n"))
      .toContain('exactly one control acceptance for "masks.apply"');
  });

  it("requires guide side-effect proof only when its control is interactive", () => {
    expect(validateMasks()).toEqual([]);
    expect(validateMasks(createMasksAcceptance(), createMasksSchema(true)).join("\n"))
      .toContain('requires control acceptance for "masks.show"');
    const guides = createRuntimeAcceptance("masks.show", {
      kind: "control", componentType: "switch", target: toolcraftMaskTargets.show,
      evidence: "command-side-effect",
    });
    expect(validateMasks([...createMasksAcceptance(), guides], createMasksSchema(true))).toEqual([]);
  });

  it("rejects mask claims when the capability is absent", () => {
    const errors = validateToolcraftCapabilityProofs({
      context: createCapabilityProofValidationContextFixture(createMasksAcceptance()),
      plan: createResolvedProductModulePlanFixture([]),
    });
    expect(errors).toContain('Acceptance "masks.items" claims foreground.soft-ellipses proof but that capability is absent.');
  });

  it("rejects an active capability without its canonical controls", () => {
    const errors = validateToolcraftCapabilityProofs({
      context: createCapabilityProofValidationContextFixture(createMasksAcceptance()),
      plan: createResolvedProductModulePlanFixture(["foreground.soft-ellipses"]),
    }).join("\n");
    expect(errors).toContain('requires the canonical "masks.items" collectionActions control');
  });
});
