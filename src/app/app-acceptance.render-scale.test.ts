import { describe, expect, it } from "vitest";
import { timelineModule } from "@/toolcraft/runtime";

import { getToolcraftRenderScaleCoverageErrors } from "./acceptance/render-scale";
import type {
  ToolcraftComponentAcceptance,
  ToolcraftRenderScaleState,
} from "./acceptance/types";
import {
  defineContractSchemaFixture,
  validateContractAcceptance,
} from "./app-acceptance.contract-fixtures";

function createRenderScaleSchema({
  timeline = false,
}: { timeline?: boolean } = {}) {
  return defineContractSchemaFixture({
    base: {
      identity: { id: "contract-fixture", title: "Contract fixture" },
      canvas: {
        enabled: true,
        renderScale: true,
      },
      panels: {
        controls: {
          sections: [],
          title: "Controls",
        },
      },
      ...(timeline ? {} : { persistence: { storage: "none" as const } }),
    },
    modules: timeline ? [timelineModule({ mode: "playback" })] : [],
  });
}

function makeRenderScaleAcceptance(
  overrides: Partial<ToolcraftComponentAcceptance> = {},
): ToolcraftComponentAcceptance {
  return {
    automated: true,
    automatedTestName: "selected render scale preserves backing pixels",
    browser: {
      budget: "standard",
      file: "e2e/app-controls.spec.ts",
      testName: "browser: selected render scale preserves backing pixels",
    },
    componentType: "canvas",
    evidence: "rendered-pixels",
    expectedObservable:
      "The visible canvas size remains stable while backing pixels honor the selected scale.",
    fixture: "raster canvas at selected render scale",
    id: "canvas.render-scale",
    kind: "runtime",
    renderScaleCoverage: {
      kind: "selected-backing-pixels",
      states: ["interaction", "steady"],
    },
    target: "canvas.renderScale",
    userAction: "Change Resolution scale and inspect the raster canvas.",
    ...overrides,
  };
}

function getErrors({
  acceptance = [],
  timeline = false,
}: {
  acceptance?: readonly ToolcraftComponentAcceptance[];
  timeline?: boolean;
} = {}) {
  return getToolcraftRenderScaleCoverageErrors({
    acceptance,
    schema: createRenderScaleSchema({ timeline }),
  });
}

