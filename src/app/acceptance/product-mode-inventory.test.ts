import { describe, expect, it } from "vitest";
import { getToolcraftControlSectionInventoryErrors } from "./control-section-inventory";
import { getToolcraftControlSectionInvariantErrors } from "./control-layout";
import { createToolcraftControlSelectorDependencyIndex } from "./control-selector-inventory";
import { getToolcraftControlApplicabilityCases } from "./control-applicability-cases";
import { createProductModeFixture, modeRequest } from "./product-mode.test-support";

describe("explicit product modes", () => {
  it("accepts a first-section mode that gates different product entities", () => {
    const { schema, inventory } = createProductModeFixture();
    expect(getToolcraftControlSectionInventoryErrors(schema, inventory)).toEqual([]);
    expect(getToolcraftControlSectionInvariantErrors(schema, inventory)).toEqual([]);
    expect(createToolcraftControlSelectorDependencyIndex(schema, inventory).dependentsBySelector.get("scene.mode")).toEqual(["map.caption", "scene.caption"]);
    expect(getToolcraftControlApplicabilityCases({ schema, sectionInventory: inventory, target: "scene.caption" }).map(({ selectorValue, expectation }) => [selectorValue, expectation])).toEqual([["diagram", "visible"], ["map", "hidden"]]);
  });

  it("rejects Mode buried below the controls it governs", () => {
    const { schema, inventory } = createProductModeFixture({ late: true });
    expect(getToolcraftControlSectionInventoryErrors(schema, inventory).join("\n")).toContain("immediately after runtime Setup");
    expect(() => createToolcraftControlSelectorDependencyIndex(schema, inventory)).toThrow("immediately after runtime Setup");
  });

  it.each([
    { applicability: { mode: "conditional" as const, all: [{ target: "map.caption", equals: "x" }] } },
    { disabled: true },
    { keyframeable: true },
    { defaultValue: "retired-mode" },
  ])("rejects unreachable, animated or invalid default Mode: %o", (mode) => {
    const { schema, inventory } = createProductModeFixture({ mode });
    expect(getToolcraftControlSectionInventoryErrors(schema, inventory).join("\n")).toContain("Product mode");
  });

  it("rejects an always-visible control unless explicitly shared", () => {
    const { schema, inventory } = createProductModeFixture({ diagram: { applicability: { mode: "always" } } });
    expect(getToolcraftControlSectionInventoryErrors(schema, inventory).join("\n")).toContain('"scene.caption" must declare direct mode applicability or be listed in sharedTargets');
    const branch = inventory[0]!.finiteSelectors[0]!;
    if (branch.role !== "branch") throw new Error("fixture branch missing");
    inventory[0]!.finiteSelectors = [{ ...branch, productMode: { request: modeRequest, sharedTargets: ["scene.caption"] } }];
    expect(getToolcraftControlSectionInventoryErrors(schema, inventory)).toEqual([]);
  });

  it.each([
    ["map.caption"], ["missing"], ["scene.mode"], ["missing", "missing"],
  ])("rejects contradictory, unknown or duplicate shared targets: %o", (...sharedTargets) => {
    const { schema, inventory } = createProductModeFixture();
    const branch = inventory[0]!.finiteSelectors[0]!;
    if (branch.role !== "branch") throw new Error("fixture branch missing");
    inventory[0]!.finiteSelectors = [{ ...branch, productMode: { request: modeRequest, sharedTargets } }];
    expect(getToolcraftControlSectionInventoryErrors(schema, inventory).join("\n")).toContain("sharedTargets");
  });

  it("rejects synthetic scope targets that replace direct mode ownership", () => {
    const { schema, inventory } = createProductModeFixture({ diagram: { applicability: { mode: "conditional", all: [{ target: "hidden.scope", equals: "diagram" }] } } });
    expect(getToolcraftControlSectionInventoryErrors(schema, inventory).join("\n")).toContain("must declare direct mode applicability");
  });

  it("rejects a mode predicate that includes every mode", () => {
    const { schema, inventory } = createProductModeFixture({ diagram: { applicability: { mode: "conditional", all: [{ target: "scene.mode", oneOf: ["diagram", "map"] }] } } });
    expect(getToolcraftControlSectionInventoryErrors(schema, inventory).join("\n")).toContain("proper subset");
  });

  it("requires an exact primary request quotation", () => {
    const { schema, inventory } = createProductModeFixture();
    const branch = inventory[0]!.finiteSelectors[0]!;
    if (branch.role !== "branch") throw new Error("fixture branch missing");
    inventory[0]!.finiteSelectors = [{ ...branch, productMode: { request: { ...modeRequest, quote: "invented" }, sharedTargets: [] } }];
    expect(getToolcraftControlSectionInventoryErrors(schema, inventory).join("\n")).toContain("exact substring");
  });

  it("does not infer application modes from a local selector's name", () => {
    const { schema, inventory } = createProductModeFixture({ late: true });
    const branch = inventory[0]!.finiteSelectors[0]!;
    if (branch.role !== "branch") throw new Error("fixture branch missing");
    const { productMode: _intent, ...local } = branch;
    inventory[0]!.finiteSelectors = [local];
    expect(getToolcraftControlSectionInventoryErrors(schema, inventory)).toEqual([]);
  });
});
