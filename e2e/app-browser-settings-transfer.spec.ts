import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

const route = "/e2e/browser-settings-transfer-fixture.html";
async function readState(page: Page) {
  return JSON.parse((await page.getByTestId("settings-state").textContent())!);
}
async function importSettings(page: Page, payload: unknown) {
  const chooser = page.waitForEvent("filechooser");
  await page
    .getByRole("button", { name: "Import test snapshot", exact: true })
    .click();
  await (
    await chooser
  ).setFiles({
    name: "settings.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(payload)),
  });
}

test("settings download and import preserve file bindings and skip unavailable attachments", async ({
  page,
  browser,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("dialog", (dialog) => {
    errors.push(dialog.message());
    void dialog.dismiss();
  });
  await page.goto(route);
  await expect(page.getByRole("button", { name: "Export Settings", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Import Settings", exact: true })).toHaveCount(0);
  for (const [index, name] of ["first.csv", "second.csv"].entries()) {
    if (index)
      await page.getByRole("button", { name: "Add file", exact: true }).click();
    const chooser = page.waitForEvent("filechooser");
    await page
      .getByRole("button", { name: new RegExp(`Upload file ${index + 1}`) })
      .click();
    await (
      await chooser
    ).setFiles({
      name,
      mimeType: "text/csv",
      buffer: Buffer.from(`name,value\n${name},7\n`),
    });
    await expect
      .poll(async () => (await readState(page)).mediaAssets.length)
      .toBe(index + 1);
  }
  const title = page.getByRole("textbox").last();
  await title.fill("Restored title");
  await title.press("Tab");
  await page.getByRole("slider", { name: "Weight" }).first().press("End");
  await page.getByRole("slider", { name: "Weight" }).last().press("ArrowRight");
  const before = await readState(page);
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export test snapshot", exact: true })
    .click();
  const artifact = await download;
  const payload = JSON.parse(await readFile((await artifact.path())!, "utf8"));
  expect(artifact.suggestedFilename()).toMatch(/\.json$/);
  expect(payload.version).toBe(3);
  expect(
    payload.attachments.map((entry: { paths: string[] }) => entry.paths),
  ).toEqual([["first.csv"], ["second.csv"]]);
  expect(payload.values["source.files"]).toEqual(before.values["source.files"]);
  expect(
    payload.attachments.map(
      (entry: { asset: { id: string } }) => entry.asset.id,
    ),
  ).toEqual(before.mediaAssets.map((asset: { id: string }) => asset.id));
  // Remove only the second attachment's repository reference from this JSON.
  payload.attachments[1].asset.resourceRef = `media:file:sha256:${"0".repeat(64)}`;
  await title.fill("Changed title");
  await title.press("Tab");
  await importSettings(page, payload);
  await expect(title).toHaveValue("Restored title");
  await expect
    .poll(async () =>
      (await readState(page)).mediaAssets.map(
        (asset: { fileName: string }) => asset.fileName,
      ),
    )
    .toEqual(["first.csv"]);
  expect((await readState(page)).mediaAssets[0].id).toBe(
    before.mediaAssets[0].id,
  );
  expect((await readState(page)).values["source.files"]).toEqual(
    before.values["source.files"].filter(
      (item: { mediaId: string }) => item.mediaId === before.mediaAssets[0].id,
    ),
  );
  await expect(page.getByRole("slider", { name: "Weight" })).toHaveAttribute(
    "aria-valuenow",
    "10",
  );
  await page.reload();
  await expect(page.getByRole("textbox").last()).toHaveValue("Restored title");
  await expect
    .poll(async () => (await readState(page)).mediaAssets[0]?.lifecycle)
    .toBe("ready");
  expect((await readState(page)).mediaAssets[0].sourcePaths).toEqual([
    "first.csv",
  ]);
  await page.getByRole("button", { name: "Add file", exact: true }).click();
  const replacementChooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: /Upload file 2/ }).click();
  await (
    await replacementChooser
  ).setFiles({
    name: "new.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("new,value\nrow,2\n"),
  });
  await expect(
    page.getByRole("slider", { name: "Weight" }).last(),
  ).toHaveAttribute("aria-valuenow", "1");

  // A different browser repository has neither file. Settings must still apply.
  const emptyContext = await browser.newContext();
  try {
    const emptyPage = await emptyContext.newPage();
    emptyPage.on("pageerror", (error) => errors.push(error.message));
    emptyPage.on("dialog", (dialog) => {
      errors.push(dialog.message());
      void dialog.dismiss();
    });
    await emptyPage.goto(new URL(route, page.url()).href);
    await importSettings(emptyPage, payload);
    await expect(emptyPage.getByRole("textbox").last()).toHaveValue(
      "Restored title",
    );
    expect((await readState(emptyPage)).mediaAssets).toEqual([]);
    expect((await readState(emptyPage)).values["source.files"]).toEqual([]);
  } finally {
    await emptyContext.close();
  }
  expect(errors).toEqual([]);
});