describe("Toolcraft render-scale acceptance coverage", () => {
  it("requires typed backing-pixel coverage when raster render scale is enabled", () => {
    expect(
      validateContractAcceptance({
        acceptance: [],
        schema: createRenderScaleSchema(),
      }),
    ).toEqual([
      'canvas.renderScale requires a browser acceptance entry targeting "canvas.renderScale" with renderScaleCoverage "selected-backing-pixels".',
    ]);
  });

  it("requires the coverage row to be browser-backed", () => {
    expect(
      getErrors({
        acceptance: [
          makeRenderScaleAcceptance({
            browser: false,
          }),
        ],
      }),
    ).toEqual([
      "canvas.render-scale must have browser coverage proving selected canvas backing pixels.",
    ]);
  });

  it("requires the coverage row to be runtime-owned", () => {
    expect(
      getErrors({
        acceptance: [
          makeRenderScaleAcceptance({
            kind: "control",
          }),
        ],
      }),
    ).toEqual([
      "canvas.render-scale renderScaleCoverage must be declared on a runtime acceptance entry.",
    ]);
  });

  it("requires the exact runtime render-scale target", () => {
    expect(
      getErrors({
        acceptance: [
          makeRenderScaleAcceptance({
            target: "render.scale",
          }),
        ],
      }),
    ).toEqual([
      'canvas.render-scale renderScaleCoverage must target "canvas.renderScale".',
    ]);
  });

  it("rejects duplicate render-scale coverage rows", () => {
    expect(
      getErrors({
        acceptance: [
          makeRenderScaleAcceptance(),
          makeRenderScaleAcceptance({
            id: "canvas.render-scale.duplicate",
          }),
        ],
      }),
    ).toEqual([
      "canvas.renderScale requires exactly one renderScaleCoverage entry; found 2.",
    ]);
  });

  it.each([
    {
      expected:
        "canvas.render-scale renderScaleCoverage states must exactly equal: interaction, steady.",
      label: "interaction",
      states: ["steady"],
    },
    {
      expected:
        "canvas.render-scale renderScaleCoverage states must exactly equal: interaction, steady.",
      label: "steady",
      states: ["interaction"],
    },
    {
      expected:
        "canvas.render-scale renderScaleCoverage states must exactly equal: interaction, steady.",
      label: "duplicate",
      states: ["interaction", "interaction", "steady"],
    },
    {
      expected:
        "canvas.render-scale renderScaleCoverage states must exactly equal: interaction, steady.",
      label: "unsorted",
      states: ["steady", "interaction"],
    },
    {
      expected:
        "canvas.render-scale renderScaleCoverage states must exactly equal: interaction, steady.",
      label: "unknown",
      states: ["dragging", "interaction", "steady"],
    },
    {
      expected:
        "canvas.render-scale renderScaleCoverage states must exactly equal: interaction, steady.",
      label: "playback without a timeline",
      states: ["interaction", "playback", "steady"],
    },
  ])("rejects $label state declarations", ({ expected, states }) => {
    expect(
      getErrors({
        acceptance: [
          makeRenderScaleAcceptance({
            renderScaleCoverage: {
              kind: "selected-backing-pixels",
              states: states as readonly ToolcraftRenderScaleState[],
            },
          }),
        ],
      }),
    ).toContain(expected);
  });

  it("rejects an unsupported render-scale coverage kind at runtime", () => {
    expect(
      getErrors({
        acceptance: [
          makeRenderScaleAcceptance({
            renderScaleCoverage: {
              kind: "css-pixels",
              states: ["interaction", "steady"],
            } as never,
          }),
        ],
      }),
    ).toEqual([
      'canvas.render-scale renderScaleCoverage kind must be "selected-backing-pixels".',
    ]);
  });

  it("rejects non-array render-scale states at runtime", () => {
    expect(
      getErrors({
        acceptance: [
          makeRenderScaleAcceptance({
            renderScaleCoverage: {
              kind: "selected-backing-pixels",
              states: "interaction,steady",
            } as never,
          }),
        ],
      }),
    ).toEqual([
      "canvas.render-scale renderScaleCoverage states must be a sorted unique array.",
    ]);
  });

  it("requires playback coverage when the runtime timeline is enabled", () => {
    expect(
      getErrors({
        acceptance: [makeRenderScaleAcceptance()],
        timeline: true,
      }),
    ).toEqual([
      "canvas.render-scale renderScaleCoverage states must exactly equal: interaction, playback, steady.",
    ]);
  });

  it("accepts canonical interaction and steady coverage without a timeline", () => {
    expect(
      getErrors({
        acceptance: [makeRenderScaleAcceptance()],
      }),
    ).toEqual([]);
  });

  it("accepts canonical playback coverage when the timeline is enabled", () => {
    expect(
      getErrors({
        acceptance: [
          makeRenderScaleAcceptance({
            renderScaleCoverage: {
              kind: "selected-backing-pixels",
              states: ["interaction", "playback", "steady"],
            },
          }),
        ],
        timeline: true,
      }),
    ).toEqual([]);
  });

  it("does not require backing-pixel coverage when raster render scale is disabled", () => {
    const schemaWithoutRenderScale = defineContractSchemaFixture({
      base: {
        identity: { id: "contract-fixture", title: "Contract fixture" },
        canvas: { enabled: true },
        panels: {
          controls: {
            sections: [],
            title: "Controls",
          },
        },
        persistence: { storage: "none" },
      },
      modules: [],
    });

    expect(
      getToolcraftRenderScaleCoverageErrors({
        acceptance: [],
        schema: schemaWithoutRenderScale,
      }),
    ).toEqual([]);
  });

  it("rejects render-scale coverage when raster render scale is disabled", () => {
    const schemaWithoutRenderScale = defineContractSchemaFixture({
      base: {
        identity: { id: "contract-fixture", title: "Contract fixture" },
        canvas: { enabled: true },
        panels: {
          controls: {
            sections: [],
            title: "Controls",
          },
        },
        persistence: { storage: "none" },
      },
      modules: [],
    });

    expect(
      getToolcraftRenderScaleCoverageErrors({
        acceptance: [makeRenderScaleAcceptance()],
        schema: schemaWithoutRenderScale,
      }),
    ).toEqual([
      "canvas.renderScale is disabled and must not declare renderScaleCoverage.",
    ]);
  });
});
