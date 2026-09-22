import { expect, test } from "@playwright/test";

import {
  defineToolcraft,
  type ToolcraftPerformancePath,
} from "@/toolcraft/runtime";

import {
  compileToolcraftPerformancePathAdapterMatrix,
  getToolcraftPerformancePathSettleFrames,
  getToolcraftPerformancePathTestName,
} from "./performance-path-adapter-matrix";
import type { ToolcraftPerformancePathAdapter } from "./performance-path-adapter-contract";

const rasterSchema = defineToolcraft({
  base: {
    identity: { id: "contract-fixture", title: "Contract fixture" },
    canvas: { enabled: true, renderScale: true },
    panels: { controls: { sections: [], title: "Controls" } },
  },
  modules: [],
});

const vectorSchema = defineToolcraft({
  base: {
    identity: { id: "contract-fixture", title: "Contract fixture" },
    canvas: { enabled: true },
    panels: { controls: { sections: [], title: "Controls" } },
  },
  modules: [],
});

const paths = [
  {
    id: "performance-path:b",
    interaction: "control-change",
    invalidates: [],
    preparationInvalidates: [],
    profile: "interactive-discrete",
    retainedAccesses: [],
    runsOn: [],
    targets: ["appearance.b"],
    workloadDimensions: [],
  },
  {
    id: "performance-path:a",
    interaction: "control-drag",
    invalidates: ["preview"],
    preparationInvalidates: [],
    profile: "interactive-continuous",
    retainedAccesses: [],
    runsOn: ["main"],
    targets: ["appearance.a", "appearance.aEquivalent"],
    workloadDimensions: [],
  },
] as const satisfies readonly ToolcraftPerformancePath[];

function adapter(pathId: string): ToolcraftPerformancePathAdapter {
  return {
    action: async () => undefined,
    observeOutcome: () => pathId,
    pathId,
    prepare: async () => undefined,
  };
}

test("browser perf: path adapter matrix is canonical and deterministic", () => {
  const matrix = compileToolcraftPerformancePathAdapterMatrix({
    adapters: [adapter(paths[0].id), adapter(paths[1].id)],
    canvasBacking: undefined,
    paths,
    schema: vectorSchema,
  });

  expect(matrix.map((entry) => entry.path.id)).toEqual([
    "performance-path:a",
    "performance-path:b",
  ]);
  expect(matrix.map((entry) => entry.testName)).toEqual(
    matrix.map((entry) => getToolcraftPerformancePathTestName(entry.path)),
  );
  expect(matrix[0]?.path.targets).toEqual([
    "appearance.a",
    "appearance.aEquivalent",
  ]);
});

test("browser perf: interaction measurements collect enough frames for a real p95", () => {
  expect(
    getToolcraftPerformancePathSettleFrames({ interaction: "initial-render" }),
  ).toBe(20);
  expect(
    getToolcraftPerformancePathSettleFrames({ interaction: "control-change" }),
  ).toBe(20);
  expect(
    getToolcraftPerformancePathSettleFrames({ interaction: "viewport-zoom" }),
  ).toBe(20);
  expect(
    getToolcraftPerformancePathSettleFrames({ interaction: "animation-frame" }),
  ).toBeUndefined();
  expect(
    getToolcraftPerformancePathSettleFrames({ interaction: "export" }),
  ).toBeUndefined();
});

test("browser perf: path adapter matrix rejects missing duplicate and orphan adapters", () => {
  expect(() =>
    compileToolcraftPerformancePathAdapterMatrix({
      adapters: [adapter(paths[0].id)],
      canvasBacking: undefined,
      paths,
      schema: vectorSchema,
    }),
  ).toThrow(/missing adapter.*performance-path:a/iu);

  expect(() =>
    compileToolcraftPerformancePathAdapterMatrix({
      adapters: [
        adapter(paths[0].id),
        adapter(paths[0].id),
        adapter(paths[1].id),
      ],
      canvasBacking: undefined,
      paths,
      schema: vectorSchema,
    }),
  ).toThrow(/duplicate adapter.*performance-path:b/iu);

  expect(() =>
    compileToolcraftPerformancePathAdapterMatrix({
      adapters: [
        adapter(paths[0].id),
        adapter(paths[1].id),
        adapter("performance-path:orphan"),
      ],
      canvasBacking: undefined,
      paths,
      schema: vectorSchema,
    }),
  ).toThrow(/orphan adapter.*performance-path:orphan/iu);

  expect(() =>
    compileToolcraftPerformancePathAdapterMatrix({
      adapters: [adapter(paths[0].id)],
      canvasBacking: undefined,
      paths: [paths[0], paths[0]],
      schema: vectorSchema,
    }),
  ).toThrow(/duplicate canonical path ids/iu);
});

