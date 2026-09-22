import { exportRequestFixture } from "./app-acceptance.export-request-test-fixtures";
import { describe, expect, it } from "vitest";
import {
  imageExportModule,
  mediaSourceModule,
  videoExportModule,
} from "@/toolcraft/runtime";

import {
  contractAcceptanceFixture,
  createContractSectionInventoryFixture,
  defineContractSchemaFixture,
  validateContractAcceptance,
} from "./app-acceptance.contract-fixtures";
import { makeControlAcceptance } from "./app-acceptance.test-utils";
import type {
  ToolcraftComponentAcceptance,
  ToolcraftProductReadiness,
} from "./acceptance/types";

const infinityProductReadiness: ToolcraftProductReadiness = {
  exportIntent: {
    image: { mode: "toolcraft-default" },
    svg: { mode: "not-requested" },
    video: { mode: "not-requested" },
  },
  interactionOwnership: [],
  mode: "product",
  productName: "Infinity contract fixture",
  productSummary: "An editable product scene with bounded export output.",
  requestedBehavior: "Switch between finite and infinite canvas output.",
  viewInteraction: {
    mode: "non-spatial",
    reason: "The fixture is a two-dimensional scene without a camera.",
  },
};

const infinityVideoProductReadiness: ToolcraftProductReadiness = {
  ...infinityProductReadiness,
  exportIntent: {
    image: { mode: "toolcraft-default" },
    svg: { mode: "not-requested" },
    video: {
      evidence: exportRequestFixture(
        "Add video export of the full infinite scene.",
      ),
      mode: "user-requested",
    },
  },
};

function createFixedOutputSchema({
  height = 1080,
  width = 1920,
}: {
  height?: number;
  width?: number;
} = {}) {
  return defineContractSchemaFixture({
    base: {
      identity: { id: "contract-fixture", title: "Contract fixture" },
      canvas: {
        enabled: true,
        size: { height, unit: "px", width },
        sizing: { mode: "fixed-output" },
      },
      panels: {
        controls: {
          sections: [
            {
              id: "generation",
              controls: {
                prompt: {
                  applicability: { mode: "always" as const },
                  defaultValue: "Describe the effect",
                  label: "Prompt",
                  orderRole: "input",
                  target: "generation.prompt",
                  textValueKind: "single-line",
                  type: "text",
                },
              },
              title: "Generation",
            },
          ],
          title: "Controls",
        },
      },
      persistence: { storage: "none" },
    },
    modules: [],
  });
}

function createIntrinsicMediaUploadSchema() {
  return defineContractSchemaFixture({
    base: {
      identity: { id: "contract-fixture", title: "Contract fixture" },
      canvas: {
        enabled: true,
        sizing: { mode: "intrinsic-media" },
        upload: true,
      },
      panels: {
        controls: {
          sections: [],
          title: "Controls",
        },
      },
    },
    modules: [mediaSourceModule()],
  });
}

function createEditableOutputSchema(
  exportRole?: "export-image" | "export-video",
) {
  return defineContractSchemaFixture({
    base: {
      identity: { id: "contract-fixture", title: "Contract fixture" },
      canvas: {
        enabled: true,
        size: { height: 1080, unit: "px", width: 1920 },
        sizing: { mode: "editable-output" },
      },
      panels: {
        controls: {
          sections: [],
          title: "Controls",
        },
      },
      ...(exportRole === "export-video"
        ? {}
        : { persistence: { storage: "none" as const } }),
    },
    modules: exportRole
      ? [
          exportRole === "export-image"
            ? imageExportModule()
            : videoExportModule(),
        ]
      : [],
  });
}

function makeInfinityCanvasAcceptance(
  coverage:
    | "mode-continuity-and-restoration"
    | "scene-bounds-image-export"
    | "scene-bounds-video-export",
): ToolcraftComponentAcceptance {
  return {
    automated: true,
    automatedTestName: `proves ${coverage}`,
    browser: {
      budget: "standard",
      file: "e2e/app-controls.spec.ts",
      testName: `browser: proves ${coverage}`,
    },
    componentType: "canvas",
    evidence:
      coverage === "mode-continuity-and-restoration"
        ? ("viewport-side-effect" as const)
        : ("exported-bytes" as const),
    expectedObservable: `Infinity canvas ${coverage} is observable in the running product.`,
    fixture: "infinite canvas scene fixture",
    id: `canvas.infinity.${coverage}`,
    infinityCanvasCoverage: coverage,
    kind: "runtime" as const,
    userAction: "Toggle Infinity canvas and inspect preview and export output.",
  };
}

