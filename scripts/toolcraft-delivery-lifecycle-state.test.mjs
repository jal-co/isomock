import assert from "node:assert/strict";
import test from "node:test";

import {
  createToolcraftDeliveryLifecycleState,
  getToolcraftDeliveryLifecycleStateError,
} from "./toolcraft-delivery-lifecycle-state.mjs";

const hash = (character) => character.repeat(64);

function lifecycle(hashes = []) {
  return {
    consumedPerformanceRequestAuthorityHashes: hashes,
    performanceEscalationOffered: false,
  };
}

test("lifecycle state rejects symbol, hidden, and non-plain records", () => {
  const symbolKey = lifecycle();
  symbolKey[Symbol("hidden")] = true;
  const hiddenKey = lifecycle();
  Object.defineProperty(hiddenKey, "hidden", { value: true });
  const hiddenRequiredKey = lifecycle();
  Object.defineProperty(
    hiddenRequiredKey,
    "performanceEscalationOffered",
    { enumerable: false },
  );
  const nonPlain = Object.assign(
    Object.create({ inherited: true }),
    lifecycle(),
  );

  for (const value of [
    symbolKey,
    hiddenKey,
    hiddenRequiredKey,
    nonPlain,
  ]) {
    assert.match(
      getToolcraftDeliveryLifecycleStateError(value),
      /malformed or noncanonical/iu,
    );
    assert.throws(
      () => createToolcraftDeliveryLifecycleState({ previous: value }),
      /malformed or noncanonical/iu,
    );
  }
});

test("lifecycle state rejects sparse and augmented authority hash arrays", () => {
  const sparse = Array(1);
  const extraString = [hash("a")];
  extraString.hidden = true;
  const extraSymbol = [hash("a")];
  extraSymbol[Symbol("hidden")] = true;

  for (const hashes of [sparse, extraString, extraSymbol]) {
    assert.match(
      getToolcraftDeliveryLifecycleStateError(lifecycle(hashes)),
      /malformed or noncanonical/iu,
    );
  }
});

test("lifecycle state retains sorted unique canonical hash validation", () => {
  assert.equal(
    getToolcraftDeliveryLifecycleStateError(
      lifecycle([hash("a"), hash("b")]),
    ),
    undefined,
  );
  for (const hashes of [
    [hash("b"), hash("a")],
    [hash("a"), hash("a")],
    ["not-a-hash"],
  ]) {
    assert.match(
      getToolcraftDeliveryLifecycleStateError(lifecycle(hashes)),
      /malformed or noncanonical/iu,
    );
  }
});
