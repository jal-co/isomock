import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  TOOLCRAFT_FUNCTIONAL_PROOF_MODEL_VERSION,
  createToolcraftAcceptanceContractHash,
  createToolcraftFunctionalProofModel,
  createToolcraftFunctionalProofModelHash,
  deriveToolcraftAcceptanceDomainId,
  getToolcraftFunctionalProofModelError,
} from "./toolcraft-functional-proof-model.mjs";

const hash = (character) => character.repeat(64);
const acceptanceRow = (acceptanceId, contractHash = hash("a")) => ({
  acceptanceId,
  contractHash,
  domainId: acceptanceId.split(".")[0],
  file: `e2e/${acceptanceId.split(".")[0]}.spec.ts`,
  testName: `browser: ${acceptanceId}`,
});
const catalog = (acceptance) => ({ acceptance, performance: [], version: 2 });

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

test("acceptance contract hashing uses canonical JSON", () => {
  const left = { nested: { z: null, a: [true, 2, "2"] }, title: "material" };
  const right = { title: "material", nested: { a: [true, 2, "2"], z: null } };
  const expected = createHash("sha256")
    .update('{"nested":{"a":[true,2,"2"],"z":null},"title":"material"}')
    .digest("hex");
  assert.equal(createToolcraftAcceptanceContractHash(left), expected);
  assert.equal(createToolcraftAcceptanceContractHash(right), expected);
});

test("acceptance contract hashing rejects non-JSON values", () => {
  const cyclic = {};
  cyclic.self = cyclic;
  for (const value of [
    { value: undefined },
    { value() {} },
    { value: Symbol("value") },
    { value: Number.NaN },
    cyclic,
  ]) {
    assert.throws(
      () => createToolcraftAcceptanceContractHash(value),
      /canonical JSON/iu,
    );
  }
});

test("acceptance domains use the first stable namespace segment", () => {
  assert.equal(deriveToolcraftAcceptanceDomainId("material.donut.shape"), "material");
  assert.equal(deriveToolcraftAcceptanceDomainId("canvas"), "canvas");
  assert.throws(() => deriveToolcraftAcceptanceDomainId(""), /acceptance id/iu);
});

test("functional proof model contains only the complete canonical acceptance catalog", () => {
  const model = createToolcraftFunctionalProofModel({
    catalog: catalog([
      acceptanceRow("material.shape", hash("b")),
      acceptanceRow("export.image"),
    ]),
  });

  assert.equal(TOOLCRAFT_FUNCTIONAL_PROOF_MODEL_VERSION, 2);
  assert.deepEqual(model, {
    acceptance: [
      acceptanceRow("export.image"),
      acceptanceRow("material.shape", hash("b")),
    ],
    version: 2,
  });
  assert.equal(getToolcraftFunctionalProofModelError(model), undefined);
  assert.equal(Object.isFrozen(model), true);
  assert.equal(Object.isFrozen(model.acceptance), true);
  assert.match(createToolcraftFunctionalProofModelHash(model), /^[a-f0-9]{64}$/u);
});

test("functional proof model rejects extra and noncanonical fields", () => {
  const model = createToolcraftFunctionalProofModel({
    catalog: catalog([acceptanceRow("material.shape")]),
  });
  const malformed = deepFreeze({ ...model, owners: [] });
  assert.match(
    getToolcraftFunctionalProofModelError(malformed),
    /unknown fields: owners/iu,
  );
  assert.throws(
    () => createToolcraftFunctionalProofModelHash(malformed),
    /unknown fields: owners/iu,
  );
});

test("functional proof model hash is stable after canonical construction", () => {
  const rows = [
    acceptanceRow("material.shape", hash("b")),
    acceptanceRow("export.image"),
  ];
  const first = createToolcraftFunctionalProofModel({ catalog: catalog(rows) });
  const second = createToolcraftFunctionalProofModel({
    catalog: catalog([...rows].reverse()),
  });
  assert.deepEqual(first, second);
  assert.equal(
    createToolcraftFunctionalProofModelHash(first),
    createToolcraftFunctionalProofModelHash(second),
  );
});
