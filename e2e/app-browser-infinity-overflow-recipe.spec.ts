import { expect, test, type Page } from "@playwright/test";
import { defineToolcraft, type ToolcraftRendererPipeline } from "@/toolcraft/runtime";
import { runInfinityOverflowRecipe } from "./browser-infinity-overflow-recipe";
import type { ToolcraftInfinityEdgeProbe } from "./browser-infinity-overflow-pixels";

const schema = defineToolcraft({ base: { identity: { id: "overflow-fixture", title: "Overflow" }, canvas: { enabled: true }, panels: {} }, modules: [] });
const pipeline: ToolcraftRendererPipeline = { runtimeId: "overflow-fixture", interactionInvalidation: [], passes: [] };
const probes: ToolcraftInfinityEdgeProbe[] = (["left", "right", "top", "bottom"] as const).map(edge => ({ edge, along: 0.5, offset: 8, colors: [[255, 0, 0, 255]] }));
const coverage = { passIds: ["processed"], controlValues: {}, edges: probes.map(probe => probe.edge) };

async function installFixture(page: Page, cropped = false) {
  await page.setContent(`<div data-slot="toolcraft-runtime-canvas" style="position:absolute;inset:0;background:white">
    <div data-toolcraft-canvas-world data-toolcraft-canvas-offset-x="0" data-toolcraft-canvas-offset-y="0" data-toolcraft-canvas-zoom="100">
      <div id="surface" data-toolcraft-canvas-mode="finite" data-toolcraft-editable-canvas style="position:absolute;left:200px;top:200px;width:100px;height:100px;overflow:hidden">
        <div data-toolcraft-product-scene data-toolcraft-product-scene-status="ready" style="position:absolute;left:0;top:0;width:100px;height:100px">
          <svg width="100" height="100" style="overflow:visible"><rect x="${cropped ? 0 : -20}" y="${cropped ? 0 : -20}" width="${cropped ? 100 : 140}" height="${cropped ? 100 : 140}" fill="red" /></svg>
        </div>
      </div>
    </div>
  </div><div style="position:fixed;left:600px;top:20px">
    <label data-toolcraft-control-target="canvas.infinity"><button role="switch" aria-checked="false">Infinity</button></label>
    <label data-toolcraft-control-target="export.includeBackground"><button role="switch" aria-checked="true">Background</button></label>
    <div id="sizes"></div></div><output hidden data-toolcraft-pipeline-evidence></output>`);
  await page.evaluate(() => {
    const surface = document.querySelector<HTMLElement>("#surface")!;
    const sizes = document.querySelector("#sizes")!;
    const renderSizes = () => { sizes.innerHTML = ["canvas.aspectRatio", "canvas.size.width", "canvas.size.height"].map(target => `<label data-toolcraft-control-target="${target}"><input value="100" /></label>`).join(""); };
    renderSizes();
    document.querySelector('[data-toolcraft-control-target="canvas.infinity"] button')!.addEventListener("click", event => {
      const button = event.currentTarget as HTMLElement;
      const infinite = button.getAttribute("aria-checked") === "false";
      button.setAttribute("aria-checked", String(infinite));
      surface.dataset.toolcraftCanvasMode = infinite ? "infinite" : "finite";
      surface.style.overflow = infinite ? "visible" : "hidden";
      surface.toggleAttribute("data-toolcraft-editable-canvas", !infinite);
      if (infinite) sizes.innerHTML = ""; else renderSizes();
    });
    document.querySelector('[data-toolcraft-control-target="export.includeBackground"] button')!.addEventListener("click", event => {
      const button = event.currentTarget as HTMLElement;
      button.setAttribute("aria-checked", String(button.getAttribute("aria-checked") !== "true"));
    });
    const bridge = document.querySelector("output")!;
    bridge.setAttribute("data-processed-executions", "0");
    bridge.setAttribute("data-generated-executions", "0");
    Object.defineProperty(bridge, Symbol.for("toolcraft.renderer-pipeline-evidence.snapshot"), { value: () => ({
      disposed: false, runtimeId: "overflow-fixture", passes: {
        processed: { executions: Number(bridge.getAttribute("data-processed-executions")), cacheHits: 0 },
        generated: { executions: Number(bridge.getAttribute("data-generated-executions")), cacheHits: 0 },
      },
    }) });
  });
}

async function executePass(page: Page, id: "processed" | "generated" = "processed") {
  await page.locator("output").evaluate((node, passId) => node.setAttribute(`data-${passId}-executions`, "1"), id);
}

test("overflow recipe proves pixels with Background on/off and finite restoration", async ({ page }) => {
  await installFixture(page);
  await runInfinityOverflowRecipe(page, { schema, pipeline, coverage, probes, prepare: () => executePass(page) });
  await expect(page.locator('[data-toolcraft-control-target="canvas.infinity"] button')).toHaveAttribute("aria-checked", "false");
});

test("overflow recipe rejects a processed buffer already cropped despite visible SVG overflow", async ({ page }) => {
  await installFixture(page, true);
  await expect(runInfinityOverflowRecipe(page, { schema, pipeline, coverage, probes, prepare: () => executePass(page) })).rejects.toThrow(/outside-frame pixel/);
});

test("overflow recipe rejects an unexecuted processed pass despite correct raw pixels", async ({ page }) => {
  await installFixture(page);
  await expect(runInfinityOverflowRecipe(page, { schema, pipeline, coverage, probes, prepare: async () => {} })).rejects.toThrow(/execute or consume processed/);
});

test("overflow recipe cannot replace four affected edges with one successful probe", async ({ page }) => {
  await installFixture(page);
  await expect(runInfinityOverflowRecipe(page, { schema, pipeline, coverage, probes: probes.slice(0, 1), prepare: () => executePass(page) })).rejects.toThrow(/exactly cover/);
});

const generatedCoverage = { ...coverage, passIds: ["generated", "processed"] };
async function executeGeneratedBranch(page: Page) {
  await executePass(page, "generated");
  await executePass(page);
}

test("overflow recipe proves the generated source and its downstream output together", async ({ page }) => {
  await installFixture(page);
  await runInfinityOverflowRecipe(page, { schema, pipeline, coverage: generatedCoverage, probes, prepare: () => executeGeneratedBranch(page) });
});

test("overflow recipe rejects pixels lost inside source generation before downstream rendering", async ({ page }) => {
  await installFixture(page, true);
  await expect(runInfinityOverflowRecipe(page, { schema, pipeline, coverage: generatedCoverage, probes, prepare: () => executeGeneratedBranch(page) })).rejects.toThrow(/outside-frame pixel/);
});

test("overflow recipe rejects image-only execution as evidence for generated source", async ({ page }) => {
  await installFixture(page);
  await expect(runInfinityOverflowRecipe(page, { schema, pipeline, coverage: generatedCoverage, probes, prepare: () => executePass(page) })).rejects.toThrow(/execute or consume generated/);
});
