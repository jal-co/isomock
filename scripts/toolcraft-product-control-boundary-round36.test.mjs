import assert from "node:assert/strict";
import test from "node:test";

import { evaluateToolcraftProductBoundary } from
  "./toolcraft-product-boundary.mjs";
import { createToolcraftProductBoundaryFixture as createFixture } from
  "./toolcraft-product-boundary-test-fixtures.mjs";

function violations(result, repoPath) {
  return result.violations.filter((violation) =>
    violation.repoPath === repoPath && violation.kind === "public-component-chrome"
  );
}

async function run(context, sources) {
  return evaluateToolcraftProductBoundary({
    rootDir: await createFixture(context, sources),
  });
}

function conditionalSources(dangerIndex) {
  return Array.from({ length: 40 }, (_, index) => ({ index, danger: index === dangerIndex }))
    .reduceRight((tail, { index, danger }) =>
      `pick === ${index} ? { get run() { ${danger ?
        'props.className = "border";' : "void props.className;"} return ${index}; } } : ${tail}`,
    "{}",
    );
}

test("product descriptor omissions and empty patches preserve existing fields", async (context) => {
  const danger = "src/features/round36-product-descriptor-omission.tsx";
  const safe = "src/features/round36-product-descriptor-empty-safe.tsx";
  const source = (effect) => `import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" }; const owner: Record<string, unknown> = {};
    Object.defineProperty(owner, "run", { configurable: true, value: () => { ${effect} } });
    Object.defineProperty(owner, "run", {}); Object.defineProperty(owner, "run", { enumerable: true });
    (owner.run as () => void)(); export const Case = <Button {...props} />;`;
  const result = await run(context, {
    [danger]: source('props.className = "border";'),
    [safe]: source("void props.className;"),
  });
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
});

test("product frozen data and accessor properties reject incompatible replacements", async (context) => {
  const data = "src/features/round36-product-frozen-data.tsx";
  const accessor = "src/features/round36-product-frozen-accessor.tsx";
  const source = (descriptor, replacement) => `import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" }; const owner: Record<string, unknown> = {};
    Object.defineProperty(owner, "run", ${descriptor});
    try { Object.defineProperty(owner, "run", ${replacement}); } catch {}
    (owner.run as () => void)(); export const Case = <Button {...props} />;`;
  const safe = "() => { void props.className; }";
  const danger = '() => { props.className = "border"; }';
  const result = await run(context, {
    [data]: source(`{ configurable: false, writable: false, value: ${safe} }`,
      `{ value: ${danger} }`),
    [accessor]: source(`{ configurable: false, get: ${safe} }`, `{ get: ${danger} }`),
  });
  assert.deepEqual(violations(result, data), [], JSON.stringify(result.violations));
  assert.deepEqual(violations(result, accessor), [], JSON.stringify(result.violations));
});

test("product unknown descriptor flags retain the incompatible world", async (context) => {
  const danger = "src/features/round36-product-unknown-configurable.tsx";
  const safe = "src/features/round36-product-unknown-configurable-safe.tsx";
  const source = (initial) => `import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" }; declare const flag: boolean;
    const owner: Record<string, unknown> = {}; Object.defineProperty(owner, "run",
      { configurable: flag, writable: false, value: ${initial} });
    try { Object.defineProperty(owner, "run", { value: () => {} }); } catch {}
    (owner.run as () => void)(); export const Case = <Button {...props} />;`;
  const result = await run(context, {
    [danger]: source('() => { props.className = "border"; }'),
    [safe]: source("() => { void props.className; }"),
  });
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
});