test("browser perf: path adapter matrix enforces outcome and output semantics", () => {
  expect(() =>
    compileToolcraftPerformancePathAdapterMatrix({
      adapters: [
        { ...adapter(paths[0].id), observeOutcome: undefined },
        adapter(paths[1].id),
      ],
      canvasBacking: undefined,
      paths,
      schema: vectorSchema,
    }),
  ).toThrow(/requires an observable product outcome/iu);

  const exportPath = {
    id: "performance-path:export",
    interaction: "export",
    invalidates: ["output"],
    preparationInvalidates: [],
    profile: "batch-responsive",
    retainedAccesses: [],
    runsOn: ["main"],
    targets: ["export.image"],
    workloadDimensions: [],
  } as const satisfies ToolcraftPerformancePath;
  expect(() =>
    compileToolcraftPerformancePathAdapterMatrix({
      adapters: [adapter(exportPath.id)],
      canvasBacking: undefined,
      paths: [exportPath],
      schema: vectorSchema,
    }),
  ).toThrow(/requires a protected output completion adapter/iu);
});

test("browser perf: raster catalogs require one product canvas backing proof", () => {
  expect(() =>
    compileToolcraftPerformancePathAdapterMatrix({
      adapters: [adapter(paths[0].id), adapter(paths[1].id)],
      canvasBacking: undefined,
      paths,
      schema: rasterSchema,
    }),
  ).toThrow(/render-scale-enabled.*product canvas selector/iu);

  expect(() =>
    compileToolcraftPerformancePathAdapterMatrix({
      adapters: [adapter(paths[0].id), adapter(paths[1].id)],
      canvasBacking: { canvasSelector: "[data-product-canvas]" },
      paths,
      schema: rasterSchema,
    }),
  ).not.toThrow();

  expect(() =>
    compileToolcraftPerformancePathAdapterMatrix({
      adapters: [adapter(paths[0].id), adapter(paths[1].id)],
      canvasBacking: { canvasSelector: "[data-product-canvas]" },
      paths,
      schema: vectorSchema,
    }),
  ).toThrow(/must be omitted.*render scale is disabled/iu);
});

test("browser perf: preparation render scale belongs only to its canvas action", () => {
  const prepared = {
    ...adapter(paths[1].id),
    preparationRenderScale: 1,
  };
  expect(() =>
    compileToolcraftPerformancePathAdapterMatrix({
      adapters: [adapter(paths[0].id), prepared],
      canvasBacking: { canvasSelector: "[data-product-canvas]" },
      paths,
      schema: rasterSchema,
    }),
  ).toThrow(/invalid preparation render scale/iu);
});

test("browser perf: canvas backing config is an exact selector object", () => {
  for (const canvasBacking of [
    null,
    [],
    "[data-product-canvas]",
    { canvasSelector: "" },
    { canvasSelector: " [data-product-canvas]" },
    { canvasSelector: "[data-product-canvas] " },
    { canvasSelector: "[data-product-canvas]", extra: true },
  ]) {
    expect(() =>
      compileToolcraftPerformancePathAdapterMatrix({
        adapters: [adapter(paths[0].id), adapter(paths[1].id)],
        canvasBacking: canvasBacking as never,
        paths,
        schema: rasterSchema,
      }),
    ).toThrow(/performance (?:canvas backing|catalogs require)/iu);
  }
});

