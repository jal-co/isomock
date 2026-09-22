import { describe, expect, it } from "vitest";
import { getToolcraftControlSectionInventoryErrors } from "./control-section-inventory";
import { getToolcraftControlSectionInvariantErrors } from "./control-layout";
import { createProductModeFixture, modeRequest } from "./product-mode.test-support";
import { validateSelectorEntryShape } from "./control-selector-entry-validation";

describe("product mode authority boundaries", () => {
  it("checks resolved order after Background moves into Setup", () => {
    const { schema, inventory } = createProductModeFixture({ before: [{
      id: "background", title: "Background", controls: {
        include: { type: "switch", target: "export.includeBackground", label: "Background", defaultValue: true, applicability: { mode: "always" } },
        color: { type: "color", target: "appearance.background", label: false, defaultValue: "#ffffff", applicability: { mode: "always" } },
      },
    }] });
    inventory.push({ id: "background", title: "Background", entity: "Background", entityId: "background", groupingReason: "Runtime consumes the standard scene background pair.", targets: ["export.includeBackground", "appearance.background"], finiteSelectors: [{ target: "export.includeBackground", role: "parameter", reason: "Include the runtime-owned output background." }] });
    expect(schema.panels.controls?.sections.slice(0, 3).map(({ id }) => id)).toEqual(["runtime.defaults", "runtime.setup", "scene-choice"]);
    expect(getToolcraftControlSectionInventoryErrors(schema, inventory)).toEqual([]);
  });

  it("rejects two independent application-mode owners", () => {
    const { schema, inventory } = createProductModeFixture({ extra: [{ id: "second-mode", title: "Other scene", controls: {
      mode: { type: "segmented", target: "other.mode", label: "Mode", defaultValue: "a", keyframeable: false, options: [{ label: "A", value: "a" }, { label: "B", value: "b" }], applicability: { mode: "always" } },
    } }] });
    inventory.push({ id: "second-mode", title: "Other scene", entity: "Other", entityId: "other", groupingReason: "Deliberately duplicate application mode ownership.", targets: ["other.mode"], finiteSelectors: [{ target: "other.mode", role: "branch", reason: "A conflicting independent application mode owner.", affectedTargets: [], productMode: { request: modeRequest, sharedTargets: [] } }] });
    expect(getToolcraftControlSectionInventoryErrors(schema, inventory).join("\n")).toContain("one canonical application selector");
  });

  it("rejects a hidden mode section", () => {
    const { schema, inventory } = createProductModeFixture({ modeSection: { visibleWhen: { target: "scene.mode", equals: "diagram" } } });
    expect(getToolcraftControlSectionInventoryErrors(schema, inventory).join("\n")).toContain("must remain reachable");
  });

  it.each([null, true, "mode", {}, { request: modeRequest }, { request: modeRequest, sharedTargets: "all" }, { request: modeRequest, sharedTargets: [null] }, { request: modeRequest, sharedTargets: [], approved: true }])("rejects malformed intent %j", (productMode) => {
    const errors: string[] = [];
    expect(validateSelectorEntryShape({ target: "scene.mode", role: "branch", reason: "The requested Diagram and Map scenes.", affectedTargets: [], productMode }, errors, "scene-choice")).toBe(false);
    expect(errors.join("\n")).toContain("Product mode");
  });

  it("does not allow productMode on a parameter", () => {
    const errors: string[] = [];
    validateSelectorEntryShape({ target: "scene.mode", role: "parameter", reason: "The requested Diagram and Map scenes.", productMode: { request: modeRequest, sharedTargets: [] } }, errors, "scene-choice");
    expect(errors.join("\n")).toContain("invalid keys: productMode");
  });

  it.each([true, false])("requires a local selector to be available in every mode of its dependent (shared: %s)", (shared) => {
    const { schema, inventory } = createProductModeFixture({
      diagram: { applicability: { mode: "conditional", all: [
        { target: "details.enabled", equals: true },
        ...(!shared ? [{ target: "scene.mode", equals: "diagram" }] : []),
      ] } },
      extra: [{ id: "details", title: "Map details", controls: {
        enabled: { type: "switch", target: "details.enabled", defaultValue: true, label: "Visible", applicability: { mode: "conditional", all: [{ target: "scene.mode", equals: "map" }] } },
      } }],
    });
    const mode = inventory[0]!.finiteSelectors[0]!;
    if (mode.role !== "branch") throw new Error("fixture mode missing");
    inventory[0]!.finiteSelectors = [{ ...mode, productMode: { request: modeRequest, sharedTargets: shared ? ["scene.caption"] : [] } }];
    inventory.push({ id: "details", title: "Map details", entity: "Details", entityId: "details", groupingReason: "Enable optional details in the Map scene.", targets: ["details.enabled"], finiteSelectors: [{ target: "details.enabled", role: "branch", affectedTargets: [], reason: "Enable the locally optional caption content." }] });
    expect(getToolcraftControlSectionInventoryErrors(schema, inventory).join("\n")).toContain('"scene.caption" depends on "details.enabled" outside that selector\'s modes');
  });

  it("accepts local predicates inside the same mode without copying their values into the mode inventory", () => {
    const { schema, inventory } = createProductModeFixture({
      diagram: { applicability: { mode: "conditional", all: [{ target: "scene.mode", equals: "diagram" }, { target: "details.enabled", equals: true }] } },
      extra: [{ id: "details", title: "Details", controls: {
        enabled: { type: "switch", target: "details.enabled", defaultValue: true, label: "Visible", applicability: { mode: "conditional", all: [{ target: "scene.mode", equals: "diagram" }] } },
      } }],
    });
    inventory.push({ id: "details", title: "Details", entity: "Details", entityId: "details", groupingReason: "Enable optional details in the Diagram scene.", targets: ["details.enabled"], finiteSelectors: [{ target: "details.enabled", role: "branch", affectedTargets: [], reason: "Enable the locally optional caption content." }] });
    expect(getToolcraftControlSectionInventoryErrors(schema, inventory)).toEqual([]);
  });

  it("does not exempt ordinary controls from entity cohesion beside the mode selector", () => {
    const { schema, inventory } = createProductModeFixture({
      diagram: { target: "scene.detail.caption" },
      extra: [{ id: "detail-size", title: "Caption size", controls: {
        size: { type: "text", target: "scene.detail.size", label: "Size", applicability: { mode: "conditional", all: [{ target: "scene.mode", equals: "diagram" }] } },
      } }],
    });
    inventory[1]!.targets = ["scene.detail.caption"];
    inventory.push({ id: "detail-size", title: "Caption size", entity: "Size", entityId: "size", groupingReason: "A deliberately incorrect separate ownership claim.", targets: ["scene.detail.size"], finiteSelectors: [] });
    expect(getToolcraftControlSectionInvariantErrors(schema, inventory).join("\n")).toContain('target family "scene.detail"');
  });
});
