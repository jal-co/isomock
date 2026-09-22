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

test("product updates use computed accessor semantics without executing definitions", async (context) => {
  const danger = "src/features/round30-product-update.tsx";
  const safe = "src/features/round30-product-update-inert.tsx";
  const body = (operation) => `import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" }; const model = {
      get value() { return 1; }, set value(next: number) {
        props.className = next === 2 ? "border" : "flex"; } };
    ${operation} export const Case = <Button {...props} />;`;
  const result = await run(context, {
    [safe]: body("void model;"),
    [danger]: body(`const key = "value" as const; ++model[key];`),
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
});

test("product delete executes its key and not the deleted accessor", async (context) => {
  const danger = "src/features/round30-product-delete-key.tsx";
  const safe = "src/features/round30-product-delete-getter.tsx";
  const result = await run(context, {
    [safe]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; const value = {
        get current() { props.className = "border"; return 1; } };
      delete value.current; export const Case = <Button {...props} />;`,
    [danger]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; const value = { current: 1 };
      delete value[(props.className = "border", "current")];
      export const Case = <Button {...props} />;`,
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
});

test("product writes preserve their left reference through RHS rebinding", async (context) => {
  const danger = "src/features/round30-product-reference-danger.tsx";
  const safe = "src/features/round30-product-reference-safe.tsx";
  const source = (render) => `import { Button } from "@/toolcraft/ui";
    const first = { className: "flex" }, second = { className: "flex" };
    let selected = first; selected.className = (selected = second, "border"); ${render}`;
  const result = await run(context, {
    [danger]: source("export const Case = <Button {...first} />;"),
    [safe]: source("export const Case = <Button {...second} />;"),
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
});

test("product optional chains suppress every continuation effect", async (context) => {
  const danger = "src/features/round30-product-chain-active.tsx";
  const safe = "src/features/round30-product-chain-skipped.tsx";
  const result = await run(context, {
    [safe]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" };
      const missing: undefined | { nested: { run(value: string): void } } = undefined;
      missing?.nested[(props.className = "border", "run")](props.className = "border");
      export const Case = <Button {...props} />;`,
    [danger]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; const active = { nested: {
        run(value: string) { props.className = value; } } };
      active?.nested.run("border"); export const Case = <Button {...props} />;`,
  });
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
});

test("product call apply and bind use the callee evaluated before arguments", async (context) => {
  const forms = {
    call: `fn.call(undefined, (fn = safe, "border"))`,
    apply: `fn.apply(undefined, [(fn = safe, "border")])`,
    bind: `fn.bind(undefined, (fn = safe, "border"))()`,
  };
  const sources = Object.fromEntries(Object.entries(forms).map(([name, expression]) => [
    `src/features/round30-product-${name}-snapshot.tsx`,
    `import { Button } from "@/toolcraft/ui"; const props = { className: "flex" };
      function dangerous(value: string) { props.className = value; }
      function safe(value: string) { void value; } let fn = dangerous;
      ${expression}; export const Case = <Button {...props} />;`,
  ]));
  const result = await run(context, sources);
  for (const name of Object.keys(forms)) {
    const repoPath = `src/features/round30-product-${name}-snapshot.tsx`;
    assert.equal(violations(result, repoPath).length, 1,
      `${repoPath}: ${JSON.stringify(result.violations)}`);
  }
});

test("product function declarations retain separate activation captures", async (context) => {
  const danger = "src/features/round30-product-declaration-danger.tsx";
  const safe = "src/features/round30-product-declaration-safe.tsx";
  const source = (render) => `import { Button } from "@/toolcraft/ui";
    const first = { className: "flex" }, second = { className: "flex" };
    function make(target: { className: string }) {
      function mutate() { target.className = "border"; } return mutate; }
    const mutateFirst = make(first); make(second); mutateFirst(); ${render}`;
  const result = await run(context, {
    [danger]: source("export const Case = <Button {...first} />;"),
    [safe]: source("export const Case = <Button {...second} />;"),
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
});

test("product object and array rest defaults remain effectful", async (context) => {
  const danger = "src/features/round30-product-rest-danger.tsx";
  const safe = "src/features/round30-product-rest-safe.tsx";
  const source = (values) => `import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" }; let first, tail, value, rest;
    [first = (props.className = "border", 1), ...tail] = ${values.array};
    ({ value = (props.className = "border", 1), ...rest } = ${values.object});
    export const Case = <Button {...props} />;`;
  const result = await run(context, {
    [danger]: source({ array: "[]", object: "{}" }),
    [safe]: source({ array: "[null, 2]", object: "{ value: null, keep: 2 }" }),
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
});

test("product bare returns cannot inherit an earlier component return", async (context) => {
  const danger = "src/features/round30-product-return-danger.tsx";
  const safe = "src/features/round30-product-return-safe.tsx";
  const result = await run(context, {
    [danger]: `import { Button } from "@/toolcraft/ui";
      function choose() { return Button; } const Component = choose();
      export const Case = <Component className="border" />;`,
    [safe]: `import { Button } from "@/toolcraft/ui";
      function choose() { return Button; } function blank() { return; }
      choose(); const Component = blank(); export const Case = <Component className="border" />;`,
  });
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
});
