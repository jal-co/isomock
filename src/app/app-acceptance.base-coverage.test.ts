import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";
import type { ToolcraftEnvelopePerformanceConfig } from "@/toolcraft/runtime";

import { parseRendererProviderCatalog } from "../toolcraft/renderer-providers/provider-config.mjs";
import {
  appAcceptance,
  appControlSectionInventory,
  appProductReadiness,
  appTransferMode,
  validateProductAcceptanceCoverage,
  validateToolcraftAcceptanceCoverage,
} from "./app-acceptance";
import { getToolcraftRendererProviderConfigurationErrors } from "./acceptance/renderer-provider";
import { appSchema } from "./app-schema";
import { schemaHasProductSurface } from "./app-acceptance.schema-test-utils";
import { appPerformance } from "./app-performance";

const appDir = dirname(fileURLToPath(import.meta.url));
const projectDir = join(appDir, "../..");
const rendererTechnique: ToolcraftEnvelopePerformanceConfig["rendererTechnique"] =
  appPerformance.rendererTechnique;

describe("Toolcraft starter base acceptance coverage", () => {
  it("validates the real renderer provider configuration", () => {
    const performanceSource = readFileSync(
      join(projectDir, "src/app/app-performance.ts"),
      "utf8",
    );
    const catalogSource = JSON.parse(
      readFileSync(
        join(projectDir, "src/toolcraft/renderer-providers/catalog.json"),
        "utf8",
      ),
    ) as unknown;
    const provider = parseRendererProviderCatalog(catalogSource).providers.vgpu;
    const packageJson = JSON.parse(
      readFileSync(join(projectDir, "package.json"), "utf8"),
    ) as { dependencies?: Record<string, string> };

    expect(
      getToolcraftRendererProviderConfigurationErrors({
        catalog: catalogSource,
        gpu: rendererTechnique?.gpu,
        packageJson,
      }),
    ).toEqual([]);
    if (appProductReadiness.mode === "starter") {
      expect(appPerformance).not.toHaveProperty("rendererTechnique");
      expect(performanceSource).not.toMatch(
        /rendererTechnique|integrations\/vgpu/u,
      );
      for (const dependency of provider.dependencies) {
        expect(packageJson.dependencies?.[dependency.name]).toBeUndefined();
      }
    }
  });

  it("requires acceptance coverage for every visible schema control", () => {
    expect(validateProductAcceptanceCoverage()).toEqual([]);
  });

  it("validates equivalent product data independently from object identity", () => {
    const clonedSchema = structuredClone(appSchema);
    const clonedAcceptance = structuredClone(appAcceptance);
    const clonedTransferMode = structuredClone(appTransferMode);
    const clonedSectionInventory = structuredClone(
      appControlSectionInventory,
    );
    const clonedProductReadiness = structuredClone(appProductReadiness);

    expect(
      validateToolcraftAcceptanceCoverage({
        acceptance: clonedAcceptance,
        productReadiness: clonedProductReadiness,
        schema: clonedSchema,
        sectionInventory: clonedSectionInventory,
        transferMode: clonedTransferMode,
      }),
    ).toEqual(validateProductAcceptanceCoverage());
  });

  it("requires generated product apps to publish a control section inventory", () => {
    if (!schemaHasProductSurface()) {
      expect(appControlSectionInventory).toEqual([]);
      return;
    }

    expect(
      appControlSectionInventory.length,
      "Product apps must export appControlSectionInventory so section grouping decisions are machine-checkable.",
    ).toBeGreaterThan(0);
    expect(validateProductAcceptanceCoverage()).toEqual([]);
  });
});
