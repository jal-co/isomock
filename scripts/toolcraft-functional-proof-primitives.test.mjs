import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  createToolcraftAcceptanceContractHash,
  createToolcraftCanonicalJsonHash,
  deepFreezeToolcraftValue,
  deriveToolcraftAcceptanceDomainId,
  hasToolcraftExactRecordKeys,
  isToolcraftCanonicalTargetArray,
  isToolcraftDeeplyFrozen,
  isToolcraftDenseExactArray,
  serializeToolcraftCanonicalJson,
} from "./toolcraft-functional-proof-primitives.mjs";

test("one primitive boundary owns canonical serialization and semantic hashes", () => {
  const value = { z: [true, null], a: { number: 2, text: "2" } };
  const canonical = '{"a":{"number":2,"text":"2"},"z":[true,null]}';
  assert.equal(serializeToolcraftCanonicalJson(value), canonical);
  assert.equal(
    createToolcraftCanonicalJsonHash(value),
    createHash("sha256").update(canonical).digest("hex"),
  );
  assert.equal(
    createToolcraftAcceptanceContractHash(value),
    createToolcraftCanonicalJsonHash(value),
  );
  assert.equal(deriveToolcraftAcceptanceDomainId("material.shape"), "material");
});

test("canonical structural primitives reject ambiguous proof shapes", () => {
  assert.equal(
    hasToolcraftExactRecordKeys({ files: [], kind: "product-tests" }, [
      "files",
      "kind",
    ]),
    true,
  );
  assert.equal(
    hasToolcraftExactRecordKeys({ files: [], kind: "product-tests", extra: true }, [
      "files",
      "kind",
    ]),
    false,
  );
  assert.equal(isToolcraftDenseExactArray(["a"]), true);
  assert.equal(isToolcraftDenseExactArray(Array(1)), false);
  assert.equal(
    isToolcraftCanonicalTargetArray(["src/app/a.ts", "src/app/b.ts"], {
      paths: true,
    }),
    true,
  );
  assert.equal(
    isToolcraftCanonicalTargetArray(["src/app/b.ts", "../a.ts"], {
      paths: true,
    }),
    false,
  );
});

test("canonical deep freeze preserves identity and proves nested immutability", () => {
  const value = { nested: { acceptanceIds: ["output.updates"] } };

  assert.equal(deepFreezeToolcraftValue(value), value);
  assert.equal(isToolcraftDeeplyFrozen(value), true);
});

test("canonical primitives reject symbol keys at every object depth", () => {
  const topLevel = { value: true, [Symbol("top")]: true };
  const nested = { nested: { value: true, [Symbol("nested")]: true } };
  for (const value of [topLevel, nested]) {
    assert.throws(() => serializeToolcraftCanonicalJson(value), /symbol keys/iu);
    assert.throws(() => createToolcraftCanonicalJsonHash(value), /symbol keys/iu);
  }
});

test("canonical primitives reject sparse and augmented arrays", () => {
  const sparse = Array(1);
  const extraString = [true];
  extraString.hidden = true;
  const extraSymbol = [true];
  extraSymbol[Symbol("hidden")] = true;

  for (const value of [sparse, extraString, extraSymbol]) {
    assert.throws(
      () => serializeToolcraftCanonicalJson(value),
      /array|symbol/iu,
    );
    assert.throws(
      () => createToolcraftCanonicalJsonHash(value),
      /array|symbol/iu,
    );
  }
});

test("canonical primitives reject non-enumerable object properties", () => {
  const value = { visible: true };
  Object.defineProperty(value, "hidden", { value: true });

  assert.throws(
    () => serializeToolcraftCanonicalJson(value),
    /non-enumerable/iu,
  );
  assert.throws(
    () => createToolcraftCanonicalJsonHash(value),
    /non-enumerable/iu,
  );
});
