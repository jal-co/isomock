import type { Download, Page } from "@playwright/test";

export async function createToolcraftSvgFixtureDownload(
  page: Page,
  source: string,
  fileName = "column-graph.svg",
): Promise<Download> {
  await page.setContent('<button id="svg-download">Download SVG</button>');
  await page.evaluate(
    ({ downloadFileName, svgSource }) => {
      const button = document.querySelector<HTMLButtonElement>("#svg-download");
      if (!button) throw new Error("SVG fixture download button is missing.");
      button.addEventListener(
        "click",
        () => {
          const url = URL.createObjectURL(
            new Blob([svgSource], { type: "image/svg+xml;charset=utf-8" }),
          );
          const anchor = document.createElement("a");
          anchor.download = downloadFileName;
          anchor.href = url;
          anchor.click();
          setTimeout(() => URL.revokeObjectURL(url), 0);
        },
        { once: true },
      );
    },
    { downloadFileName: fileName, svgSource: source },
  );

  const downloadPromise = page.waitForEvent("download");
  await page.locator("#svg-download").click();
  return downloadPromise;
}
