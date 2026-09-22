import assert from "node:assert/strict";
import test from "node:test";
import ts from "typescript";

import {
  emptyState, exact, objectFact, updateState, withObject,
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

function flowFor(source, fileName = "round31.ts") {
  const sourceFile = ts.createSourceFile(
    fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS,
  );
  const checker = createToolcraftTypeScriptChecker(sourceFile, ts);
  return { flow: createToolcraftStaticFlowValues({
    checker, resolveStaticString: () => undefined, ts,
  }), sourceFile };
}

test("computed object binding keys evaluate once before getter reads", async (context) => {
  const safe = "src/features/round31-binding-static.tsx";
  const danger = "src/features/round31-binding-computed.tsx";
  const result = await boundary(context, {
    [safe]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; const source = { value: 1 };
      const { value } = source; void value;
      export const Case = <Button {...props} />;`,
    [danger]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; let reads = 0;
      const source = { get value() { reads += 1; props.className = "border"; return 1; } };
      function key() { return "value" as const; }
      const { [key()]: value } = source; void value;
      export const Case = <Button {...props} />;`,
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
});

test("computed object assignment keys preserve getter state and receiver", async (context) => {
  const safe = "src/features/round31-assignment-data.tsx";
  const danger = "src/features/round31-assignment-getter.tsx";
  const source = (body) => `import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" }; let value; ${body}
    export const Case = <Button {...props} />;`;
  const result = await boundary(context, {
    [safe]: source(`({ value } = { value: 1 }); void value;`),
    [danger]: source(`const owner = { className: "border", get value() {
      props.className = this.className; return 1; } };
      ({ [("value" as const)]: value } = owner); void value;`),
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
});

test("object rest excludes the evaluated computed key per branch", async (context) => {
  const safe = "src/features/round31-rest-fixed.tsx";
  const danger = "src/features/round31-rest-computed.tsx";
  const source = (pattern) => `import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" }; const source = {
      get selected() { props.className = "border"; return 1; }, keep: 2 };
    let value, rest; ${pattern}; void value; void rest;
    export const Case = <Button {...props} />;`;
  const result = await boundary(context, {
    [safe]: source(`({ keep: value, ...rest } = source)`),
    [danger]: source(`const key = () => "selected" as const;
      ({ [key()]: value, ...rest } = source)`),
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
});

test("getter-returned callables survive canonical call", async (context) => {
  const safe = "src/features/round31-getter-direct.tsx";
  const danger = "src/features/round31-getter-call.tsx";
  const source = (invoke) => `import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" };
    function mutate(value: string) { props.className = value; }
    const owner = { get run() { return mutate; } }; ${invoke};
    export const Case = <Button {...props} />;`;
  const result = await boundary(context, {
    [safe]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; function mutate(value: string) {
        props.className = value; } mutate("border");
      export const Case = <Button {...props} />;`,
    [danger]: source(`owner.run.call(undefined, "border")`),
  });
  assert.equal(violations(result, safe).length, 1, JSON.stringify(result.violations));
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
});

test("getter-returned callables survive canonical apply", async (context) => {
  const safe = "src/features/round31-apply-direct.tsx";
  const danger = "src/features/round31-getter-apply.tsx";
  const source = (invoke) => `import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" };
    function mutate(value: string) { props.className = value; }
    const owner = { get run() { return mutate; } }; ${invoke};
    export const Case = <Button {...props} />;`;
  const result = await boundary(context, {
    [safe]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; function mutate(value: string) {
        props.className = value; } mutate("border");
      export const Case = <Button {...props} />;`,
    [danger]: source(`owner.run.apply(undefined, ["border"])`),
  });
  assert.equal(violations(result, safe).length, 1, JSON.stringify(result.violations));
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
});

test("getter-returned callables survive deferred bind", async (context) => {
  const safe = "src/features/round31-bind-deferred.tsx";
  const danger = "src/features/round31-getter-bind.tsx";
  const source = (tail) => `import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" };
    function mutate(value: string) { props.className = value; }
    const owner = { get run() { return mutate; } };
    const pending = owner.run.bind(undefined, "border"); ${tail}
    export const Case = <Button {...props} />;`;
  const result = await boundary(context, {
    [safe]: source(`void pending;`), [danger]: source(`pending();`),
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
});

test("runtime own call methods remain ordinary methods", async (context) => {
  const safe = "src/features/round31-canonical-call.tsx";
  const danger = "src/features/round31-own-call.tsx";
  const result = await boundary(context, {
    [safe]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; function noop(value: string) { void value; }
      noop.call(undefined, "border"); export const Case = <Button {...props} />;`,
    [danger]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; function authored() { return undefined; }
      authored.call = function own(value: string) { props.className = value; };
      authored.call("border"); export const Case = <Button {...props} />;`,
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
});

test("typed shadowed apply and bind methods remain ordinary methods", async (context) => {
  const safe = "src/features/round31-canonical-adapters.tsx";
  const danger = "src/features/round31-shadowed-adapters.tsx";
  const result = await boundary(context, {
    [safe]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; function noop(value: string) { void value; }
      noop.apply(undefined, ["border"]); void noop.bind(undefined, "border");
      export const Case = <Button {...props} />;`,
    [danger]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; function authored() { return undefined; }
      authored.apply = function own(_receiver: unknown, values: string[]) {
        props.className = values[0]; };
      authored.bind = function ownBind(_receiver: unknown, value: string) {
        return () => { props.className = value; }; };
      authored.apply(undefined, ["border"]); authored.bind(undefined, "border")();
      export const Case = <Button {...props} />;`,
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
});

test("optional calls propagate short circuit through every continuation", async (context) => {
  const safe = "src/features/round31-optional-call-skipped.tsx";
  const danger = "src/features/round31-optional-call-active.tsx";
  const result = await boundary(context, {
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

test("invocation queries distinguish exact empty from typed exhaustion", () => {
  const unreachable = flowFor(`function stop() { return; noop(); }
    function noop() { return; }`).sourceFile.statements[0].body.statements[1].expression;
  const safeFlow = flowFor(`function stop() { return; noop(); }
    function noop() { return; }`).flow;
  const safe = safeFlow.invocationsAt(unreachable);
  assert.ok(Array.isArray(safe) || safe.kind === "exact");

  const terms = Array.from({ length: 2_100 }, (_, index) => `v${index}`).join(" + ");
  const { flow, sourceFile } = flowFor(`declare const ${Array.from(
    { length: 2_100 }, (_, index) => `v${index}: number`,
  ).join(", ")}; function target(value: unknown) { void value; }
    ${terms}; target(document);`);
  const call = sourceFile.statements.at(-1).expression;
  const exhausted = flow.invocationsAt(call);
  assert.equal(exhausted.kind, "exhausted");
});

test("state identity distinguishes equal node offsets across source files", () => {
  const firstNode = ts.createSourceFile("first.ts", "value", ts.ScriptTarget.Latest,
    true, ts.ScriptKind.TS).statements[0].expression;
  const secondNode = ts.createSourceFile("second.ts", "value", ts.ScriptTarget.Latest,
    true, ts.ScriptKind.TS).statements[0].expression;
  const fact = exact([ts.factory.createStringLiteral("x")]);
  const first = withObject(emptyState(), firstNode, objectFact(new Map([["x", fact]])));
  assert.equal(toolcraftFlowStateKey(first), toolcraftFlowStateKey(updateState(first, {})));
  const second = withObject(emptyState(), secondNode, objectFact(new Map([["x", fact]])));
  assert.notEqual(toolcraftFlowStateKey(first), toolcraftFlowStateKey(second));
});

test("state identity distinguishes same-name symbols and escaped keys", () => {
  const cell = Object.freeze({ id: 7 });
  const fact = exact([ts.factory.createStringLiteral("value")]);
  const symbolFor = () => ({ getName: () => "same" });
  const stateFor = (symbol, key) => updateState(emptyState(), {
    cells: new Map([[cell, fact]]), environment: new Map([[symbol, cell]]),
    objects: new Map([[ts.factory.createIdentifier("owner"),
      objectFact(new Map([[key, fact]]))]]),
  });
  const firstSymbol = symbolFor();
  const first = stateFor(firstSymbol, "a=b;c");
  assert.equal(toolcraftFlowStateKey(first), toolcraftFlowStateKey(first));
  const second = stateFor(symbolFor(), "a=b;c");
  assert.notEqual(toolcraftFlowStateKey(first), toolcraftFlowStateKey(second));
});

test("finally resumes the complete return throw and label payload", () => {
  const safe = flowFor(`function choose() { try { return 1; } finally {} }
    choose();`);
  const safeFact = safe.flow.resultAt(safe.sourceFile.statements.at(-1).expression);
  assert.deepEqual(safeFact.values?.map(({ text }) => text), ["1"]);
  const danger = flowFor(`function nested() { return 2; }
    function choose() { try { return 1; } finally { nested(); } }
    choose();`);
  const dangerFact = danger.flow.resultAt(
    danger.sourceFile.statements.at(-1).expression,
  );
  assert.deepEqual(dangerFact.values?.map(({ text }) => text), ["1"]);
});

test("constructors execute base derived and default instance fields in language order", async (context) => {
  const safe = "src/features/round31-class-declaration.tsx";
  const danger = "src/features/round31-constructor-fields.tsx";
  const result = await boundary(context, {
    [safe]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; class Deferred {
        field = (props.className = "border"); } void Deferred;
      export const Case = <Button {...props} />;`,
    [danger]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; class Base {
        field = (props.className = "border"); constructor() { void this.field; } }
      class Derived extends Base { derived = props.className; }
      new Derived(); export const Case = <Button {...props} />;`,
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
});
