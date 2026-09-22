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

function flowFor(source) {
  const sourceFile = ts.createSourceFile(
    "round31-product.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX,
  );
  const checker = createToolcraftTypeScriptChecker(sourceFile, ts);
  return { flow: createToolcraftStaticFlowValues({
    checker, resolveStaticString: () => undefined, ts,
  }), sourceFile };
}

test("product computed bindings execute keys and getters once", async (context) => {
  const safe = "src/features/round31-product-binding-safe.tsx";
  const danger = "src/features/round31-product-binding-danger.tsx";
  const result = await run(context, {
    [safe]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; const source = { value: 1 };
      const { value } = source; void value;
      export const Case = <Button {...props} />;`,
    [danger]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; const source = {
        get value() { props.className = "border"; return 1; } };
      const key = () => "value" as const; const { [key()]: value } = source;
      void value; export const Case = <Button {...props} />;`,
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
});

test("product computed assignments preserve getter state and object rest", async (context) => {
  const safe = "src/features/round31-product-rest-safe.tsx";
  const danger = "src/features/round31-product-rest-danger.tsx";
  const source = (pattern) => `import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" }; const source = {
      get chosen() { props.className = "border"; return 1; }, keep: 2 };
    let chosen, rest; ${pattern}; void chosen; void rest;
    export const Case = <Button {...props} />;`;
  const result = await run(context, {
    [safe]: source(`({ keep: chosen, ...rest } = source)`),
    [danger]: source(`const key = () => "chosen" as const;
      ({ [key()]: chosen, ...rest } = source)`),
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
});

test("product getter callables retain direct call apply and bind behavior", async (context) => {
  const safe = "src/features/round31-product-getter-deferred.tsx";
  const forms = {
    call: `owner.run.call(undefined, "border")`,
    apply: `owner.run.apply(undefined, ["border"])`,
    bind: `owner.run.bind(undefined, "border")()`,
  };
  const body = (invoke) => `import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" }; function mutate(value: string) {
      props.className = value; } const owner = { get run() { return mutate; } };
    ${invoke}; export const Case = <Button {...props} />;`;
  const sources = { [safe]: body(`void owner.run.bind(undefined, "border")`) };
  for (const [name, invoke] of Object.entries(forms)) {
    sources[`src/features/round31-product-getter-${name}.tsx`] = body(invoke);
  }
  const result = await run(context, sources);
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  for (const name of Object.keys(forms)) {
    const repoPath = `src/features/round31-product-getter-${name}.tsx`;
    assert.equal(violations(result, repoPath).length, 1,
      `${repoPath}: ${JSON.stringify(result.violations)}`);
  }
});

test("product own and shadowed adapters remain authored methods", async (context) => {
  const safe = "src/features/round31-product-adapter-safe.tsx";
  const danger = "src/features/round31-product-adapter-own.tsx";
  const result = await run(context, {
    [safe]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; function noop(value: string) { void value; }
      noop.call(undefined, "border"); noop.apply(undefined, ["border"]);
      export const Case = <Button {...props} />;`,
    [danger]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; function authored() { return undefined; }
      authored.call = (value: string) => { props.className = value; };
      authored.apply = (_receiver: unknown, values: string[]) => {
        props.className = values[0]; };
      authored.call("border"); authored.apply(undefined, ["border"]);
      export const Case = <Button {...props} />;`,
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
});

test("product optional-call continuations suppress later mutations", async (context) => {
  const safe = "src/features/round31-product-optional-safe.tsx";
  const danger = "src/features/round31-product-optional-danger.tsx";
  const result = await run(context, {
    [safe]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" };
      const missing: undefined | (() => { run(value: string): void }) = undefined;
      missing?.().run(props.className = "border");
      export const Case = <Button {...props} />;`,
    [danger]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; const active = () => ({
        run(value: string) { props.className = value; } });
      active?.().run("border"); export const Case = <Button {...props} />;`,
  });
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
});

test("product finally blocks preserve or override complete payloads", () => {
  const safe = flowFor(`import { Button } from "@/toolcraft/ui";
    function Safe() { return null; }
    function choose() { try { return Button; } finally { return Safe; } }
    choose();`);
  const safeFact = safe.flow.resultAt(safe.sourceFile.statements.at(-1).expression);
  assert.equal(ts.isFunctionDeclaration(safeFact.values?.[0]), true);
  const danger = flowFor(`import { Button } from "@/toolcraft/ui";
    function Safe() { return null; } function nested() { return Safe; }
    function choose() { try { return Button; } finally { nested(); } }
    choose();`);
  const dangerFact = danger.flow.resultAt(
    danger.sourceFile.statements.at(-1).expression,
  );
  assert.deepEqual(dangerFact.values?.map(({ text }) => text), ["Button"]);
});

test("product base constructor fields run before the body and only after new", async (context) => {
  const safe = "src/features/round31-product-class-safe.tsx";
  const danger = "src/features/round31-product-base-field.tsx";
  const result = await run(context, {
    [safe]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; class Deferred {
        field = (props.className = "border"); } void Deferred;
      export const Case = <Button {...props} />;`,
    [danger]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; class Active {
        field = (props.className = "border"); constructor() { void this.field; } }
      new Active(); export const Case = <Button {...props} />;`,
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
});

test("product derived and default constructors initialize fields after super", async (context) => {
  const safe = "src/features/round31-product-static-safe.tsx";
  const danger = "src/features/round31-product-derived-field.tsx";
  const result = await run(context, {
    [safe]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; class StaticOnly { static value = 1; }
      void StaticOnly; export const Case = <Button {...props} />;`,
    [danger]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; class Base { constructor() {} }
      class Derived extends Base { field = (props.className = "border"); }
      new Derived(); export const Case = <Button {...props} />;`,
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
});
