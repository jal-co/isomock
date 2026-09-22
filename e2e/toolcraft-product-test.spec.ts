import { expect, test } from "@playwright/test";

import { test as productTest } from "./toolcraft-product-test";

productTest("product test wrapper withholds Playwright TestInfo", async (...args) => {
  expect(args).toHaveLength(1);
  expect(args[0]).toHaveProperty("page");
});

test("product test wrapper exposes only controlled registration methods", () => {
  expect(productTest).not.toHaveProperty("setTimeout");
  expect(productTest).not.toHaveProperty("info");
  expect(productTest).not.toHaveProperty("extend");
});