test("product Symbol.for consumes evaluated const and cross-file strings but not shadows", async (context) => {
  const local = "src/features/round36-product-symbol-local.tsx";
  const imported = "src/features/round36-product-symbol-import.tsx";
  const shadowed = "src/features/round36-product-symbol-shadowed.tsx";
  const support = "src/lib/round36-shared-symbol-key.ts";
  const result = await run(context, {
    [support]: 'export const shared = "round36-shared" as const;',
    [local]: `import { Button } from "@/toolcraft/ui"; const key = "round36-local" as const;
      const props = { className: "flex" }; const owner = { [Symbol.for(key)]: () => {
        props.className = "border"; } }; owner[Symbol.for(key)]();
      export const Case = <Button {...props} />;`,
    [imported]: `import { Button } from "@/toolcraft/ui"; import { shared } from "../lib/round36-shared-symbol-key";
      const props = { className: "flex" }; const owner = { [Symbol.for(shared)]: () => {
        props.className = "border"; } }; owner[Symbol.for(shared)]();
      export const Case = <Button {...props} />;`,
    [shadowed]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; const Symbol = { for: (_key: string) => globalThis.Symbol() };
      const owner = { [Symbol.for("shared")]: () => { props.className = "border"; } };
      owner[Symbol.for("shared")]?.(); export const Case = <Button {...props} />;`,
  });
  assert.equal(violations(result, local).length, 1, JSON.stringify(result.violations));
  assert.equal(violations(result, imported).length, 1, JSON.stringify(result.violations));
  assert.deepEqual(violations(result, shadowed), [], JSON.stringify(result.violations));
});

test("product Object.assign interleaves source Get with target Set", async (context) => {
  const danger = "src/features/round36-product-assign-interleave.tsx";
  const safe = "src/features/round36-product-assign-interleave-safe.tsx";
  const source = (later) => `import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" }; let ready = false;
    const target = { set first(_value: number) { ready = true; } };
    const source = { get first() { return 1; }, get second() { ${later} return 2; } };
    Object.assign(target, source); export const Case = <Button {...props} />;`;
  const result = await run(context, {
    [danger]: source('if (ready) props.className = "border";'),
    [safe]: source("void ready;"),
  });
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
});

test("product Object.assign target throws suppress later getters and sources", async (context) => {
  const safe = "src/features/round36-product-assign-abrupt.tsx";
  const danger = "src/features/round36-product-assign-abrupt-control.tsx";
  const source = (writable) => `import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" }; const target: Record<string, unknown> = {};
    Object.defineProperty(target, "first", { writable: ${writable}, value: 0 });
    const source = { first: 1, get later() { props.className = "border"; return 2; } };
    const final = { get last() { props.className = "border"; return 3; } };
    try { Object.assign(target, source, final); } catch {}
    export const Case = <Button {...props} />;`;
  const result = await run(context, { [safe]: source("false"), [danger]: source("true") });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
});

test("product SameValue accepts NaN but distinguishes positive and negative zero", async (context) => {
  const danger = "src/features/round36-product-same-value-zero.tsx";
  const safe = "src/features/round36-product-same-value-nan.tsx";
  const source = (first, second) => `import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" }; const owner = {};
    Object.defineProperty(owner, "value", { value: ${first} });
    try { Object.defineProperty(owner, "value", { value: ${second} }); }
    catch { props.className = "border"; }
    export const Case = <Button {...props} />;`;
  const result = await run(context, {
    [danger]: source("+0", "-0"), [safe]: source("NaN", "NaN"),
  });
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
});

test("product copy overflow keeps danger at first middle and last positions without inventing one", async (context) => {
  const paths = ["first", "middle", "last"].map((label) =>
    `src/features/round36-product-copy-cap-${label}.tsx`);
  const safe = "src/features/round36-product-copy-cap-safe.tsx";
  const fixture = (dangerIndex) => `import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" }; declare const pick: number;
    const source = ${conditionalSources(dangerIndex)}; Object.assign({}, source);
    export const Case = <Button {...props} />;`;
  const result = await run(context, {
    [paths[0]]: fixture(0), [paths[1]]: fixture(20), [paths[2]]: fixture(39),
    [safe]: fixture(-1),
  });
  for (const path of paths) {
    assert.equal(violations(result, path).length, 1, `${path}: ${JSON.stringify(result.violations)}`);
  }
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
});

test("shadowed globalThis Symbol remains an ordinary evaluated callable", async (context) => {
  const danger = "src/features/round36-shadowed-global-this-symbol.tsx";
  const result = await run(context, { [danger]: `import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" };
    const globalThis = { Symbol: () => () => { props.className = "border"; } };
    globalThis.Symbol()(); export const Case = <Button {...props} />;` });
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
});
