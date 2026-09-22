import { expect, test } from "@playwright/test";

import { deriveToolcraftModelPerformancePaths } from "@/toolcraft/runtime";

import { appSchema } from "../src/app/app-schema";
import {
  createToolcraftModelCompatibilityFixtures,
  createToolcraftModelPressureFixture,
} from "./performance-model-import-fixtures";
import { createToolcraftModelAppearanceFixtures } from "./performance-model-import-appearance-fixtures";
import {
  importToolcraftModelFixture,
  measureToolcraftModelCacheReuse,
  measureToolcraftModelImport,
  measureToolcraftModelOrbit,
  measureToolcraftModelRejectedImport,
  measureToolcraftModelRemoval,
  measureToolcraftModelRepair,
  prepareToolcraftModelPerformancePage,
} from "./performance-model-import-helpers";
import {
  expectToolcraftModelAppearancePixels,
  expectToolcraftModelPixelParity,
  expectToolcraftModelRenderedPixels,
} from "./performance-model-pixel-helpers";

const modelPaths = deriveToolcraftModelPerformancePaths(appSchema);
const importPaths = modelPaths.filter((path) => path.kind === "import");
const appearanceFixtures = createToolcraftModelAppearanceFixtures();

test.setTimeout(180_000);

for (const path of importPaths) {
  for (const { encoding, format } of createToolcraftModelCompatibilityFixtures(path.formats)) {
    test(`browser perf: model ${path.target} imports ${format} ${encoding}`, async ({ page }) => {
      await prepareToolcraftModelPerformancePage(page, path.target);
      const fixture = createToolcraftModelCompatibilityFixtures(path.formats).find(
        (candidate) => candidate.format === format && candidate.encoding === encoding,
      );
      if (!fixture) throw new Error(`Missing ${format} ${encoding} fixture.`);
      await measureToolcraftModelImport(page, path, fixture);
    });
  }

  for (const appearanceCase of appearanceFixtures.filter(({ fixture }) =>
    path.formats.includes(fixture.format),
  )) {
    test(`browser perf: model ${path.target} appearance ${appearanceCase.id}`, async ({
      page,
    }, testInfo) => {
      await prepareToolcraftModelPerformancePage(page, path.target);
      if (appearanceCase.expected.outcome === "rejected") {
        await measureToolcraftModelRejectedImport(page, path, appearanceCase.fixture);
        await expect(page.locator('[data-slot="file-drop-feedback"]')).toHaveAttribute(
          "data-file-drop-feedback-code",
          appearanceCase.expected.rejectionCode!,
        );
        return;
      }
      await measureToolcraftModelImport(page, path, appearanceCase.fixture);
      const pixels = await expectToolcraftModelRenderedPixels(page, path.target);
      expectToolcraftModelAppearancePixels(
        pixels,
        appearanceCase.expected.appearance,
        appearanceCase.expected.materialSignature,
      );
      await testInfo.attach("model-pixels", {
        body: JSON.stringify({ expected: appearanceCase.expected, pixels }),
        contentType: "application/json",
      });
      if (appearanceCase.expected.warningCode) {
        await expect(page.locator('[data-slot="file-drop-feedback"]')).toHaveAttribute(
          "data-file-drop-feedback-code",
          appearanceCase.expected.warningCode,
        );
        await expect(page.getByRole("button", { name: "Repair model geometry" })).toHaveCount(0);
      }
    });
  }

  const objFolder = appearanceFixtures.find(({ id }) => id === "obj-material-folder");
  const objZip = appearanceFixtures.find(({ id }) => id === "obj-material-zip");
  if (objFolder && objZip && path.formats.includes("obj")) {
    test(`browser: model ${path.target} folder and ZIP preserve equivalent pixels`, async ({
      page,
    }) => {
      await prepareToolcraftModelPerformancePage(page, path.target);
      await measureToolcraftModelImport(page, path, objFolder.fixture);
      const folderPixels = await expectToolcraftModelRenderedPixels(page, path.target);
      await prepareToolcraftModelPerformancePage(page, path.target);
      await measureToolcraftModelImport(page, path, objZip.fixture);
      const zipPixels = await expectToolcraftModelRenderedPixels(page, path.target);
      expectToolcraftModelPixelParity(folderPixels, zipPixels);
    });
  }

  const cacheFixture = appearanceFixtures.find(
    ({ id, fixture }) => id === "textured-glb" && path.formats.includes(fixture.format),
  );
  if (cacheFixture) {
    test(`browser perf: model ${path.target} presentation cache reuse`, async ({ page }) => {
      await prepareToolcraftModelPerformancePage(page, path.target);
      await measureToolcraftModelCacheReuse(page, path, cacheFixture.fixture);
    });
  }

  const removalFixture = appearanceFixtures.find(
    ({ id, fixture }) => id === "standalone-fallback-glb" && path.formats.includes(fixture.format),
  );
  if (removalFixture) {
    test(`browser perf: model ${path.target} resource cleanup after removal`, async ({ page }) => {
      await prepareToolcraftModelPerformancePage(page, path.target);
      await measureToolcraftModelRemoval(page, path, removalFixture.fixture);
    });
  }
}

for (const path of modelPaths) {
  for (const dimension of path.dimensions) {
    test(`browser perf: model ${path.target} ${path.kind} ${dimension.id} at development pressure`, async ({
      page,
    }) => {
      await prepareToolcraftModelPerformancePage(page, path.target);
      const fixture = createToolcraftModelPressureFixture(path, dimension.id);

      if (path.kind === "import") {
        await measureToolcraftModelImport(page, path, fixture);
        return;
      }

      await importToolcraftModelFixture(page, path, fixture);
      if (path.kind === "analysis-repair") {
        await measureToolcraftModelRepair(page, path);
        return;
      }

      await measureToolcraftModelOrbit(page, path);
    });
  }
}
