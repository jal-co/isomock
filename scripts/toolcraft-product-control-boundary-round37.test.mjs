import assert from "node:assert/strict";
import test from "node:test";
import { evaluateToolcraftProductBoundary } from
  "./toolcraft-product-boundary.mjs";
import { createToolcraftProductBoundaryFixture as createFixture } from
  "./toolcraft-product-boundary-test-fixtures.mjs";
import { round37FinalReviewFixtures } from
  "./toolcraft-product-control-boundary-round37-fixtures.mjs";
async function run(context, sources) {
  return evaluateToolcraftProductBoundary({
    rootDir: await createFixture(context, sources),
  });
}
function violations(result, repoPath) {
  return result.violations.filter((violation) =>
    violation.repoPath === repoPath && violation.kind === "public-component-chrome"
  );
}
test("product SameValue handles BigInt infinity NaN and signed zero", async (context) => {
  const source = (first, second) => `import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" }; const owner = {};
    Object.defineProperty(owner, "value", { value: ${first} });
    try { Object.defineProperty(owner, "value", { value: ${second} });
      props.className = "border"; } catch {}
    export const Case = <Button {...props} />;`;
  const big = "src/features/round37-product-bigint.tsx";
  const infinity = "src/features/round37-product-infinity.tsx";
  const nan = "src/features/round37-product-nan.tsx";
  const zero = "src/features/round37-product-zero.tsx";
  const negativeBig = "src/features/round37-product-negative-bigint.tsx";
  const bigZero = "src/features/round37-product-bigint-zero.tsx";
  const negativeNan = "src/features/round37-product-negative-nan.tsx";
  const bitwise = "src/features/round37-product-bitwise.tsx";
  const undefinedValue = "src/features/round37-product-void.tsx";
  const unknownNumber = "src/features/round37-product-unknown-number.tsx";
  const result = await run(context, {
    [big]: source("9007199254740993n", "9007199254740993n"),
    [infinity]: source("Infinity", "+Infinity"),
    [nan]: source("NaN", "NaN"), [zero]: source("+0", "-0"),
    [negativeBig]: source("-1n", "-1n"), [bigZero]: source("-0n", "0n"),
    [negativeNan]: source("-NaN", "NaN"), [bitwise]: source("~1", "-2"),
    [undefinedValue]: source("void 0", "undefined"),
    [unknownNumber]: `import { Button } from "@/toolcraft/ui";
      declare const left: number; declare const right: number;
      const props = { className: "flex" }; const owner = {};
      Object.defineProperty(owner, "value", { value: left });
      try { Object.defineProperty(owner, "value", { value: right });
        props.className = "border"; } catch {}
      export const Case = <Button {...props} />;`,
  });
  for (const path of [big, infinity, nan, negativeBig, bigZero, negativeNan,
    bitwise, undefinedValue, unknownNumber]) {
    assert.equal(violations(result, path).length, 1, `${path}: ${JSON.stringify(result.violations)}`);
  }
  assert.deepEqual(violations(result, zero), [], JSON.stringify(result.violations));
});
test("product overlapping SameValue alternatives remain correlated through an empty patch", async (context) => {
  const danger = "src/features/round37-product-overlap.tsx";
  const safe = "src/features/round37-product-overlap-control.tsx";
  const fixture = (replacement) => `import { Button } from "@/toolcraft/ui";
    declare const flag: boolean; const props = { className: "flex" }; const owner = {};
    Object.defineProperty(owner, "value", { value: flag ? 1n : Infinity });
    try { Object.defineProperty(owner, "value", { value: ${replacement} });
      Object.defineProperty(owner, "value", {}); props.className = "border"; } catch {}
    export const Case = <Button {...props} />;`;
  const result = await run(context, {
    [danger]: fixture("flag ? 1n : NaN"),
    [safe]: fixture("flag ? 2n : NaN"),
  });
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
});
test("product descriptor conversion keeps non-object abrupt and inherited receiver order", async (context) => {
  const abrupt = "src/features/round37-product-descriptor-abrupt.tsx";
  const inherited = "src/features/round37-product-descriptor-inherited.tsx";
  const nan = "src/features/round37-product-descriptor-nan.tsx";
  const infinity = "src/features/round37-product-descriptor-infinity.tsx";
  const { sources: reviewSources, typedCatch, typedNormal } =
    round37FinalReviewFixtures.descriptor;
  const result = await run(context, {
    [abrupt]: `import { Button } from "@/toolcraft/ui"; declare const flag: boolean;
      const props = { className: "flex" }; const descriptor = flag ? { value: 1 } : 1;
      try { Object.defineProperty({}, "value", descriptor as object); }
      catch { props.className = "border"; }
      export const Case = <Button {...props} />;`,
    [inherited]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; let ready = false;
      const descriptor = Object.create({ get enumerable() {
        ready = this === descriptor; return true; }, get configurable() {
        if (ready && this === descriptor) props.className = "border"; return true; } });
      Object.defineProperty({}, "value", descriptor);
      export const Case = <Button {...props} />;`,
    [nan]: `import { Button } from "@/toolcraft/ui"; const props = { className: "flex" };
      try { Object.defineProperty({}, "value", NaN as unknown as PropertyDescriptor); }
      catch { props.className = "border"; } export const Case = <Button {...props} />;`,
    [infinity]: `import { Button } from "@/toolcraft/ui"; const props = { className: "flex" };
      try { Object.defineProperty({}, "value", Infinity as unknown as PropertyDescriptor); }
      catch { props.className = "border"; } export const Case = <Button {...props} />;`,
    ...reviewSources,
  });
  assert.equal(violations(result, abrupt).length, 1, JSON.stringify(result.violations));
  assert.equal(violations(result, inherited).length, 1, JSON.stringify(result.violations));
  assert.equal(violations(result, nan).length, 1, JSON.stringify(result.violations));
  assert.equal(violations(result, infinity).length, 1, JSON.stringify(result.violations));
  assert.equal(violations(result, typedCatch).length, 1, JSON.stringify(result.violations));
  assert.deepEqual(violations(result, typedNormal), [], JSON.stringify(result.violations));
});
test("product OwnPropertyKeys uses index string and symbol specification order", async (context) => {
  const danger = "src/features/round37-product-own-key-order.tsx";
  const safe = "src/features/round37-product-own-key-order-safe.tsx";
  const reinsertAssign = "src/features/round37-product-reinsert-assign.tsx";
  const reinsertSpread = "src/features/round37-product-reinsert-spread.tsx";
  const fixture = (expected) => `import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" }; let order = ""; const first = Symbol();
    const second = Symbol(); const source = {
      get "02"() { order += "z"; return 0; },
      get "4294967295"() { order += "m"; return 0; },
      get "2"() { order += "2"; return 0; }, get "1"() { order += "1"; return 0; },
      get alpha() { order += "a"; return 0; }, get [first]() { order += "f"; return 0; },
      get [second]() { if (order === ${JSON.stringify(expected)}) props.className = "border";
        return 0; } };
    Object.assign({}, source); export const Case = <Button {...props} />;`;
  const result = await run(context, {
    [danger]: fixture("12zm af".replaceAll(" ", "")),
    [safe]: fixture("21zmaf"),
    ...Object.fromEntries([reinsertAssign, reinsertSpread].map((path, position) =>
      [path, `import { Button } from "@/toolcraft/ui";
        const props = { className: "flex" }; let ready = false; const source = {
          get a() { return 0; }, get b() { ready = true; return 0; } };
        delete source.a; Object.defineProperty(source, "a", { enumerable: true,
          get() { if (ready) props.className = "border"; return 0; } });
        ${position === 0 ? "Object.assign({}, source)" : "({ ...source })"};
        export const Case = <Button {...props} />;`])),
  });
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, reinsertAssign).length, 1,
    JSON.stringify(result.violations));
  assert.equal(violations(result, reinsertSpread).length, 1,
    JSON.stringify(result.violations));
});
test("product Object.assign re-queries deletion and current value", async (context) => {
  const deleted = "src/features/round37-product-current-delete.tsx";
  const replaced = "src/features/round37-product-current-value.tsx";
  const result = await run(context, {
    [deleted]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; const source = { get first() {
        delete source.later; return 1; }, get later() { props.className = "border"; return 2; } };
      Object.assign({}, source); export const Case = <Button {...props} />;`,
    [replaced]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; const source = { get first() {
        Object.defineProperty(source, "later", { enumerable: true,
          value: () => { props.className = "border"; } }); return 1; }, later: () => {} };
      const target = Object.assign({}, source); (target.later as () => void)();
      export const Case = <Button {...props} />;`,
  });
  assert.deepEqual(violations(result, deleted), [], JSON.stringify(result.violations));
  assert.equal(violations(result, replaced).length, 1, JSON.stringify(result.violations));
});
test("product Object.assign re-queries enumerable lift drop and own-only keys", async (context) => {
  const lift = "src/features/round37-product-enumerable-lift.tsx";
  const drop = "src/features/round37-product-enumerable-drop.tsx";
  const own = "src/features/round37-product-own-only.tsx";
  const result = await run(context, {
    [lift]: `import { Button } from "@/toolcraft/ui"; const props = { className: "flex" };
      const source = { get first() { Object.defineProperty(source, "later", {
        enumerable: true }); return 1; }, get later() { props.className = "border"; return 2; } };
      Object.defineProperty(source, "later", { enumerable: false }); Object.assign({}, source);
      export const Case = <Button {...props} />;`,
    [drop]: `import { Button } from "@/toolcraft/ui"; const props = { className: "flex" };
      const source = { get first() { Object.defineProperty(source, "later", {
        enumerable: false }); return 1; }, get later() { props.className = "border"; return 2; } };
      Object.assign({}, source); export const Case = <Button {...props} />;`,
    [own]: `import { Button } from "@/toolcraft/ui"; const props = { className: "flex" };
      const source = Object.create({ get inherited() { props.className = "border"; return 1; } });
      source.own = 1; Object.assign({}, source); export const Case = <Button {...props} />;`,
  });
  assert.equal(violations(result, lift).length, 1, JSON.stringify(result.violations));
  assert.deepEqual(violations(result, drop), [], JSON.stringify(result.violations));
  assert.deepEqual(violations(result, own), [], JSON.stringify(result.violations));
});
test("product distinct typed remainder getters execute sequentially", async (context) => {
  const danger = "src/features/round37-product-remainder-order.tsx";
  const safe = "src/features/round37-product-remainder-order-safe.tsx";
  const broadAssign = "src/features/round37-product-broad-assign-once.tsx";
  const broadSpread = "src/features/round37-product-broad-spread-once.tsx";
  const { alias: broadAlias, assign: broadDeleteAssign, sources: deletionSources,
    spread: broadDeleteSpread } = round37FinalReviewFixtures.broadDeletion;
  const fixture = (effect) => `import { Button } from "@/toolcraft/ui";
    declare const first: string; declare const second: string;
    const props = { className: "flex" }; let ready = false; const source: Record<string, unknown> = {};
    Object.defineProperty(source, first, { enumerable: true, get() { ready = true; return 1; } });
    Object.defineProperty(source, second, { enumerable: true, get() { ${effect} return 2; } });
    Object.assign({}, source); export const Case = <Button {...props} />;`;
  const result = await run(context, {
    [danger]: fixture('if (ready) props.className = "border";'),
    [safe]: fixture("void ready;"),
    ...Object.fromEntries([broadAssign, broadSpread].map((path, position) =>
      [path, `import { Button } from "@/toolcraft/ui"; declare const key: string;
        const props = { className: "flex" }; let reads = 0;
        const source: Record<string, unknown> = {};
        Object.defineProperty(source, key, { enumerable: true, get() {
          reads += 1; if (reads === 2) props.className = "border"; return 1; } });
        ${position === 0 ? "Object.assign({}, source)" : "({ ...source })"};
        export const Case = <Button {...props} />;`])),
    ...deletionSources,
  });
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.deepEqual(violations(result, broadAssign), [], JSON.stringify(result.violations));
  assert.deepEqual(violations(result, broadSpread), [], JSON.stringify(result.violations));
  assert.deepEqual(violations(result, broadDeleteAssign), [], JSON.stringify(result.violations));
  assert.deepEqual(violations(result, broadDeleteSpread), [], JSON.stringify(result.violations));
  assert.equal(violations(result, broadAlias).length, 1, JSON.stringify(result.violations));
});
test("product fresh symbols and exhausted worlds preserve identity without invention", async (context) => {
  const safe = "src/features/round37-product-fresh-symbol.tsx";
  const danger = "src/features/round37-product-registry-symbol.tsx";
  const { coerced, safe: coercedSafe, sources: coercionSources } =
    round37FinalReviewFixtures.registryCoercion;
  const exhausted = "src/features/round37-product-world-exhaustion.tsx";
  const cursor = "src/features/round37-product-fresh-symbol-cursor.tsx";
  const alternatives = Array.from({ length: 40 }, (_, position) =>
    `pick === ${position} ? source${position} :`).join(" ");
  const sources = Array.from({ length: 40 }, (_, position) =>
    `const source${position} = { get first() { delete source${position}.later; return 1; },
      get later() { props.className = "border"; return 2; } };`).join("\n");
  const result = await run(context, {
    [safe]: `import { Button } from "@/toolcraft/ui"; const props = { className: "flex" };
      const first = Symbol(); const second = Symbol(); const owner = {
        [first]: () => { props.className = "border"; } };
      (owner[second] as (() => void) | undefined)?.();
      export const Case = <Button {...props} />;`,
    [danger]: `import { Button } from "@/toolcraft/ui"; const props = { className: "flex" };
      const first = Symbol.for("shared"); const second = Symbol.for("shared"); const owner = {
        [first]: () => { props.className = "border"; } }; owner[second]();
      export const Case = <Button {...props} />;`,
    ...coercionSources,
    [exhausted]: `import { Button } from "@/toolcraft/ui"; declare const pick: number;
      const props = { className: "flex" }; ${sources}
      const selected = ${alternatives} source39; Object.assign({}, selected);
      export const Case = <Button {...props} />;`,
    [cursor]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; const first = Symbol(); const second = Symbol();
      const source: Record<PropertyKey, unknown> = {};
      Object.defineProperty(source, first, { enumerable: true, get() {
        delete source[second]; return 1; } });
      Object.defineProperty(source, second, { enumerable: true, get() {
        props.className = "border"; return 2; } }); Object.assign({}, source);
      export const Case = <Button {...props} />;`,
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
  assert.equal(violations(result, coerced).length, 1, JSON.stringify(result.violations));
  assert.match(violations(result, coerced)[0].message, /found: border/u);
  assert.deepEqual(violations(result, coercedSafe), [], JSON.stringify(result.violations));
  assert.deepEqual(violations(result, exhausted), [], JSON.stringify(result.violations));
  assert.deepEqual(violations(result, cursor), [], JSON.stringify(result.violations));
});
