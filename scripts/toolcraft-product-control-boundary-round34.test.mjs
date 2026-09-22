import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

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

function callsCanonicalEnumeration(source) {
  const parsed = ts.createSourceFile(
    "round34-product-owner.mjs", source, ts.ScriptTarget.Latest, true,
    ts.ScriptKind.JS,
  );
  let found = false;
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === "ownKeys" &&
      node.expression.name.text === "snapshot") found = true;
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  return found;
}

test("product class prototype members stay non-enumerable while direct access remains observable", async (context) => {
  const safe = "src/features/round34-product-prototype-copy.tsx";
  const danger = "src/features/round34-product-prototype-direct.tsx";
  const source = (invoke) => `import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" }; class Owner { run() {
      props.className = "border"; } } const owner = new Owner(); ${invoke}
    export const Case = <Button {...props} />;`;
  const result = await run(context, {
    [safe]: source("const copy = { ...owner }; copy.run?.();"),
    [danger]: source("owner.run();"),
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
});

test("product accessor pairs merge and duplicate members use the last definition", async (context) => {
  const safe = "src/features/round34-product-duplicate-safe.tsx";
  const accessor = "src/features/round34-product-accessor-pair.tsx";
  const result = await run(context, {
    [safe]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; class Owner {
        run() { props.className = "border"; } run() {} } new Owner().run();
      export const Case = <Button {...props} />;`,
    [accessor]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; class Owner { target = props;
        get value() { return this.target.className; }
        set value(next: string) { this.target.className = next; } }
      new Owner().value = "border";
      export const Case = <Button {...props} />;`,
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, accessor).length, 1, JSON.stringify(result.violations));
});

test("product property copy honors falsy truthy and unknown enumerability", async (context) => {
  const safe = "src/features/round34-product-enumerable-zero.tsx";
  const truthy = "src/features/round34-product-enumerable-one.tsx";
  const unknown = "src/features/round34-product-enumerable-unknown.tsx";
  const source = (enumerable, invoke = true) => `import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" }; const owner: Record<string, unknown> = {};
    Object.defineProperty(owner, "run", { enumerable: ${enumerable}, value: () => {
      props.className = "border"; } }); const copy = { ...owner };
    ${invoke ? '(copy.run as undefined | (() => void))?.();' : "void copy;"}
    export const Case = <Button {...props} />;`;
  const result = await run(context, {
    [safe]: source("0"), [truthy]: source("1"),
    [unknown]: source("flag", true).replace(
      "const owner", "declare const flag: unknown; const owner",
    ),
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, truthy).length, 1, JSON.stringify(result.violations));
  assert.equal(violations(result, unknown).length, 1, JSON.stringify(result.violations));
});

test("product symbol computed descriptors retain callable DOM effects", async (context) => {
  const safe = "src/features/round34-product-symbol-inert.tsx";
  const danger = "src/features/round34-product-symbol-callable.tsx";
  const source = (invoke) => `import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" }; const run = Symbol("run");
    const owner = { [run]: () => { props.className = "border"; } }; ${invoke}
    export const Case = <Button {...props} />;`;
  const result = await run(context, {
    [safe]: source("void owner;"), [danger]: source("owner[run]();"),
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
});

test("product finite and unbounded defineProperty keys preserve callable descriptor remainder", async (context) => {
  const safe = "src/features/round34-product-dynamic-inert.tsx";
  const finite = "src/features/round34-product-finite-callable.tsx";
  const unbounded = "src/features/round34-product-unbounded-callable.tsx";
  const source = (keyType, invoke) => `import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" }; declare const key: ${keyType};
    const owner: Record<string, unknown> = {}; Object.defineProperty(owner, key,
      { value: () => { props.className = "border"; } }); ${invoke}
    export const Case = <Button {...props} />;`;
  const result = await run(context, {
    [safe]: source("string", "void owner;"),
    [finite]: source('"run" | "other"',
      "(owner.run as undefined | (() => void))?.();"),
    [unbounded]: source("string",
      "(owner.run as undefined | (() => void))?.();"),
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, finite).length, 1, JSON.stringify(result.violations));
  assert.equal(violations(result, unbounded).length, 1, JSON.stringify(result.violations));
});

test("product invalid mixed descriptors complete abruptly before later mutation", async (context) => {
  const safe = "src/features/round34-product-invalid-descriptor.tsx";
  const danger = "src/features/round34-product-valid-descriptor.tsx";
  const callback = '() => { props.className = "border"; }';
  const source = (descriptor) => `import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" }; const owner: Record<string, unknown> = {};
    try { Object.defineProperty(owner, "run", ${descriptor}); } catch {}
    (owner.run as undefined | (() => void))?.();
    export const Case = <Button {...props} />;`;
  const result = await run(context, {
    [safe]: source(`{ value: ${callback}, get() { return ${callback}; } }`),
    [danger]: source(`{ value: ${callback} }`),
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
});

test("product source-owner alternatives never serialize an impossible getter world", async (context) => {
  const safe = "src/features/round34-product-exclusive-owner.tsx";
  const danger = "src/features/round34-product-selected-getter.tsx";
  const result = await run(context, {
    [safe]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; declare const choose: boolean; let phase = 0;
      const first = { get value() { phase = 1; return 1; } };
      const second = { get value() { if (phase === 1) props.className = "border";
        return 2; } }; const source = choose ? first : second;
      const copy = { ...source }; void copy;
      export const Case = <Button {...props} />;`,
    [danger]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; declare const choose: boolean;
      const first = { get value() { props.className = "border"; return 1; } };
      const source = choose ? first : { value: 2 }; const copy = { ...source };
      void copy; export const Case = <Button {...props} />;`,
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
  const copy = await readFile(new URL(
    "./toolcraft-flow-property-copy.mjs", import.meta.url), "utf8");
  assert.equal(callsCanonicalEnumeration(copy), true);
  assert.doesNotMatch(copy,
    /for\s*\(const owner of owners\)[\s\S]{0,220}current\s*=/u);
});

test("product loop exhaustion stays scoped while later calls remain exact", async (context) => {
  const safe = "src/features/round34-product-loop-post-safe.tsx";
  const danger = "src/features/round34-product-loop-body-danger.tsx";
  const result = await run(context, {
    [safe]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; function check() { return true; }
      function tick() {} for (; check(); tick()) {} function after() {}
      after(); export const Case = <Button {...props} />;`,
    [danger]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; function check() { return true; }
      function tick() {} function mutate() { props.className = "border"; }
      for (; check(); tick()) { mutate(); }
      export const Case = <Button {...props} />;`,
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
});
