import { expect, test } from "@playwright/test";

import {
  defineToolcraft,
  deriveToolcraftModelPerformancePaths,
  model3dModule,
  spatialViewModule,
} from "@/toolcraft/runtime";

import {
  createToolcraftModelCompatibilityFixtures,
  createToolcraftModelPressureFixture,
} from "./performance-model-import-fixtures";

function createModelSchema(
  formats?: readonly ("fbx" | "glb" | "gltf" | "obj" | "ply" | "stl")[],
) {
  return defineToolcraft({
    base: {
      identity: { id: "contract-fixture", title: "Contract fixture" },
      canvas: { enabled: true, sizing: { mode: "editable-output" } },
      panels: {
        controls: {
          sections: [
            {
              id: "test-section-1",
              controls: {
                orientation: {
                  applicability: { mode: "always" as const },
                  defaultValue: { position: [0, 0, 5], up: [0, 1, 0] },
                  keyframeable: false,
                  label: false,
                  target: "view.orientation",
                  type: "orientationGizmo",
                },
                source: {
                  applicability: { mode: "always" as const },
                  assetKind: "model",
                  ...(formats ? { modelFormats: formats } : {}),
                  target: "source.model",
                  type: "fileDrop",
                },
              },
              title: "Model",
            },
          ],
          title: "Controls",
        },
      },
    },
    modules: [model3dModule(), spatialViewModule()],
  });
}

test("toolcraft model fixture: matrix covers every advertised format and encoding", () => {
  const importPath = deriveToolcraftModelPerformancePaths(
    createModelSchema(),
  ).find((path) => path.kind === "import");
  expect(importPath).toBeDefined();

  const fixtures = createToolcraftModelCompatibilityFixtures(
    importPath!.formats,
  );
  expect(
    fixtures.map(({ encoding, format }) => `${format}:${encoding}`),
  ).toEqual([
    "glb:binary",
    "gltf:json-bundle",
    "fbx:ascii",
    "obj:ascii",
    "stl:ascii",
    "stl:binary",
    "ply:ascii",
    "ply:binary",
  ]);
  for (const fixture of fixtures) {
    expect(fixture.files.length).toBeGreaterThan(0);
    expect(fixture.observed.sourceBytes).toBeGreaterThan(0);
    expect(fixture.files.every((entry) => entry.buffer.byteLength > 0)).toBe(
      true,
    );
  }
});

test("toolcraft model fixture: materializes schema-derived source and bundle pressure", () => {
  const importPath = deriveToolcraftModelPerformancePaths(
    createModelSchema(["gltf"]),
  ).find((path) => path.kind === "import");
  expect(importPath).toBeDefined();

  const source = createToolcraftModelPressureFixture(
    importPath!,
    "model-source-bytes",
  );
  const bundle = createToolcraftModelPressureFixture(
    importPath!,
    "model-bundle-files",
  );
  const sourceDimension = importPath!.dimensions.find(
    (dimension) => dimension.id === "model-source-bytes",
  )!;
  const bundleDimension = importPath!.dimensions.find(
    (dimension) => dimension.id === "model-bundle-files",
  )!;

  expect(source.observed.sourceBytes).toBeGreaterThanOrEqual(
    sourceDimension.developmentValue,
  );
  expect(source.observed.sourceBytes).toBeLessThanOrEqual(
    sourceDimension.configuredMaximumValue,
  );
  expect(bundle.observed.bundleFiles).toBe(bundleDimension.developmentValue);
});

test("toolcraft model fixture: materializes package pressure without requiring glTF", () => {
  const importPath = deriveToolcraftModelPerformancePaths(
    createModelSchema(["obj"]),
  ).find((path) => path.kind === "import")!;
  const bundle = createToolcraftModelPressureFixture(
    importPath,
    "model-bundle-files",
  );
  const dimension = importPath.dimensions.find(
    ({ id }) => id === "model-bundle-files",
  )!;

  expect(bundle.format).toBe("obj");
  expect(bundle.observed.bundleFiles).toBe(dimension.developmentValue);
});

test("toolcraft model fixture: topology pressure remains inside the configured source ceiling", () => {
  const paths = deriveToolcraftModelPerformancePaths(
    createModelSchema(["glb"]),
  );
  const analysisPath = paths.find((path) => path.kind === "analysis-repair");
  const importPath = paths.find((path) => path.kind === "import");
  expect(analysisPath).toBeDefined();
  expect(importPath).toBeDefined();

  const sourceLimit = importPath!.dimensions.find(
    (dimension) => dimension.id === "model-source-bytes",
  )!.configuredMaximumValue;

  for (const dimensionId of [
    "model-nodes",
    "model-primitives",
    "model-triangles",
    "model-vertices",
  ] as const) {
    const fixture = createToolcraftModelPressureFixture(
      analysisPath!,
      dimensionId,
    );
    expect(fixture.observed.sourceBytes).toBeGreaterThan(0);
    expect(fixture.observed.sourceBytes).toBeLessThanOrEqual(sourceLimit);
  }
});
