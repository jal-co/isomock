import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

import {
  emptyState, exact, withCallable,
} from "./toolcraft-flow-facts.mjs";
import { toolcraftFlowStateKey } from "./toolcraft-flow-state-keys.mjs";
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

async function boundary(context, sources) {
  return evaluateToolcraftProductBoundary({
    rootDir: await createFixture(context, sources),
  });
}

function flowFor(source, fileName = "round32.ts") {
  const sourceFile = ts.createSourceFile(
    fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS,
  );
  const checker = createToolcraftTypeScriptChecker(sourceFile, ts);
  return { flow: createToolcraftStaticFlowValues({
    checker, resolveStaticString: () => undefined, ts,
  }), sourceFile };
}

test("object literal methods getters and closures retain captured activation", async (context) => {
  const safe = "src/features/round32-object-capture-safe.tsx";
  const danger = "src/features/round32-object-capture-danger.tsx";
  const source = (invoke) => `import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" };
    function build(target: typeof props) { return {
      run() { target.className = "border"; },
      get deferred() { return () => { target.className = "border"; }; },
    }; }
    const owner = build(props); ${invoke}
    export const Case = <Button {...props} />;`;
  const result = await boundary(context, {
    [safe]: source("void owner;"),
    [danger]: source("owner.run(); owner.deferred();"),
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
});

test("array literal closures and spreads retain evaluated child records", async (context) => {
  const safe = "src/features/round32-array-record-safe.tsx";
  const danger = "src/features/round32-array-record-danger.tsx";
  const source = (invoke) => `import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" };
    function make(target: typeof props) {
      return () => { target.className = "border"; };
    }
    const callbacks = [...[make(props)]]; ${invoke}
    export const Case = <Button {...props} />;`;
  const result = await boundary(context, {
    [safe]: source("void callbacks;"),
    [danger]: source("callbacks[0]();"),
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
});

test("literal computed keys and initializers execute once in authored order", async (context) => {
  const safe = "src/features/round32-literal-order-safe.tsx";
  const danger = "src/features/round32-literal-order-danger.tsx";
  const result = await boundary(context, {
    [safe]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; const owner = { run() {} };
      owner.run(); export const Case = <Button {...props} />;`,
    [danger]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; let order = 0;
      function key() { order += 1; return "run" as const; }
      function value() { if (order === 1) order += 1;
        return () => { props.className = "border"; }; }
      const owner = { [key()]: value() }; owner.run();
      export const Case = <Button {...props} />;`,
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
});

test("evaluated literal records never rematerialize initializer syntax", async () => {
  const expressions = await readFile(new URL(
    "./toolcraft-flow-expressions.mjs", import.meta.url), "utf8");
  assert.match(expressions, /executeExpression/u);
  const evaluated = await readFile(new URL(
    "./toolcraft-flow-evaluated-values.mjs", import.meta.url), "utf8");
  assert.match(evaluated, /EvaluatedValue|toolcraftEvaluatedValue/u);
  const literal = await readFile(new URL(
    "./toolcraft-flow-literal-values.mjs", import.meta.url), "utf8");
  assert.match(literal, /EvaluatedLiteralMember|evaluated.*member/iu);
  await assert.rejects(readFile(new URL(
    "./toolcraft-flow-literals.mjs", import.meta.url), "utf8"), { code: "ENOENT" });
  await assert.rejects(readFile(new URL(
    "./toolcraft-flow-literal-memory.mjs", import.meta.url), "utf8"), {
    code: "ENOENT",
  });
});

test("adapter provenance distinguishes present absent and unknown own properties", async (context) => {
  const safe = "src/features/round32-provenance-absent.tsx";
  const danger = "src/features/round32-provenance-unknown.tsx";
  const result = await boundary(context, {
    [safe]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; function noop(value: string) { void value; }
      noop.call(undefined, "border"); export const Case = <Button {...props} />;`,
    [danger]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; declare const choose: boolean;
      function authored() {} const extension = choose ? {
        call(value: string) { props.className = value; } } : {};
      Object.assign(authored, extension); authored.call("border");
      export const Case = <Button {...props} />;`,
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
});

test("Object.assign updates own adapter provenance without tainting unrelated keys", async (context) => {
  const safe = "src/features/round32-assign-unrelated.tsx";
  const danger = "src/features/round32-assign-own-call.tsx";
  const result = await boundary(context, {
    [safe]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; function authored() {}
      Object.assign(authored, { title: "safe" }); authored.call(undefined, "border");
      export const Case = <Button {...props} />;`,
    [danger]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; function authored() {}
      Object.assign(authored, { call(value: string) { props.className = value; } });
      authored.call("border"); export const Case = <Button {...props} />;`,
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
});

test("Object.defineProperty records exact and dynamic own-property provenance", async (context) => {
  const safe = "src/features/round32-define-unrelated.tsx";
  const exactDanger = "src/features/round32-define-call.tsx";
  const dynamicDanger = "src/features/round32-define-dynamic.tsx";
  const body = (key) => `import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" }; function authored() {}
    Object.defineProperty(authored, ${key}, { value(value: string) {
      props.className = value; } }); authored.call("border");
    export const Case = <Button {...props} />;`;
  const result = await boundary(context, {
    [safe]: body('"other"'),
    [exactDanger]: body('"call"'),
    [dynamicDanger]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; declare const key: "call" | "other";
      function authored() {} Object.defineProperty(authored, key, {
        value(value: string) { props.className = value; } });
      authored.call("border"); export const Case = <Button {...props} />;`,
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, exactDanger).length, 1, JSON.stringify(result.violations));
  assert.equal(violations(result, dynamicDanger).length, 1, JSON.stringify(result.violations));
});

test("mixed callable bases preserve ordinary and canonical adapter alternatives", async (context) => {
  const safe = "src/features/round32-mixed-own-safe.tsx";
  const danger = "src/features/round32-mixed-callable-danger.tsx";
  const result = await boundary(context, {
    [safe]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; declare const choose: boolean;
      function first() {} first.call = () => {};
      function second() {} second.call = () => {};
      const selected = choose ? first : second; selected.call(undefined, "border");
      export const Case = <Button {...props} />;`,
    [danger]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; declare const choose: boolean;
      function owned() {} owned.call = () => {};
      function mutate(value: string) { props.className = value; }
      const selected = choose ? owned : mutate;
      selected.call(undefined, "border"); export const Case = <Button {...props} />;`,
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
  const callables = await readFile(new URL(
    "./toolcraft-flow-callable-values.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(callables, /function trackedOwn/u);
  assert.match(callables, /provenance|ownPropertyProof/iu);
});

test("invocation alternatives retain known events with target-path exhaustion", () => {
  const safe = flowFor(`function target(value: unknown) { void value; }
    target(document);`);
  const safeCall = safe.sourceFile.statements.at(-1).expression;
  assert.equal(safe.flow.invocationsAt(safeCall).kind, "exact");

  const names = Array.from({ length: 2_100 }, (_, index) => `v${index}`);
  const source = `declare const choose: boolean, document: Document,
    ${names.map((name) => `${name}: number`).join(", ")};
    function target(value: unknown) { void value; }
    target(choose ? document : (${names.join(" + ")}, document));`;
  const mixed = flowFor(source);
  const call = mixed.sourceFile.statements.at(-1).expression;
  const alternatives = mixed.flow.invocationsAt(call);
  assert.equal(alternatives.kind, "partial");
  assert.ok(alternatives.values.length > 0);
  assert.ok(alternatives.evidence.length > 0);
});

test("settled invocation remains exact despite later unrelated exhaustion", async () => {
  const observer = await readFile(new URL(
    "./toolcraft-execution-observer.mjs", import.meta.url), "utf8");
  assert.match(observer, /invocationsAt/u);
  assert.doesNotMatch(observer, /summary\.overflow/u);
  assert.match(observer, /ExhaustionEvent|exhaustedPaths|coverage/iu);
});

test("class heritage and class expressions execute before member definition", async (context) => {
  const safe = "src/features/round32-class-inert.tsx";
  const declaration = "src/features/round32-class-heritage.tsx";
  const expression = "src/features/round32-class-expression.tsx";
  const active = (body) => `import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" }; function heritage() {
      props.className = "border"; return class {}; } ${body}
    export const Case = <Button {...props} />;`;
  const result = await boundary(context, {
    [safe]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; class Plain {} void Plain;
      export const Case = <Button {...props} />;`,
    [declaration]: active("class Active extends heritage() {} void Active;"),
    [expression]: active("const Active = class extends heritage() {}; void Active;"),
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, declaration).length, 1, JSON.stringify(result.violations));
  assert.equal(violations(result, expression).length, 1, JSON.stringify(result.violations));
});

test("static computed names fields and blocks execute in specification order", async (context) => {
  const safe = "src/features/round32-static-inert.tsx";
  const danger = "src/features/round32-static-order.tsx";
  const result = await boundary(context, {
    [safe]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; class Plain { static value = 1; }
      void Plain; export const Case = <Button {...props} />;`,
    [danger]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; let phase = 0;
      function key(name: string) { phase += 1; return name; }
      function initialize() { if (phase === 2) props.className = "border";
        phase += 1; return phase; }
      class Active { static [key("first")] = initialize();
        static [key("second")] = initialize();
        static { if (phase === 4) props.className = "border"; } }
      void Active; export const Case = <Button {...props} />;`,
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
});

test("instance computed keys define once and initializers run per construction", async (context) => {
  const safe = "src/features/round32-instance-deferred.tsx";
  const danger = "src/features/round32-instance-order.tsx";
  const source = (construct) => `import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" }; let keys = 0; let instances = 0;
    function key() { keys += 1; return "field" as const; }
    function initialize() { instances += 1;
      if (keys === 1 && instances === 2) props.className = "border"; return instances; }
    class Active { [key()] = initialize(); } ${construct}
    export const Case = <Button {...props} />;`;
  const result = await boundary(context, {
    [safe]: source("void Active;"),
    [danger]: source("new Active(); new Active();"),
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
});

test("base and derived constructors honor explicit object and primitive returns", async (context) => {
  const safe = "src/features/round32-constructor-primitive.tsx";
  const base = "src/features/round32-constructor-object.tsx";
  const derived = "src/features/round32-derived-object.tsx";
  const result = await boundary(context, {
    [safe]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; class Safe {
        run() {} constructor() { return 1 as never; } }
      new Safe().run(); export const Case = <Button {...props} />;`,
    [base]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; class Active { constructor() {
        return { run() { props.className = "border"; } } as never; } }
      (new Active() as unknown as { run(): void }).run();
      export const Case = <Button {...props} />;`,
    [derived]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; class Parent {}
      class Active extends Parent { constructor() { return {
        run() { props.className = "border"; } } as never; } }
      (new Active() as unknown as { run(): void }).run();
      export const Case = <Button {...props} />;`,
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, base).length, 1, JSON.stringify(result.violations));
  assert.equal(violations(result, derived).length, 1, JSON.stringify(result.violations));
});

test("super executes as an engine event through conditional try and finally paths", async (context) => {
  const safe = "src/features/round32-super-deferred.tsx";
  const conditional = "src/features/round32-super-conditional.tsx";
  const attempted = "src/features/round32-super-try.tsx";
  const source = (constructor, construct = "new Derived(true);") =>
    `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; class Base { constructor() {
        props.className = "border"; } } class Derived extends Base {
        constructor(flag: boolean) { ${constructor} } } ${construct}
      export const Case = <Button {...props} />;`;
  const result = await boundary(context, {
    [safe]: source("if (flag) super(); else super();", "void Derived;"),
    [conditional]: source("if (flag) super(); else super();"),
    [attempted]: source("try { super(); } finally { void flag; }"),
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, conditional).length, 1, JSON.stringify(result.violations));
  assert.equal(violations(result, attempted).length, 1, JSON.stringify(result.violations));
});

test("derived fields run only after successful super and default derived forwards args", async (context) => {
  const safe = "src/features/round32-super-throw-safe.tsx";
  const danger = "src/features/round32-default-derived-return.tsx";
  const result = await boundary(context, {
    [safe]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; class Base {}
      class Derived extends Base { field = (props.className = "border"); }
      void Derived; export const Case = <Button {...props} />;`,
    [danger]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; class Base { constructor(target: typeof props) {
        return { target } as never; } } class Derived extends Base {
        field = (this.target.className = "border"); }
      new Derived(props); export const Case = <Button {...props} />;`,
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
});

test("construction-plan differences survive state compaction", () => {
  const identity = ts.factory.createIdentifier("ClassIdentity");
  const fn = ts.factory.createFunctionExpression(
    undefined, undefined, undefined, undefined, [], undefined,
    ts.factory.createBlock([]),
  );
  const candidate = (classNode) => ({
    bound: [], construction: Object.freeze({ classNode, fields: [],
      derived: false, unsupported: false }), fn,
  });
  const firstNode = ts.factory.createClassExpression(
    undefined, undefined, undefined, undefined, [],
  );
  const first = withCallable(emptyState(), identity, [candidate(firstNode)]);
  const same = withCallable(emptyState(), identity, [candidate(firstNode)]);
  assert.equal(toolcraftFlowStateKey(first), toolcraftFlowStateKey(same));
  const secondNode = ts.factory.createClassExpression(
    undefined, undefined, undefined, undefined, [],
  );
  const second = withCallable(emptyState(), identity, [candidate(secondNode)]);
  assert.notEqual(toolcraftFlowStateKey(first), toolcraftFlowStateKey(second));
});

test("parenthesized optional dereferences throw before later arguments while continuous chains short-circuit", async (context) => {
  const safe = "src/features/round32-optional-continuous.tsx";
  const danger = "src/features/round32-optional-parenthesized.tsx";
  const result = await boundary(context, {
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
