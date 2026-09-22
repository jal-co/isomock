import { expect, test } from "@playwright/test";

import { createToolcraftModelAppearanceFixtures } from "./performance-model-import-appearance-fixtures";
import { TOOLCRAFT_MODEL_APPEARANCE_PERFORMANCE_PASSES } from "./performance-model-appearance-contract";

test("toolcraft model appearance fixtures cover authored, fallback, package, warning, and hostile inputs", () => {
  const cases = createToolcraftModelAppearanceFixtures();

  expect(cases.map(({ id }) => id)).toEqual([
    "standalone-fallback-glb",
    "textured-glb",
    "textured-gltf-folder",
    "obj-material-folder",
    "obj-material-zip",
    "fbx-material",
    "ply-vertex-colors",
    "stl-fallback",
    "missing-texture",
    "multiple-roots-zip",
    "hostile-zip",
  ]);
  expect(cases.some(({ expected }) => expected.appearance === "authored")).toBe(true);
  expect(cases.some(({ expected }) => expected.appearance === "fallback")).toBe(true);
  expect(cases.some(({ expected }) => expected.appearance === "warning")).toBe(true);
  expect(cases.some(({ expected }) => expected.outcome === "rejected")).toBe(true);
  expect(new Set(cases.map(({ expected }) => expected.packageKind))).toEqual(
    new Set(["folder", "standalone", "zip"]),
  );

  for (const { expected, fixture, id } of cases) {
    expect(fixture.files.length, `${id} must contain source files.`).toBeGreaterThan(0);
    expect(fixture.observed.bundleFiles).toBe(fixture.files.length);
    expect(fixture.observed.sourceBytes).toBe(
      fixture.files.reduce((total, entry) => total + entry.buffer.byteLength, 0),
    );
    expect(fixture.observed.sourceBytes, `${id} must not be an empty placeholder.`)
      .toBeGreaterThan(0);
    expect(expected.selectedRootPath).not.toBe("");
    expect(expected.materialSignature).not.toBe("");
    if (expected.packageKind === "zip") {
      expect(fixture.files).toHaveLength(1);
      expect(fixture.files[0]!.buffer.readUInt32LE(0)).toBe(0x04034b50);
    }
  }
});

test("toolcraft model appearance performance contract assigns every affected pass", () => {
  expect(TOOLCRAFT_MODEL_APPEARANCE_PERFORMANCE_PASSES).toEqual([
    { execution: "worker", id: "package-extraction" },
    { execution: "worker", id: "canonical-decode" },
    { execution: "main-thread", id: "model-presentation" },
    { execution: "main-thread", id: "canvas-orbit" },
    { execution: "main-thread", id: "export" },
    { execution: "main-thread", id: "resource-cleanup" },
  ]);
});
