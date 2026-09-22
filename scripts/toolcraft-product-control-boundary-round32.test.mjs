import assert from "node:assert/strict";
import test from "node:test";
import ts from "typescript";

import { toolcraftDomCallArgumentTargets } from
  "./toolcraft-dom-call-target-evidence.mjs";
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
    "round32-product.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS,
  );
  const checker = createToolcraftTypeScriptChecker(sourceFile, ts);
  return { checker, flow: createToolcraftStaticFlowValues({
    checker, resolveStaticString: () => undefined, ts,
  }), sourceFile };
}

test("product object and array callbacks retain captured host origins", async (context) => {
  const safe = "src/features/round32-product-literal-safe.tsx";
  const objectDanger = "src/features/round32-product-object-callback.tsx";
  const arrayDanger = "src/features/round32-product-array-callback.tsx";
  const prefix = `import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" };
    function make(target: typeof props) {
      return () => { target.className = "border"; }; }`;
  const suffix = `export const Case = <Button {...props} />;`;
  const result = await run(context, {
    [safe]: `${prefix} const deferred = make(props); void deferred; ${suffix}`,
    [objectDanger]: `${prefix} const owner = { run: make(props) }; owner.run(); ${suffix}`,
    [arrayDanger]: `${prefix} const items = [...[make(props)]]; items[0](); ${suffix}`,
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, objectDanger).length, 1, JSON.stringify(result.violations));
  assert.equal(violations(result, arrayDanger).length, 1, JSON.stringify(result.violations));
});

test("product literal getters and computed initializers execute once", async (context) => {
  const safe = "src/features/round32-product-getter-safe.tsx";
  const getterDanger = "src/features/round32-product-getter-capture.tsx";
  const computedDanger = "src/features/round32-product-computed-once.tsx";
  const result = await run(context, {
    [safe]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; const owner = { get value() { return 1; } };
      void owner.value; export const Case = <Button {...props} />;`,
    [getterDanger]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; function build(target: typeof props) {
        return { get run() { return () => { target.className = "border"; }; } }; }
      build(props).run(); export const Case = <Button {...props} />;`,
    [computedDanger]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; let phase = 0;
      function key() { phase += 1; return "run" as const; }
      function make() { return () => { if (phase === 1) props.className = "border"; }; }
      const owner = { [key()]: make() }; owner.run();
      export const Case = <Button {...props} />;`,
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, getterDanger).length, 1, JSON.stringify(result.violations));
  assert.equal(violations(result, computedDanger).length, 1, JSON.stringify(result.violations));
});

test("product Object.assign own call stays ordinary while canonical call stays adapter", async (context) => {
  const safe = "src/features/round32-product-assign-safe.tsx";
  const danger = "src/features/round32-product-assign-danger.tsx";
  const result = await run(context, {
    [safe]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; function authored() {}
      Object.assign(authored, { label: "safe" }); authored.call(undefined, "border");
      export const Case = <Button {...props} />;`,
    [danger]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; function authored() {}
      Object.assign(authored, { call(value: string) { props.className = value; } });
      authored.call("border"); export const Case = <Button {...props} />;`,
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
});

test("product defineProperty and unknown remainders preserve conservative adapter provenance", async (context) => {
  const safe = "src/features/round32-product-define-safe.tsx";
  const danger = "src/features/round32-product-define-danger.tsx";
  const result = await run(context, {
    [safe]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; function authored() {}
      Object.defineProperty(authored, "other", { value: 1 });
      authored.call(undefined, "border"); export const Case = <Button {...props} />;`,
    [danger]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; declare const key: "call" | "other";
      function authored() {} Object.defineProperty(authored, key, {
        value(value: string) { props.className = value; } });
      authored.call("border"); export const Case = <Button {...props} />;`,
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
});

test("partial product invocations retain exact DOM targets and exhaustion", () => {
  const { checker, flow, sourceFile } = flowFor(`declare const dom: Document;
    function erase(value: unknown) { void value; } erase(dom);`);
  const call = sourceFile.statements.at(-1).expression;
  const exact = flow.invocationsAt(call);
  const safe = toolcraftDomCallArgumentTargets({ call, checker,
    flowValues: { invocationsAt: () => exact }, ts });
  assert.equal(safe.unknownOverflow, false);
  assert.ok(safe.pairs.some(({ source }) => source.getText() === "dom"));

  const partial = toolcraftDomCallArgumentTargets({ call, checker,
    flowValues: { invocationsAt: () => ({
      evidence: [{ kind: "execution-budget", path: "branch" }],
      kind: "partial", values: exact.values,
    }) }, ts });
  assert.equal(partial.unknownOverflow, true);
  assert.ok(partial.pairs.some(({ source }) => source.getText() === "dom"));
});

test("product class definition and static effects follow specification order", async (context) => {
  const safe = "src/features/round32-product-class-safe.tsx";
  const danger = "src/features/round32-product-class-static.tsx";
  const result = await run(context, {
    [safe]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; class Plain { static value = 1; }
      void Plain; export const Case = <Button {...props} />;`,
    [danger]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; let phase = 0;
      function key(name: string) { phase += 1; return name; }
      function initialize() { if (phase === 2) props.className = "border";
        phase += 1; return phase; }
      const Active = class { static [key("first")] = initialize();
        static [key("second")] = initialize(); static {
          if (phase === 4) props.className = "border"; } }; void Active;
      export const Case = <Button {...props} />;`,
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
});

test("product constructor returns super branches and field timing preserve DOM flow", async (context) => {
  const safe = "src/features/round32-product-construction-safe.tsx";
  const danger = "src/features/round32-product-construction-danger.tsx";
  const result = await run(context, {
    [safe]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; class Base {}
      class Derived extends Base { field = (props.className = "border"); }
      void Derived; export const Case = <Button {...props} />;`,
    [danger]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; class Base {
        constructor(target: typeof props) { return { target } as never; } }
      class Derived extends Base { field = (this.target.className = "border");
        constructor(target: typeof props, choose: boolean) {
          if (choose) super(target); else super(target); } }
      new Derived(props, true); export const Case = <Button {...props} />;`,
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
});

test("product parenthesized optional chains stop later product mutations", async (context) => {
  const safe = "src/features/round32-product-optional-safe.tsx";
  const danger = "src/features/round32-product-optional-danger.tsx";
  const result = await run(context, {
    [safe]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; const missing: undefined = undefined;
      try { missing?.().run(props.className = "border"); } catch {}
      export const Case = <Button {...props} />;`,
    [danger]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; const missing: undefined = undefined;
      try { (missing?.()).run(props.className = "flex"); }
      catch { props.className = "border"; }
      export const Case = <Button {...props} />;`,
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
});
