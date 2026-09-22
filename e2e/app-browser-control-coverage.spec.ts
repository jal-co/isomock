import { expect, test } from "@playwright/test";
import { expectToolcraftExportedArtifact } from "./browser-acceptance-outcome-helpers";
import {
  expectToolcraftDiscreteSliderMarkers,
  expectToolcraftSegmentedControlCellsPreservePadding,
  getToolcraftFieldByLabel,
} from "./performance-helpers";

test("discrete slider layout accepts one interior marker and rejects none", async ({
  page,
}) => {
  await page.setContent(`
    <div data-slot="toolcraft-runtime-app">
      <div data-toolcraft-control-target="canvas.renderScale">
        <div data-slot="field" style="display:block;width:200px;height:24px;">
          <div data-slot="slider" data-variant="discrete" style="display:block;width:200px;height:24px;">
            <span data-slot="slider-marker" style="display:block;width:1px;height:6px;"></span>
          </div>
        </div>
      </div>
    </div>
  `);

  await expectToolcraftDiscreteSliderMarkers(page, "canvas.renderScale");

  await page.setContent(`
    <div data-slot="toolcraft-runtime-app">
      <div data-toolcraft-control-target="canvas.renderScale">
        <div data-slot="field" style="display:block;width:200px;height:24px;">
          <div data-slot="slider" data-variant="discrete" style="display:block;width:200px;height:24px;"></div>
        </div>
      </div>
    </div>
  `);

  await expect(
    expectToolcraftDiscreteSliderMarkers(page, "canvas.renderScale"),
  ).rejects.toThrow(/at least one interior marker/);
});

test("segmented layout helper catches paddingless or colliding cells", async ({ page }) => {
  await page.setContent(`
    <div data-slot="field">FX Preset
      <div data-slot="toggle-group" style="display:flex;width:360px;">
        <button data-slot="toggle-group-item" style="box-sizing:border-box;width:120px;padding:0 12px;">One</button>
        <button data-slot="toggle-group-item" style="box-sizing:border-box;width:120px;padding:0 12px;">Two</button>
        <button data-slot="toggle-group-item" style="box-sizing:border-box;width:120px;padding:0 12px;">Off</button>
      </div>
    </div>
  `);

  await expectToolcraftSegmentedControlCellsPreservePadding(page, "FX Preset");

  await page.setContent(`
    <div data-slot="field">FX Preset
      <div data-slot="toggle-group" style="display:flex;width:180px;">
        <button data-slot="toggle-group-item" style="box-sizing:border-box;width:60px;padding:0;">Full Stack</button>
        <button data-slot="toggle-group-item" style="box-sizing:border-box;width:60px;padding:0;">RGB Split</button>
        <button data-slot="toggle-group-item" style="box-sizing:border-box;width:60px;padding:0;">Lines</button>
      </div>
    </div>
  `);

  await expect(
    expectToolcraftSegmentedControlCellsPreservePadding(page, "FX Preset"),
  ).rejects.toThrow(/must preserve cell padding/);
});

test("performance helpers match control labels literally", async ({ page }) => {
  await page.setContent(`
    <div data-slot="field" data-testid="literal-label">Size (px)<input type="range" /></div>
    <div data-slot="field" data-testid="regex-lookalike">Size px<input type="range" /></div>
  `);

  await expect(await getToolcraftFieldByLabel(page, "Size (px)")).toHaveAttribute(
    "data-testid",
    "literal-label",
  );
});

test("export acceptance rejects a verifier that does not return an artifact observation", async () => {
  await expect(
    expectToolcraftExportedArtifact(
      async () => new Uint8Array([1, 2, 3]),
      async () => ({}),
      { requirementId: "image-export-artifact" },
    ),
  ).rejects.toThrow(/artifact inspection/i);

  await expect(
    expectToolcraftExportedArtifact(
      async () => undefined,
      async () => ({ byteLength: 1 }),
      { requirementId: "missing-export-artifact" },
    ),
  ).rejects.toThrow(/non-empty export artifact/i);
});
