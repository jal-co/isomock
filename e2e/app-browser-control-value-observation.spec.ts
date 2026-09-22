import { expect, test } from "@playwright/test";
import { expectToolcraftSelectorState } from "./browser-control-value-observation";

test("selector proof reads the value slot without the decorative chevron", async ({ page }) => {
  await page.setContent('<div data-slot="toolcraft-runtime-app"><div data-toolcraft-control-target="blur"><button role="combobox"><span data-slot="select-value">0</span><span aria-hidden="true">▼</span></button></div></div>');
  const value = { selectorControlType: "select", selectorTarget: "blur", selectorValue: "0", selectorOptionLabel: "0" };
  await expectToolcraftSelectorState(page, value);
  await page.locator('[data-slot="select-value"]').evaluate(node => { node.textContent = "10"; });
  await expect(expectToolcraftSelectorState(page, value)).rejects.toThrow();
});