test("browser perf: vector catalogs reject every present falsy canvas backing value", () => {
  for (const canvasBacking of [null, false, 0, ""]) {
    expect(() =>
      compileToolcraftPerformancePathAdapterMatrix({
        adapters: [adapter(paths[0].id), adapter(paths[1].id)],
        canvasBacking: canvasBacking as never,
        paths,
        schema: vectorSchema,
      }),
    ).toThrow(/must be omitted.*render scale is disabled/iu);
  }
});

test("browser perf: canvas backing rejects accessors without invoking them", () => {
  let getterReads = 0;
  const canvasBacking = Object.defineProperty({}, "canvasSelector", {
    enumerable: true,
    get: () => {
      getterReads += 1;
      return getterReads === 1
        ? "[data-product-canvas]"
        : "[data-mutated-canvas]";
    },
  });

  expect(() =>
    compileToolcraftPerformancePathAdapterMatrix({
      adapters: [adapter(paths[0].id), adapter(paths[1].id)],
      canvasBacking: canvasBacking as never,
      paths,
      schema: rasterSchema,
    }),
  ).toThrow(/canvasSelector.*data property/iu);
  expect(getterReads).toBe(0);
});

test("browser perf: canvas backing snapshots proxy data without property reads", () => {
  let propertyReads = 0;
  const canvasBacking = new Proxy(
    { canvasSelector: "[data-product-canvas]" },
    {
      get(target, property, receiver) {
        if (property === "canvasSelector") {
          propertyReads += 1;
          return propertyReads === 1
            ? Reflect.get(target, property, receiver)
            : "[data-mutated-canvas]";
        }
        return Reflect.get(target, property, receiver);
      },
    },
  );

  const matrix = compileToolcraftPerformancePathAdapterMatrix({
    adapters: [adapter(paths[0].id), adapter(paths[1].id)],
    canvasBacking,
    paths,
    schema: rasterSchema,
  });

  expect(propertyReads).toBe(0);
  expect(matrix[0]?.canvasBacking?.canvasSelector).toBe(
    "[data-product-canvas]",
  );
});

test("browser perf: compiled canvas backing is one immutable snapshot", () => {
  const canvasBacking = { canvasSelector: "[data-product-canvas]" };
  const matrix = compileToolcraftPerformancePathAdapterMatrix({
    adapters: [adapter(paths[0].id), adapter(paths[1].id)],
    canvasBacking,
    paths,
    schema: rasterSchema,
  });

  canvasBacking.canvasSelector = "[data-mutated-canvas]";

  expect(matrix[0]?.canvasBacking).toBe(matrix[1]?.canvasBacking);
  expect(matrix[0]?.canvasBacking).toEqual({
    canvasSelector: "[data-product-canvas]",
  });
  expect(Object.isFrozen(matrix[0]?.canvasBacking)).toBe(true);
});

test("browser perf: compiled adapters retain phase preparation outside action", async () => {
  const preparedPhases: string[] = [];
  const settledPhases: string[] = [];
  const prepared = {
    ...adapter(paths[0].id),
    preparePhase: ({ phase }: Parameters<
      NonNullable<ToolcraftPerformancePathAdapter["preparePhase"]>
    >[0]) => {
      preparedPhases.push(phase);
    },
    settlePhase: ({ phase }: Parameters<
      NonNullable<ToolcraftPerformancePathAdapter["settlePhase"]>
    >[0]) => {
      settledPhases.push(phase);
    },
  };
  const matrix = compileToolcraftPerformancePathAdapterMatrix({
    adapters: [prepared, adapter(paths[1].id)],
    canvasBacking: undefined,
    paths,
    schema: vectorSchema,
  });
  const compiled = matrix.find(({ path }) => path.id === paths[0].id)!;
  await compiled.adapter.preparePhase?.({
    page: {} as never,
    path: compiled.path,
    phase: "cold",
  });
  await compiled.adapter.settlePhase?.({
    page: {} as never,
    path: compiled.path,
    phase: "cold",
  });
  expect(preparedPhases).toEqual(["cold"]);
  expect(settledPhases).toEqual(["cold"]);
  expect(compiled.adapter.action).toBe(prepared.action);
});
