import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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

async function boundary(context, sources) {
  return evaluateToolcraftProductBoundary({
    rootDir: await createFixture(context, sources),
  });
}

function flowFor(source) {
  const sourceFile = ts.createSourceFile(
    "round34.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS,
  );
  const checker = createToolcraftTypeScriptChecker(sourceFile, ts);
  return { flow: createToolcraftStaticFlowValues({
    checker, resolveStaticString: () => undefined, ts,
  }), sourceFile };
}

function namedCalls(sourceFile) {
  const calls = new Map();
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      calls.set(node.expression.text, node);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return calls;
}

function moduleFacts(source, file = "round34-owner.mjs") {
  const parsed = ts.createSourceFile(
    file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS,
  );
  const calls = [];
  const functions = new Map();
  const imports = [];
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name) functions.set(node.name.text, node);
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      imports.push(node.moduleSpecifier.text);
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      calls.push(node.expression.text);
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression)) {
      calls.push(`${node.expression.expression.text}.${node.expression.name.text}`);
    }
    ts.forEachChild(node, visit);
  }
  visit(parsed);
  return { calls, functions, imports, parsed };
}

test("class instance methods and accessors live only on the non-enumerable prototype", async (context) => {
  const safe = "src/features/round34-instance-prototype-copy.tsx";
  const danger = "src/features/round34-instance-prototype-direct.tsx";
  const source = (invoke) => `import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" }; class Owner { run() {
      props.className = "border"; } } const owner = new Owner(); ${invoke}
    export const Case = <Button {...props} />;`;
  const result = await boundary(context, {
    [safe]: source("const copy = { ...owner }; copy.run?.();"),
    [danger]: source("owner.run();"),
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
  const definitions = await readFile(new URL(
    "./toolcraft-flow-class-definitions.mjs", import.meta.url), "utf8");
  assert.match(definitions, /prototypeFact/u);
  assert.match(definitions, /enumerable:\s*false/u);
});

test("static methods and accessors are non-enumerable own class descriptors", async (context) => {
  const safe = "src/features/round34-static-method-copy.tsx";
  const danger = "src/features/round34-static-method-direct.tsx";
  const source = (invoke) => `import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" }; class Owner { static run() {
      props.className = "border"; } } ${invoke}
    export const Case = <Button {...props} />;`;
  const result = await boundary(context, {
    [safe]: source("const copy = { ...Owner }; copy.run?.();"),
    [danger]: source("Owner.run();"),
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
});

test("class getter and setter definitions merge with the original receiver", async (context) => {
  const safe = "src/features/round34-accessor-pair-inert.tsx";
  const danger = "src/features/round34-accessor-pair-receiver.tsx";
  const body = (invoke) => `import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" }; class Owner { target = props;
      get value() { return this.target.className; }
      set value(next: string) { this.target.className = next; } }
    const owner = new Owner(); ${invoke}
    export const Case = <Button {...props} />;`;
  const result = await boundary(context, {
    [safe]: body("void owner.value;"),
    [danger]: body('owner.value = "border";'),
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
});

test("duplicate class definitions use last-definition-wins", async (context) => {
  const safe = "src/features/round34-duplicate-method-safe.tsx";
  const danger = "src/features/round34-duplicate-method-danger.tsx";
  const source = (members) => `import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" }; class Owner { ${members} }
    new Owner().run(); export const Case = <Button {...props} />;`;
  const result = await boundary(context, {
    [safe]: source('run() { props.className = "border"; } run() {}'),
    [danger]: source('run() {} run() { props.className = "border"; }'),
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
});

test("fields remain enumerable own data and shadow prototype descriptors", async (context) => {
  const safe = "src/features/round34-field-shadows-prototype.tsx";
  const danger = "src/features/round34-field-enumerable-copy.tsx";
  const result = await boundary(context, {
    [safe]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; class Base { run() {
        props.className = "border"; } } class Owner extends Base { run: undefined; }
      const copy = { ...new Owner() }; copy.run?.();
      export const Case = <Button {...props} />;`,
    [danger]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; class Owner { run = () => {
        props.className = "border"; }; } const copy = { ...new Owner() };
      copy.run(); export const Case = <Button {...props} />;`,
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
  const definitions = await readFile(new URL(
    "./toolcraft-flow-class-definitions.mjs", import.meta.url), "utf8");
  assert.match(definitions, /prototypeFact/u);
  assert.match(definitions, /enumerable:\s*false/u);
});

test("descriptor enumerability applies exact ToBoolean falsy semantics", async () => {
  const operations = await readFile(new URL(
    "./toolcraft-flow-property-operations.mjs", import.meta.url), "utf8");
  const facts = moduleFacts(operations, "property-operations.mjs");
  assert.ok(facts.imports.includes("./toolcraft-flow-operators.mjs"));
  assert.ok(facts.calls.includes("createToolcraftFlowOperators"));
  const operators = await readFile(new URL(
    "./toolcraft-flow-operators.mjs", import.meta.url), "utf8");
  const operatorFacts = moduleFacts(operators, "flow-operators.mjs");
  const booleanValue = operatorFacts.functions.get("booleanValue");
  assert.ok(booleanValue);
  assert.match(booleanValue.getText(operatorFacts.parsed),
    /NaN|NullKeyword|undefined/u);
  assert.ok(operatorFacts.functions.has("truthAlternatives"));
  const copy = await readFile(new URL(
    "./toolcraft-flow-property-copy.mjs", import.meta.url), "utf8");
  assert.ok(moduleFacts(copy).functions.has("spreadValue"));
});

test("descriptor enumerability treats numeric one as truthy", async (context) => {
  const safe = "src/features/round34-enumerable-zero.tsx";
  const danger = "src/features/round34-enumerable-one.tsx";
  const source = (enumerable) => `import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" }; const owner: Record<string, unknown> = {};
    Object.defineProperty(owner, "run", { enumerable: ${enumerable}, value: () => {
      props.className = "border"; } }); const copy = { ...owner };
    (copy.run as undefined | (() => void))?.();
    export const Case = <Button {...props} />;`;
  const result = await boundary(context, {
    [safe]: source("0"), [danger]: source("1"),
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
});

test("unknown descriptor enumerability preserves copy and skip alternatives", async (context) => {
  const safe = "src/features/round34-enumerable-unknown-inert.tsx";
  const danger = "src/features/round34-enumerable-unknown-copy.tsx";
  const source = (invoke) => `import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" }; declare const flag: unknown;
    const owner: Record<string, unknown> = {}; Object.defineProperty(owner, "run", {
      enumerable: flag, value: () => { props.className = "border"; } });
    const copy = { ...owner }; ${invoke}
    export const Case = <Button {...props} />;`;
  const result = await boundary(context, {
    [safe]: source("void copy;"),
    [danger]: source("(copy.run as undefined | (() => void))?.();"),
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
});

test("symbol computed keys retain descriptor and callable provenance", async (context) => {
  const safe = "src/features/round34-symbol-inert.tsx";
  const danger = "src/features/round34-symbol-callable.tsx";
  const body = (invoke) => `import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" }; const run = Symbol("run");
    const owner = { [run]: () => { props.className = "border"; } }; ${invoke}
    export const Case = <Button {...props} />;`;
  const result = await boundary(context, {
    [safe]: body("void owner;"), [danger]: body("owner[run]();"),
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
});

test("finite computed keys branch exclusively with their callable descriptors", async (context) => {
  const safe = "src/features/round34-finite-key-exclusive.tsx";
  const danger = "src/features/round34-finite-key-danger.tsx";
  const result = await boundary(context, {
    [safe]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; declare const key: "first" | "second";
      let phase = 0; const owner: Record<string, unknown> = {};
      Object.defineProperty(owner, key, { enumerable: true, get() {
        if (key === "first") phase = 1;
        else if (phase === 1) props.className = "border"; return 1; } });
      const copy = { ...owner }; void copy;
      export const Case = <Button {...props} />;`,
    [danger]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; declare const key: "run" | "other";
      const owner: Record<string, unknown> = {}; Object.defineProperty(owner, key,
        { value: () => { props.className = "border"; } });
      (owner.run as undefined | (() => void))?.();
      export const Case = <Button {...props} />;`,
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
});

test("unbounded computed keys retain a typed callable descriptor remainder", async (context) => {
  const safe = "src/features/round34-unbounded-key-inert.tsx";
  const danger = "src/features/round34-unbounded-key-callable.tsx";
  const source = (invoke) => `import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" }; declare const key: string;
    const owner: Record<string, unknown> = {}; Object.defineProperty(owner, key,
      { value: () => { props.className = "border"; } }); ${invoke}
    export const Case = <Button {...props} />;`;
  const result = await boundary(context, {
    [safe]: source("void owner;"),
    [danger]: source("(owner.run as undefined | (() => void))?.();"),
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
});

test("exact defineProperty preserves descriptor-object remainder", async () => {
  const descriptors = await readFile(new URL(
    "./toolcraft-flow-property-descriptors.mjs", import.meta.url), "utf8");
  const facts = await readFile(new URL(
    "./toolcraft-flow-facts.mjs", import.meta.url), "utf8");
  assert.match(descriptors, /descriptor.*alternatives|alternatives.*descriptor/iu);
  assert.match(facts, /propertyRemainder/u);
  assert.doesNotMatch(facts, /unknownRemainder/u);
});

test("dynamic defineProperty preserves descriptor remainder and callable modes", async (context) => {
  const safe = "src/features/round34-dynamic-descriptor-inert.tsx";
  const danger = "src/features/round34-dynamic-descriptor-callable.tsx";
  const source = (invoke) => `import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" }; declare const key: string;
    declare const rest: Record<string, unknown>; const owner: Record<string, unknown> = {};
    const descriptor = { ...rest, get() { return () => {
      props.className = "border"; }; } }; Object.defineProperty(owner, key, descriptor);
    ${invoke} export const Case = <Button {...props} />;`;
  const result = await boundary(context, {
    [safe]: source("void owner;"),
    [danger]: source("(owner.run as undefined | (() => void))?.();"),
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
});

test("invalid mixed data and accessor descriptors throw before mutation", async (context) => {
  const safe = "src/features/round34-invalid-descriptor.tsx";
  const danger = "src/features/round34-valid-descriptor.tsx";
  const source = (descriptor) => `import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" }; const owner: Record<string, unknown> = {};
    try { Object.defineProperty(owner, "run", ${descriptor}); } catch {}
    (owner.run as undefined | (() => void))?.();
    export const Case = <Button {...props} />;`;
  const callback = '() => { props.className = "border"; }';
  const result = await boundary(context, {
    [safe]: source(`{ value: ${callback}, get() { return ${callback}; } }`),
    [danger]: source(`{ value: ${callback} }`),
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
});

test("one descriptor dispatcher preserves data accessor and absence through joins", async () => {
  const descriptors = await readFile(new URL(
    "./toolcraft-flow-property-descriptors.mjs", import.meta.url), "utf8");
  const memory = await readFile(new URL(
    "./toolcraft-flow-property-memory.mjs", import.meta.url), "utf8");
  const operations = await readFile(new URL(
    "./toolcraft-flow-property-operations.mjs", import.meta.url), "utf8");
  const joining = await readFile(new URL(
    "./toolcraft-flow-state-joining.mjs", import.meta.url), "utf8");
  const operationFacts = moduleFacts(operations);
  assert.match(descriptors, /dispatchDescriptorOutcomes/u);
  assert.match(descriptors, /absent/u);
  assert.ok(operationFacts.imports.includes("./toolcraft-flow-property-descriptors.mjs"));
  assert.ok(operationFacts.calls.includes("dispatchDescriptorOutcomes"));
  assert.ok(!moduleFacts(memory).calls.includes("dispatchDescriptorOutcomes"));
  assert.match(joining, /join.*Descriptor|descriptor.*join/iu);
  assert.doesNotMatch(memory, /function accessorsFromFact/u);
});

test("property copy branches mutually exclusive source owners", async (context) => {
  const safe = "src/features/round34-exclusive-source-owner.tsx";
  const danger = "src/features/round34-selected-source-owner.tsx";
  const result = await boundary(context, {
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
      const second = { value: 2 }; const source = choose ? first : second;
      const copy = { ...source }; void copy;
      export const Case = <Button {...props} />;`,
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
  const copy = await readFile(new URL(
    "./toolcraft-flow-property-copy.mjs", import.meta.url), "utf8");
  assert.ok(moduleFacts(copy).calls.includes("ownKeys.snapshot"));
  assert.doesNotMatch(copy,
    /for\s*\(const owner of owners\)[\s\S]{0,220}current\s*=/u);
});

test("loop caps scope partial evidence to condition body and increment", () => {
  const { flow, sourceFile } = flowFor(`function condition() { return true; }
    function body() {} function increment() {} function after() {}
    for (; condition(); increment()) { body(); } after();`);
  const calls = namedCalls(sourceFile);
  assert.equal(flow.invocationsAt(calls.get("body")).kind, "partial");
  assert.equal(flow.invocationsAt(calls.get("condition")).kind, "partial");
  assert.equal(flow.invocationsAt(calls.get("increment")).kind, "partial");
  assert.equal(flow.invocationsAt(calls.get("after")).kind, "exact");
});

test("loop cap joins post-state without setting global overflow", async () => {
  const control = await readFile(new URL(
    "./toolcraft-flow-control.mjs", import.meta.url), "utf8");
  assert.match(control, /condition.*body.*increment|scopes/isu);
  assert.match(control, /joinLoopPostStates/u);
  assert.doesNotMatch(control,
    /function exhaustLoop[\s\S]{0,500}overflow:\s*true/u);
});
