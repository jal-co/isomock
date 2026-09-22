import assert from "node:assert/strict";
import test from "node:test";
import ts from "typescript";

import { evaluateToolcraftProductBoundary } from
  "./toolcraft-product-boundary.mjs";
import { createToolcraftProductBoundaryFixture as createFixture } from
  "./toolcraft-product-boundary-test-fixtures.mjs";
import { createToolcraftStaticFlowValues } from
  "./toolcraft-static-flow-values.mjs";
import { createToolcraftTypeScriptChecker } from
  "./toolcraft-typescript-analysis.mjs";

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

function invocationKinds(source) {
  const sourceFile = ts.createSourceFile(
    "round35-product.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX,
  );
  const checker = createToolcraftTypeScriptChecker(sourceFile, ts);
  const flow = createToolcraftStaticFlowValues({
    checker, resolveStaticString: () => undefined, ts,
  });
  const kinds = new Map();
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      kinds.set(node.expression.text, flow.invocationsAt(node).kind);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return kinds;
}

test("product non-writable and missing-setter assignments remain caught and inert", async (context) => {
  const safe = "src/features/round35-product-non-writable.tsx";
  const result = await run(context, { [safe]: `import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" }; const first: Record<string, unknown> = {};
    Object.defineProperty(first, "run", { writable: false, value: () => {} });
    try { first.run = () => { props.className = "border"; }; } catch {}
    const second: Record<string, unknown> = {}; Object.defineProperty(second, "value",
      { get() { return 1; } }); try { second.value = 2; } catch {}
    (first.run as () => void)(); export const Case = <Button {...props} />;` });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
});
test("product configurable delete and redefinition preserve the frozen descriptor", async (context) => {
  const danger = "src/features/round35-product-configurable.tsx";
  const result = await run(context, { [danger]: `import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" }; const owner: Record<string, unknown> = {};
    Object.defineProperty(owner, "run", { configurable: false, writable: false,
      value: () => { props.className = "border"; } }); try { delete owner.run; } catch {}
    try { Object.defineProperty(owner, "run", { configurable: true, value: () => {} }); }
    catch {} (owner.run as () => void)(); export const Case = <Button {...props} />;` });
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
});

test("product non-callable descriptor accessors stop later descriptor effects", async (context) => {
  const safe = "src/features/round35-product-non-callable-accessor.tsx";
  const result = await run(context, { [safe]: `import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" }; const owner = {}; const descriptor = {
      get: 1, get set() { props.className = "border"; return 2; } };
    try { Object.defineProperty(owner, "value", descriptor); } catch {}
    export const Case = <Button {...props} />;` });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
});

test("product descriptor overflow retains the accessor danger mode", async (context) => {
  const danger = "src/features/round35-product-descriptor-cap.tsx";
  const branches = Array.from({ length: 8 }, (_, index) =>
    `mode === ${index} ? { configurable: ${Boolean(index & 1)},
      enumerable: ${Boolean(index & 2)}, writable: ${Boolean(index & 4)}, value: ${index} } :`
  ).join(" ");
  const result = await run(context, { [danger]: `import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" }; declare const mode: number;
    const descriptor = ${branches} { get() { return () => {
      props.className = "border"; }; } }; const owner: Record<string, unknown> = {};
    Object.defineProperty(owner, "run", descriptor);
    (owner.run as undefined | (() => void))?.();
    export const Case = <Button {...props} />;` });
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
});

test("product key overflow is precise and Symbol.for is registry stable", async (context) => {
  const omitted = "src/features/round35-product-key-seventeen.tsx";
  const unrelated = "src/features/round35-product-key-unrelated.tsx";
  const registry = "src/features/round35-product-symbol-for.tsx";
  const keys = Array.from({ length: 17 }, (_, index) => `"k${index + 1}"`).join(" | ");
  const keyed = (invoke) => `import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" }; declare const key: ${keys};
    const owner: Record<string, unknown> = {}; Object.defineProperty(owner, key,
      { value: () => { props.className = "border"; } }); ${invoke}
    export const Case = <Button {...props} />;`;
  const result = await run(context, {
    [omitted]: keyed("(owner.k17 as undefined | (() => void))?.();"),
    [unrelated]: keyed("(owner.unrelated18 as undefined | (() => void))?.();"),
    [registry]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; const first = Symbol.for("shared");
      const owner = { [first]: () => { props.className = "border"; } };
      owner[Symbol.for("shared")](); export const Case = <Button {...props} />;`,
  });
  assert.equal(violations(result, omitted).length, 1, JSON.stringify(result.violations));
  assert.deepEqual(violations(result, unrelated), [], JSON.stringify(result.violations));
  assert.equal(violations(result, registry).length, 1, JSON.stringify(result.violations));
});

test("product remainder copy honors enumerability and invokes its getter once", async (context) => {
  const safe = "src/features/round35-product-remainder-skip.tsx";
  const danger = "src/features/round35-product-remainder-get.tsx";
  const source = (descriptor, tail) => `import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" }; declare const key: string;
    const owner: Record<string, unknown> = {}; Object.defineProperty(owner, key,
      ${descriptor}); const copy = { ...owner }; ${tail}
    export const Case = <Button {...props} />;`;
  const result = await run(context, {
    [safe]: source('{ enumerable: false, value: () => { props.className = "border"; } }',
      "(copy.run as undefined | (() => void))?.();"),
    [danger]: source('{ enumerable: true, get() { props.className = "border"; return 1; } }',
      "void copy;"),
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
});

test("product for-in and for-of cap coverage includes initializer targets only", () => {
  const kinds = invocationKinds(`import { Button } from "@/toolcraft/ui";
    declare const list: Array<{}>; declare const record: Record<string, {}>;
    function bindOf() { return 1; } function bindIn() { return 1; }
    const owner: Record<string, unknown> = {}; function keyOf() { return "a"; }
    function keyIn() { return "b"; } for (const { value = bindOf() } of list) {}
    for (owner[keyOf()] of list) {} for (const { value = bindIn() } in record) {}
    for (owner[keyIn()] in record) {} function after() {} after();
    export const Case = <Button />;`);
  for (const name of ["bindOf", "bindIn", "keyOf", "keyIn"]) {
    assert.equal(kinds.get(name), "partial", name);
  }
  assert.equal(kinds.get("after"), "exact");
});

test("product NaN enumerability is an observed safe control", async (context) => {
  const safe = "src/features/round35-product-nan.tsx";
  const result = await run(context, { [safe]: `import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" }; const owner: Record<string, unknown> = {};
    Object.defineProperty(owner, "run", { enumerable: NaN, value: () => {
      props.className = "border"; } }); const copy = { ...owner };
    (copy.run as undefined | (() => void))?.(); export const Case = <Button {...props} />;` });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
});
