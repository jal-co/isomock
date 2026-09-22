import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  validateToolcraftDeliveryCatalog,
} from "./toolcraft-delivery-catalog-validation.mjs";
import { createToolcraftDeliveryCatalog } from "./toolcraft-delivery-catalog.mjs";

const rootDir = path.join(path.parse(process.cwd()).root, "toolcraft-catalog");
const completeAcceptance = {
  actionCoverage: ["shape", "smoothing"],
  automated: true,
  automatedTestName: "material shape changes output",
  browser: {
    budget: "standard",
    file: "e2e/product-material.spec.ts",
    testName: "browser: material shape changes rendered output",
  },
  canvasHandle: {
    outputObservable: "Donut silhouette changes",
    testId: "shape-handle",
    writesTarget: "material.shape",
  },
  componentType: "material-shape",
  evidence: "rendered-pixels",
  expectedObservable: "The donut silhouette changes and remains smooth.",
  fixture: "authored donut",
  id: "material.donut.shape",
  kind: "control",
  optionCoverage: ["round", "faceted"],
  target: "material.shape",
  userAction: "Choose the faceted material shape.",
};

function availableTest(file, testName) {
  return { file: path.join(rootDir, file), testName };
}

function catalogRow(acceptanceId, file, testName) {
  return {
    acceptanceId,
    contractHash: "a".repeat(64),
    domainId: acceptanceId.split(".")[0],
    file,
    testName,
  };
}

function catalogWith(acceptance) {
  return { acceptance, performance: [], version: 2 };
}

test("collector hashes the complete acceptance entry and changes only its semantic hash", () => {
  const create = (entry) =>
    createToolcraftDeliveryCatalog({
      acceptance: [entry],
      availableTests: [
        availableTest(entry.browser.file, entry.browser.testName),
      ],
      performancePaths: [],
      rootDir,
    });
  const current = create(completeAcceptance);
  const changed = create({
    ...completeAcceptance,
    expectedObservable: "The faceted donut has a visibly sharper silhouette.",
  });

  assert.deepEqual(Object.keys(current.acceptance[0]).sort(), [
    "acceptanceId",
    "contractHash",
    "domainId",
    "file",
    "testName",
  ]);
  assert.deepEqual(current.acceptance[0], {
    acceptanceId: "material.donut.shape",
    contractHash: current.acceptance[0].contractHash,
    domainId: "material",
    file: "e2e/product-material.spec.ts",
    testName: completeAcceptance.browser.testName,
  });
  assert.match(current.acceptance[0].contractHash, /^[a-f0-9]{64}$/u);
  assert.notEqual(current.acceptance[0].contractHash, changed.acceptance[0].contractHash);
  assert.deepEqual(
    { ...current.acceptance[0], contractHash: changed.acceptance[0].contractHash },
    changed.acceptance[0],
  );
  assert.equal(current.version, 2);
});

test("catalog v2 exact-key validation rejects legacy and malformed semantic rows", () => {
  const valid = catalogWith([
    catalogRow(
      "material.donut.shape",
      "e2e/product-material.spec.ts",
      completeAcceptance.browser.testName,
    ),
  ]);
  assert.deepEqual(validateToolcraftDeliveryCatalog(valid).errors, []);

  const legacy = structuredClone(valid);
  legacy.version = 1;
  assert.match(
    validateToolcraftDeliveryCatalog(legacy).errors.join("\n"),
    /catalog\.version must be 2/iu,
  );
  for (const mutate of [
    (row) => { row.extra = true; },
    (row) => { row.domainId = "export"; },
    (row) => { row.contractHash = "A".repeat(64); },
    (row) => { row.contractHash = "a".repeat(63); },
  ]) {
    const malformed = structuredClone(valid);
    mutate(malformed.acceptance[0]);
    assert.notDeepEqual(
      validateToolcraftDeliveryCatalog(malformed).errors,
      [],
    );
  }
});

test("a browser file owns one acceptance domain while same-domain rows may share it", () => {
  const materialRows = [
    catalogRow("material.color", "e2e/product-output.spec.ts", "browser: material color"),
    catalogRow("material.shape", "e2e/product-output.spec.ts", "browser: material shape"),
  ];
  assert.deepEqual(
    validateToolcraftDeliveryCatalog(catalogWith(materialRows)).errors,
    [],
  );

  const errors = validateToolcraftDeliveryCatalog(catalogWith([
    ...materialRows,
    catalogRow("export.image.format", "e2e/product-output.spec.ts", "browser: image format"),
  ])).errors;
  assert.match(
    errors.join("\n"),
    /product-output\.spec\.ts.*export.*material.*one acceptance domain/iu,
  );
});

test("catalog exact-key validation rejects symbol fields on catalog and acceptance rows", () => {
  const valid = catalogWith([
    catalogRow("material.shape", "e2e/product-material.spec.ts", "browser: material shape"),
  ]);
  const symbol = Symbol("unexpected");
  const catalogSymbol = { ...valid, [symbol]: true };
  const rowSymbol = {
    ...valid,
    acceptance: [{ ...valid.acceptance[0], [symbol]: true }],
  };
  const acceptanceArray = [...valid.acceptance];
  acceptanceArray[symbol] = true;
  const performanceArray = [];
  performanceArray[symbol] = true;
  for (const malformed of [
    catalogSymbol,
    rowSymbol,
    { ...valid, acceptance: acceptanceArray },
    { ...valid, performance: performanceArray },
  ]) {
    assert.match(
      validateToolcraftDeliveryCatalog(malformed).errors.join("\n"),
      /symbol/iu,
    );
  }
});