describe("Toolcraft canvas sizing acceptance coverage", () => {
  it("the public acceptance facade requires source bounds even with complete continuity and export coverage", () => {
    const errors = validateContractAcceptance({
      schema: createEditableOutputSchema("export-image"),
      productReadiness: infinityProductReadiness,
      acceptance: [
        makeInfinityCanvasAcceptance("mode-continuity-and-restoration"),
        makeInfinityCanvasAcceptance("scene-bounds-image-export"),
      ],
      rendererPipeline: {
        runtimeId: "source-bounds-fixture",
        interactionInvalidation: [],
        passes: [{ id: "generated", inputs: [], invalidatedBy: [], kind: "pixel-transform", output: "source", quality: "full", runsOn: "main" }],
      },
    });
    expect(errors).toContain('Renderer pass "generated" requires sceneBounds: intrinsic product domain or content with overflow proofIds.');
  });

  it("requires mode and finite-size restoration coverage for editable output", () => {
    expect(
      validateContractAcceptance({
        schema: createEditableOutputSchema(),
        acceptance: contractAcceptanceFixture,
        productReadiness: infinityProductReadiness,
      }),
    ).toEqual(
      expect.arrayContaining([
        'canvas.sizing mode "editable-output" requires a runtime acceptance entry with infinityCanvasCoverage "mode-continuity-and-restoration" proving Infinity canvas changes only the finite boundary and size controls while preserving the world frame, view, renderer identity, backing, and dormant finite size for restoration without centering.',
      ]),
    );
  });

  it("requires tight scene-bounds coverage for infinite image export", () => {
    expect(
      validateContractAcceptance({
        schema: createEditableOutputSchema("export-image"),
        acceptance: [
          makeInfinityCanvasAcceptance("mode-continuity-and-restoration"),
        ],
        productReadiness: infinityProductReadiness,
      }),
    ).toEqual(
      expect.arrayContaining([
        'Export PNG with editable-output canvas requires a runtime acceptance entry with infinityCanvasCoverage "scene-bounds-image-export" proving Infinity exports complete visible composition bounds, dimensions, background and decoded image content.',
      ]),
    );
  });

  it("requires a time-range scene envelope for infinite video export", () => {
    expect(
      validateContractAcceptance({
        schema: createEditableOutputSchema("export-video"),
        acceptance: [
          makeInfinityCanvasAcceptance("mode-continuity-and-restoration"),
        ],
        productReadiness: infinityVideoProductReadiness,
      }),
    ).toEqual(
      expect.arrayContaining([
        'Export Video with editable-output canvas requires a runtime acceptance entry with infinityCanvasCoverage "scene-bounds-video-export" proving Infinity preserves the saved finite artboard dimensions, duration and decoded video frames.',
      ]),
    );
  });

  it("accepts complete typed Infinity canvas coverage", () => {
    const errors = validateContractAcceptance({
      schema: createEditableOutputSchema("export-image"),
      acceptance: [
        makeInfinityCanvasAcceptance("mode-continuity-and-restoration"),
        makeInfinityCanvasAcceptance("scene-bounds-image-export"),
      ],
      productReadiness: infinityProductReadiness,
    });

    expect(
      errors.filter((error) => error.includes("infinityCanvasCoverage")),
    ).toEqual([]);
  });

  it("requires explicit runtime acceptance before locking canvas output size", () => {
    expect(
      validateContractAcceptance({
        schema: createFixedOutputSchema(),
        acceptance: contractAcceptanceFixture,
      }),
    ).toEqual(
      expect.arrayContaining([
        'canvas.sizing mode "fixed-output" requires a runtime acceptance entry with canvasSizingCoverage "fixed-output-size" explaining why width and height are intentionally non-editable. Product/output apps must use "editable-output"; user-provided, reference, fixed-format, or base/default sizes belong in canvas.size as editable initial values.',
      ]),
    );
  });

  it("accepts typed fixed-output coverage without parsing explanatory prose", () => {
    expect(
      validateContractAcceptance({
        schema: createFixedOutputSchema(),
        acceptance: [
          ...contractAcceptanceFixture,
          makeControlAcceptance("generation.prompt", "text"),
          {
            automated: true,
            automatedTestName: "fixed canvas dimensions remain stable",
            browser: {
              budget: "standard",
              file: "e2e/app-controls.spec.ts",
              testName: "browser: canvas starts at 1920 by 1080",
            },
            canvasSizingCoverage: "fixed-output-size",
            componentType: "canvas",
            evidence: "product-output",
            expectedObservable: "Las dimensiones permanecen estables.",
            fixture: "canvas default size fixture",
            id: "canvas.sizing",
            kind: "runtime",
            userAction: "Abrir la herramienta interna.",
          },
        ],
        sectionInventory: createContractSectionInventoryFixture(
          createFixedOutputSchema(),
          [
            {
              entity: "Generation",
              entityId: "generation",
              finiteSelectors: [],
              groupingReason: "Prompt controls the generated product content.",
              id: "generation",
            },
          ],
        ),
      }),
    ).toEqual([]);
  });

  it("rejects fixed canvas sizing for exportable product apps even when reference dimensions are fixed", () => {
    const fixedExportSchema = defineContractSchemaFixture({
      base: {
        identity: { id: "contract-fixture", title: "Contract fixture" },
        canvas: {
          enabled: true,
          size: { height: 900, unit: "px", width: 1440 },
          sizing: { mode: "fixed-output" },
        },
        panels: {
          controls: {
            sections: [],
            title: "Controls",
          },
        },
        persistence: { storage: "none" },
      },
      modules: [imageExportModule()],
    });

    expect(
      validateContractAcceptance({
        schema: fixedExportSchema,
        acceptance: [
          ...contractAcceptanceFixture,
          {
            automated: true,
            automatedTestName: "fixed reference size is preserved",
            browser: {
              budget: "standard",
              file: "e2e/app-controls.spec.ts",
              testName: "browser: fixed reference size is preserved",
            },
            canvasSizingCoverage: "fixed-output-size",
            componentType: "fixed-output canvas",
            evidence: "product-output",
            expectedObservable:
              "The exported shader canvas remains reference-defined and fixed at 1440x900.",
            fixture: "shader reference fixture",
            id: "canvas.sizing",
            kind: "runtime",
            userAction: "Open the app.",
          },
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        'Product/output apps with export actions must use canvas.sizing mode "editable-output" so Aspect ratio, Canvas width, and Canvas height are always available. Put reference, fixed-format, or user-requested dimensions in canvas.size as the initial value instead of hiding size controls with "fixed-output".',
      ]),
    );
  });

  it("requires intrinsic media sizing acceptance for upload apps that let media own canvas size", () => {
    expect(
      validateContractAcceptance({
        schema: createIntrinsicMediaUploadSchema(),
        acceptance: contractAcceptanceFixture,
      }),
    ).toEqual(
      expect.arrayContaining([
        'canvas.sizing mode "intrinsic-media" with upload requires a runtime acceptance entry with canvasSizingCoverage "intrinsic-media-size" proving the app is a true media-viewer/source-native product where imported media natural dimensions intentionally own canvas.size. Uploaded background/source images inside product canvases must use "editable-output" and keep the current canvas size.',
      ]),
    );
  });

  it("accepts explicit intrinsic media sizing when browser coverage proves source-native canvas sizing", () => {
    expect(
      validateContractAcceptance({
        schema: createIntrinsicMediaUploadSchema(),
        acceptance: [
          ...contractAcceptanceFixture,
          {
            automated: true,
            automatedTestName: "media viewer uses uploaded natural dimensions",
            browser: {
              budget: "standard",
              file: "e2e/app-controls.spec.ts",
              testName:
                "browser: upload source-native image updates canvas.size",
            },
            canvasSizingCoverage: "intrinsic-media-size",
            componentType: "canvas",
            evidence: "media-lifecycle",
            expectedObservable:
              "Uploading a 1400x900 image intentionally changes canvas.size to the image natural dimensions.",
            fixture: "source-native media viewer fixture",
            id: "canvas.intrinsicSizing",
            kind: "runtime",
            userAction: "Upload an image with known natural dimensions.",
          },
          {
            automated: true,
            automatedTestName: "media viewer state restores after reload",
            browser: {
              budget: "standard" as const,
              file: "e2e/app-controls.spec.ts",
              testName: "browser: media viewer state restores after reload",
            },
            componentType: "persistence",
            evidence: "persistence-state",
            expectedObservable:
              "Uploaded media restores after a real browser reload.",
            fixture: "source-native media persistence fixture",
            id: "persistence.reload",
            kind: "runtime",
            persistenceCoverage: "reload",
            persistenceSlices: ["canvas", "media", "panels", "values"],
            userAction:
              "Upload media, reload the page, and inspect restored state.",
          },
        ],
      }),
    ).toEqual([]);
  });
});
