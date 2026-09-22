import { describe, expect, it } from "vitest";
import { canvasEditingModule } from "@/toolcraft/runtime";

import {
  contractAcceptanceFixture,
  defineContractSchemaFixture,
  validateContractAcceptance,
} from "./app-acceptance.contract-fixtures";
import { canvasProductReadiness } from "./acceptance/capability-proofs/test-proof-fixtures";

const canvasEditingSchema = defineContractSchemaFixture({
  base: {
    canvas: { enabled: true },
    identity: { id: "canvas-handle-fixture", title: "Canvas handle fixture" },
    panels: { controls: { sections: [], title: "Controls" } },
    persistence: { storage: "none" },
  },
  modules: [canvasEditingModule()],
});

describe("Toolcraft starter canvas handle acceptance coverage", () => {
  it("requires canvas handles to declare runtime, browser, and export-clean coverage", () => {
    expect(
      validateContractAcceptance({
        productReadiness: canvasProductReadiness,
        schema: canvasEditingSchema,
        acceptance: [
          ...contractAcceptanceFixture,
          {
            automated: true,
            automatedTestName: "gradient focus handle changes rendered output",
            browser: {
              budget: "standard",
              file: "e2e/app-controls.spec.ts",
              testName: "browser: gradient focus handle drags on canvas",
            },
            componentType: "canvas-handle",
            evidence: "product-output",
            expectedObservable:
              "Dragging the focus handle moves the gradient hotspot.",
            fixture: "radial gradient fixture",
            id: "shader.focus.handle",
            kind: "canvas-handle",
            userAction: "Drag the focus handle on the canvas.",
          },
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        "shader.focus.handle canvas handle is missing canvasHandle metadata.",
      ]),
    );
  });

  it("requires canvas handle write targets to exist in schema or editor commands", () => {
    expect(
      validateContractAcceptance({
        productReadiness: canvasProductReadiness,
        schema: canvasEditingSchema,
        acceptance: [
          ...contractAcceptanceFixture,
          {
            automated: true,
            automatedTestName: "gradient focus handle changes rendered output",
            browser: {
              budget: "standard",
              file: "e2e/app-controls.spec.ts",
              testName: "browser: gradient focus handle drags on canvas",
            },
            canvasHandle: {
              outputObservable:
                "The gradient hotspot moves after dragging the handle.",
              testId: "gradient-focus-handle",
              writesTarget: "missing.target",
            },
            componentType: "canvas-handle",
            evidence: "product-output",
            expectedObservable:
              "Dragging the focus handle moves the gradient hotspot.",
            fixture: "radial gradient fixture",
            id: "shader.focus.handle",
            kind: "canvas-handle",
            userAction: "Drag the focus handle on the canvas.",
          },
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        "shader.focus.handle canvas handle writesTarget missing.target does not match a schema target or supported editor command.",
      ]),
    );
  });
});
