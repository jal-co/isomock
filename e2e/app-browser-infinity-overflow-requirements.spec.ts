import { expect, test } from "@playwright/test";
import { deriveToolcraftBrowserRuntimeRequirements } from "./browser-runtime-evidence-requirements";

test("generated-source and processed overflow require a distinct evidence type for each acceptance case", () => {
  const cases = ["generated", "raw", "processed"];
  const requirements = deriveToolcraftBrowserRuntimeRequirements(cases.map(id => ({
    id, browser: { budget: "standard", file: "e2e/product-overflow.spec.ts", testName: id },
    evidence: "rendered-pixels", target: "canvas.infinity",
    infinityOverflowCoverage: { passIds: [id], controlValues: {}, edges: ["left", "right", "top", "bottom"] },
  })));
  expect(requirements).toEqual(cases.map(id => ({
    evidenceType: "infinity-output-overflow", requirementId: id, target: "canvas.infinity", testName: id,
  })));
});
