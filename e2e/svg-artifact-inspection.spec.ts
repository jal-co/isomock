import { expect, test } from "@playwright/test";

import { createToolcraftSvgFixtureDownload } from "./svg-download-test-fixtures";
import { inspectToolcraftSvgDownload } from "./svg-artifact-inspection";

const validSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="64" height="48" viewBox="0 0 64 48"><g data-toolcraft-product-scene="true"><rect data-column-track="true" x="8" y="8" width="16" height="32" fill="#52AAFF"/></g></svg>`;

test("inspects strict self-contained vector SVG bytes", async ({
  page,
}) => {
  await page.goto("/");
  const download = await createToolcraftSvgFixtureDownload(page, validSvg);

  const result = await inspectToolcraftSvgDownload({ download, page });

  expect(result.inspection).toMatchObject({
    backgroundColor: null,
    height: 48,
    kind: "svg",
    mediaType: "image/svg+xml",
    vectorElementCount: 1,
    viewBox: [0, 0, 64, 48],
    width: 64,
  });
  expect(result.inspection.byteLength).toBeGreaterThan(0);
  expect(result.inspection.contentHash).toMatch(/^[a-f0-9]{64}$/u);
});

test("inspects the exact runtime background before product vectors", async ({
  page,
}) => {
  await page.goto("/");
  const source = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="64" height="48" viewBox="-4 2 64 48"><rect data-toolcraft-background="true" x="-4" y="2" width="64" height="48" fill="#112233"/><g data-toolcraft-product-scene="true"><path data-column-track="true" d="M0 0h1v1z"/></g></svg>`;
  const download = await createToolcraftSvgFixtureDownload(page, source);

  const result = await inspectToolcraftSvgDownload({ download, page });

  expect(result.inspection.backgroundColor).toBe("#112233");
  expect(result.inspection.vectorElementCount).toBe(1);
  expect(result.inspection.viewBox).toEqual([-4, 2, 64, 48]);
});

const invalidSvgCases = [
  {
    message: "not valid XML",
    name: "valueless XML attribute",
    source:
      '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="48" viewBox="0 0 64 48"><rect data-column-graph-background width="1" height="1"/></svg>',
  },
  {
    message: "namespaced <svg> root",
    name: "missing SVG namespace",
    source:
      '<svg width="64" height="48" viewBox="0 0 64 48"><rect width="1" height="1"/></svg>',
  },
  {
    message: "forbidden <image>",
    name: "raster image",
    source:
      '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="48" viewBox="0 0 64 48"><g data-toolcraft-product-scene="true"><image href="data:image/png;base64,AA=="/></g></svg>',
  },
  {
    message: "forbidden <foreignObject>",
    name: "foreign HTML",
    source:
      '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="48" viewBox="0 0 64 48"><g data-toolcraft-product-scene="true"><foreignObject><div xmlns="http://www.w3.org/1999/xhtml">x</div></foreignObject></g></svg>',
  },
  {
    message: "event attribute",
    name: "event handler",
    source:
      '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="48" viewBox="0 0 64 48"><g data-toolcraft-product-scene="true"><rect onclick="alert(1)" width="1" height="1"/></g></svg>',
  },
  {
    message: "only elements and text nodes",
    name: "processing instruction",
    source:
      '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="48" viewBox="0 0 64 48"><g data-toolcraft-product-scene="true"><?xml-stylesheet href="https://example.com/styles.css"?><rect width="1" height="1"/></g></svg>',
  },
  {
    message: "external href",
    name: "external reference",
    source:
      '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="48" viewBox="0 0 64 48"><g data-toolcraft-product-scene="true"><use href="https://example.com/shape.svg#x"/></g></svg>',
  },
  {
    message: "local reference #missing has no target",
    name: "missing local reference",
    source:
      '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="48" viewBox="0 0 64 48"><g data-toolcraft-product-scene="true"><use href="#missing"/></g></svg>',
  },
  {
    message: "positive width",
    name: "zero dimensions",
    source:
      '<svg xmlns="http://www.w3.org/2000/svg" width="0" height="48" viewBox="0 0 0 48"><g data-toolcraft-product-scene="true"><rect width="1" height="1"/></g></svg>',
  },
  {
    message: "no visible vector primitive",
    name: "empty product vectors",
    source:
      '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="48" viewBox="0 0 64 48"><g data-toolcraft-product-scene="true"><defs><path d="M0 0h1v1z"/></defs></g></svg>',
  },
  {
    message: "no visible vector primitive",
    name: "runtime background without product vectors",
    source:
      '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="48" viewBox="0 0 64 48"><rect data-toolcraft-background="true" x="0" y="0" width="64" height="48" fill="#000000"/><g data-toolcraft-product-scene="true"/></svg>',
  },
] as const;

for (const { message, name, source } of invalidSvgCases) {
  test(`rejects ${name}`, async ({ page }) => {
    await page.goto("/");
    const download = await createToolcraftSvgFixtureDownload(page, source);

    await expect(
      inspectToolcraftSvgDownload({ download, page }),
    ).rejects.toThrow(message);
  });
}

test("rejects a non-SVG filename before byte inspection", async ({
  page,
}) => {
  const download = await createToolcraftSvgFixtureDownload(
    page,
    validSvg,
    "column-graph.txt",
  );
  await expect(inspectToolcraftSvgDownload({ download, page })).rejects.toThrow(
    ".svg extension",
  );
});
