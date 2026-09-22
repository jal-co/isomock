import { expect, test } from "@playwright/test";

import { expectToolcraftSvgExportArtifact } from "./browser-svg-export-evidence";
import { createToolcraftSvgFixtureDownload } from "./svg-download-test-fixtures";

const validSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="64" height="48" viewBox="0 0 64 48"><g data-toolcraft-product-scene="true"><rect data-column-track="true" x="8" y="8" width="16" height="32" fill="#52AAFF"/></g></svg>`;

test("protected SVG evidence attaches only after exact product semantics pass", async ({
  page,
}) => {
  await page.goto("/");

  const inspected = await expectToolcraftSvgExportArtifact(
    async () => createToolcraftSvgFixtureDownload(page, validSvg),
    {
      expectedElements: [
        {
          attributes: {
            fill: "#52AAFF",
            height: "32",
            width: "16",
          },
          selector: 'rect[data-column-track="true"]',
        },
      ],
      expectedBackgroundColor: null,
      expectedHeight: 48,
      expectedWidth: 64,
      page,
      requirementId: "fixture.svg",
    },
  );

  expect(inspected.inspection.contentHash).not.toHaveLength(0);
  expect(
    test.info().attachments.some(
      ({ name }) => name === "toolcraft.browser-runtime-evidence",
    ),
  ).toBe(true);
});

test("protected SVG evidence rejects empty or mismatched product expectations", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    expectToolcraftSvgExportArtifact(
      async () => createToolcraftSvgFixtureDownload(page, validSvg),
      {
        expectedElements: [],
        expectedBackgroundColor: null,
        expectedHeight: 48,
        expectedWidth: 64,
        page,
        requirementId: "fixture.svg.empty",
      },
    ),
  ).rejects.toThrow("requires product vector expectations");

  await expect(
    expectToolcraftSvgExportArtifact(
      async () => createToolcraftSvgFixtureDownload(page, validSvg),
      {
        expectedElements: [
          {
            attributes: { fill: "#FF0000" },
            selector: 'rect[data-column-track="true"]',
          },
        ],
        expectedBackgroundColor: null,
        expectedHeight: 48,
        expectedWidth: 64,
        page,
        requirementId: "fixture.svg.color",
      },
    ),
  ).rejects.toThrow("needs fill=#FF0000");
});
