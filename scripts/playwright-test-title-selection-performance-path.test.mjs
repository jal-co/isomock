import assert from "node:assert/strict";
import test from "node:test";

import {
  validateToolcraftDeliveryCatalog,
} from "./toolcraft-delivery-catalog-validation.mjs";

function encodeSignature(signature) {
  assert.equal(signature.length, 7);
  return `performance-path:${encodeURIComponent(JSON.stringify(signature))}`;
}

function catalogForPath(pathId, passIds) {
  return {
    acceptance: [],
    performance: [
      {
        passIds,
        pathId,
        testName: `browser perf: toolcraft path ${pathId}`,
      },
    ],
    version: 2,
  };
}

test("catalog accepts exact canonical passless and pass-bearing paths", () => {
  for (const [invalidates, runsOn] of [
    [[], ["main"]],
    [["composite", "source"], ["main", "worker"]],
  ]) {
    const pathId = encodeSignature([
      "interactive-discrete",
      "control-change",
      invalidates,
      [],
      [],
      runsOn,
      ["pixel-count"],
    ]);
    const result = validateToolcraftDeliveryCatalog(catalogForPath(pathId, invalidates));
    assert.deepEqual(result.errors, []);
    assert.deepEqual(Object.keys(result.catalog.performance[0]).sort(), [
      "passIds",
      "pathId",
      "testName",
    ]);
  }
});

test("catalog rejects noncanonical performance path domains and arrays", () => {
  const signatures = [
    ["unknown-profile", "control-change", [], [], [], ["main"], []],
    ["interactive-discrete", "unknown-interaction", [], [], [], ["main"], []],
    ["interactive-discrete", "control-change", [], [], [], ["satellite"], []],
    [
      "interactive-discrete",
      "control-change",
      ["composite", "composite"],
      [],
      [],
      ["main"],
      [],
    ],
    [
      "interactive-discrete",
      "control-change",
      [],
      [],
      [],
      ["main", "main"],
      [],
    ],
    [
      "interactive-discrete",
      "control-change",
      [],
      [],
      [],
      ["main"],
      ["pixel-count", "pixel-count"],
    ],
  ];

  for (const signature of signatures) {
    const pathId = encodeSignature(signature);
    assert.match(
      validateToolcraftDeliveryCatalog(
        catalogForPath(pathId, [...new Set(signature[2])]),
      ).errors.join("\n"),
      /malformed canonical path/iu,
    );
  }
});

test("catalog rejects malformed paths and mismatched invalidated passes", () => {
  assert.match(
    validateToolcraftDeliveryCatalog(
      catalogForPath("performance-path:not-json", []),
    ).errors.join("\n"),
    /malformed canonical path/iu,
  );
  const pathId = encodeSignature([
    "interactive-discrete",
    "control-change",
    ["composite"],
    [],
    [],
    ["main"],
    [],
  ]);
  assert.match(
    validateToolcraftDeliveryCatalog(
      catalogForPath(pathId, ["source"]),
    ).errors.join("\n"),
    /does not match.*path/iu,
  );
});

test("catalog rejects symbol fields on performance rows", () => {
  const pathId = encodeSignature([
    "interactive-discrete",
    "control-change",
    [],
    [],
    [],
    ["main"],
    [],
  ]);
  const catalog = catalogForPath(pathId, []);
  const symbol = Symbol("unexpected");
  const rowSymbol = structuredClone(catalog);
  rowSymbol.performance[0][symbol] = true;
  const passIdsSymbol = structuredClone(catalog);
  passIdsSymbol.performance[0].passIds[symbol] = true;
  for (const malformed of [rowSymbol, passIdsSymbol]) {
    assert.match(
      validateToolcraftDeliveryCatalog(malformed).errors.join("\n"),
      /symbol/iu,
    );
  }
});
