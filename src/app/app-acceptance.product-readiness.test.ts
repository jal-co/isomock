import { describe, expect, it } from "vitest";

import {
  appProductReadiness,
  appTransferMode,
} from "./app-acceptance";
import {
  schemaHasSvgExportPanelAction,
  schemaHasVideoExportPanelAction,
} from "./acceptance/output-export";
import { schemaHasProductSurface } from "./app-acceptance.schema-test-utils";
import { appSchema } from "./app-schema";

describe("Toolcraft product readiness", () => {
  it("defaults generated apps to new Toolcraft assembly mode", () => {
    if (appProductReadiness.mode !== "starter") {
      return;
    }

    expect(appTransferMode).toEqual({
      animationIntent: { mode: "none" },
      mode: "new-toolcraft-app",
      referenceInputs: [],
    });
  });

  it("makes the no-reference decision explicit", () => {
    if (appProductReadiness.mode !== "starter") {
      return;
    }

    expect(appTransferMode.referenceInputs).toEqual([]);
  });

  it("allows neutral readiness only while the product surface is absent", () => {
    if (appProductReadiness.mode === "product") {
      expect(appProductReadiness.exportIntent).toBeDefined();
      if (appProductReadiness.exportIntent.image.mode === "toolcraft-default") {
        expect(appProductReadiness.exportIntent.image).toEqual({
          mode: "toolcraft-default",
        });
      }
      expect(appProductReadiness.exportIntent.video.mode).toBe(
        schemaHasVideoExportPanelAction(appSchema)
          ? "user-requested"
          : "not-requested",
      );
      expect(appProductReadiness.exportIntent.svg.mode).toBe(
        schemaHasSvgExportPanelAction(appSchema)
          ? "user-requested"
          : "not-requested",
      );
      expect(appProductReadiness.productName.trim()).not.toBe("");
      expect(appProductReadiness.productSummary.trim()).not.toBe("");
      expect(appProductReadiness.requestedBehavior.trim()).not.toBe("");
      expect(appProductReadiness.interactionOwnership).toBeDefined();
      expect(appProductReadiness.viewInteraction).toBeDefined();
      expect(
        schemaHasProductSurface(),
        "Product readiness requires product surface: controls, layers, timeline, canvas content, default-media suppression, or acceptance coverage.",
      ).toBe(true);
      expect(
        appSchema.panels.controls,
        "Generated product apps must define a controls panel so runtime Setup, product controls, background, export settings, and sticky export actions are visible.",
      ).toBeTruthy();
      expect(appSchema.panels.controls?.sections[1]?.title).toBe("Settings");
      return;
    }

    expect(appProductReadiness.reason.trim()).not.toBe("");
    expect(
      schemaHasProductSurface(),
      "Neutral starter readiness must not be used after adding product controls, timeline, layers, canvas content, default-media suppression, or acceptance coverage.",
    ).toBe(false);
  });
});
