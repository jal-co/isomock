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
    "round33.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS,
  );
  const checker = createToolcraftTypeScriptChecker(sourceFile, ts);
  return { flow: createToolcraftStaticFlowValues({
    checker, resolveStaticString: () => undefined, ts,
  }), sourceFile };
}

test("evaluated literal members are the sole committed object and array authority", async () => {
  const evaluated = await readFile(new URL(
    "./toolcraft-flow-evaluated-values.mjs", import.meta.url), "utf8");
  assert.match(evaluated, /EvaluatedValue|toolcraftEvaluatedValue/u);
  const literal = await readFile(new URL(
    "./toolcraft-flow-literal-values.mjs", import.meta.url), "utf8");
  assert.match(literal, /evaluatedMembers/u);
  assert.doesNotMatch(literal,
    /function commitObject|properties:\s*new Map|slots:\s*\[\]/u);
  const memory = await readFile(new URL(
    "./toolcraft-flow-memory.mjs", import.meta.url), "utf8");
  assert.match(memory, /commitEvaluatedLiteral/u);
});

test("object spread gets enumerable own properties once in key order", async (context) => {
  const safe = "src/features/round33-object-spread-data.tsx";
  const danger = "src/features/round33-object-spread-get.tsx";
  const result = await boundary(context, {
    [safe]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; const source = { value: 1 };
      const copy = { ...source }; void copy;
      export const Case = <Button {...props} />;`,
    [danger]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; let order = 0;
      const source = { get first() { order += 1; return 1; },
        get second() { if (order === 1) props.className = "border"; return 2; } };
      const copy = { ...source }; void copy;
      export const Case = <Button {...props} />;`,
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
});

test("Object.assign gets enumerable own properties once in source and key order", async (context) => {
  const safe = "src/features/round33-assign-data.tsx";
  const danger = "src/features/round33-assign-get.tsx";
  const result = await boundary(context, {
    [safe]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; Object.assign({}, { value: 1 });
      export const Case = <Button {...props} />;`,
    [danger]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; let order = 0;
      const first = { get value() { order += 1; return 1; } };
      const second = { get value() { if (order === 1) props.className = "border";
        return 2; } }; Object.assign({}, first, second);
      export const Case = <Button {...props} />;`,
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
});

test("defineProperty value descriptors create exact non-enumerable own properties", async (context) => {
  const safe = "src/features/round33-define-value-non-enumerable.tsx";
  const danger = "src/features/round33-define-value-direct.tsx";
  const body = (copy) => `import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" }; const source: Record<string, unknown> = {};
    Object.defineProperty(source, "run", { value: () => {
      props.className = "border"; } }); ${copy}
    export const Case = <Button {...props} />;`;
  const result = await boundary(context, {
    [safe]: body("const copy = { ...source }; (copy.run as undefined)?.();"),
    [danger]: body("(source.run as () => void)();"),
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
});

test("defineProperty get descriptors execute captured getters once", async (context) => {
  const safe = "src/features/round33-define-get-inert.tsx";
  const danger = "src/features/round33-define-get-callable.tsx";
  const body = (invoke) => `import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" }; const owner: Record<string, unknown> = {};
    Object.defineProperty(owner, "run", { get() { return () => {
      props.className = "border"; }; } }); ${invoke}
    export const Case = <Button {...props} />;`;
  const result = await boundary(context, {
    [safe]: body("void owner;"),
    [danger]: body("(owner.run as () => void)();"),
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
});

test("defineProperty set descriptors execute captured setters once", async (context) => {
  const safe = "src/features/round33-define-set-inert.tsx";
  const danger = "src/features/round33-define-set-assign.tsx";
  const body = (invoke) => `import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" }; const owner: Record<string, unknown> = {};
    Object.defineProperty(owner, "value", { set(value: unknown) {
      if (value === "border") props.className = "border"; } }); ${invoke}
    export const Case = <Button {...props} />;`;
  const result = await boundary(context, {
    [safe]: body("void owner;"),
    [danger]: body("Object.assign(owner, { value: \"border\" });"),
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
});

test("dynamic defineProperty keys retain finite and unknown provenance", async (context) => {
  const safe = "src/features/round33-define-dynamic-inert.tsx";
  const danger = "src/features/round33-define-dynamic-get.tsx";
  const result = await boundary(context, {
    [safe]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; function owner() {}
      Object.defineProperty(owner, "other", { value: 1 });
      owner.call(undefined); export const Case = <Button {...props} />;`,
    [danger]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; declare const key: "call" | "other";
      function owner() {} Object.defineProperty(owner, key, { get() {
        return (value: string) => { props.className = value; }; } });
      owner.call("border"); export const Case = <Button {...props} />;`,
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
});

test("computed literal method and data alternatives remain correlated", async (context) => {
  const safe = "src/features/round33-computed-correlated-safe.tsx";
  const danger = "src/features/round33-computed-correlated-danger.tsx";
  const source = (invoke) => `import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" }; declare const choose: boolean;
    const owner = { [choose ? "run" : "other"]: choose
      ? () => { props.className = "border"; } : () => {} }; ${invoke}
    export const Case = <Button {...props} />;`;
  const result = await boundary(context, {
    [safe]: source("void owner;"),
    [danger]: source("owner.run?.();"),
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
});

test("abrupt literal keys and initializers stop every later child", async (context) => {
  const safe = "src/features/round33-literal-abrupt.tsx";
  const danger = "src/features/round33-literal-normal.tsx";
  const source = (key) => `import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" }; function stop(): string {
      throw new Error("stop"); } try { const owner = { [${key}]: 0,
      later: (props.className = "border") }; void owner; } catch {}
    export const Case = <Button {...props} />;`;
  const result = await boundary(context, {
    [safe]: source("stop()"),
    [danger]: source('"first"'),
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
});

test("spread invocation records consume evaluated positional shape only", async (context) => {
  const safe = "src/features/round33-call-spread-inert.tsx";
  const danger = "src/features/round33-call-spread-evaluated.tsx";
  const source = (invoke) => `import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" }; function mutate(target: typeof props) {
      target.className = "border"; } function argumentsFor() { return [props] as const; }
    ${invoke} export const Case = <Button {...props} />;`;
  const result = await boundary(context, {
    [safe]: source("void argumentsFor;"),
    [danger]: source("mutate(...argumentsFor());"),
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
});

test("derived constructors distinguish undefined object and primitive returns", async (context) => {
  const primitive = "src/features/round33-derived-primitive-throw.tsx";
  const returnedUndefined = "src/features/round33-derived-undefined-normal.tsx";
  const source = (returned) => `import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" }; class Base {} class Derived extends Base {
      constructor() { super(); return ${returned} as never; } }
    try { new Derived(); props.className = "border"; } catch {}
    export const Case = <Button {...props} />;`;
  const result = await boundary(context, {
    [primitive]: source("1"),
    [returnedUndefined]: source("undefined"),
  });
  assert.deepEqual(violations(result, primitive), [], JSON.stringify(result.violations));
  assert.equal(violations(result, returnedUndefined).length, 1,
    JSON.stringify(result.violations));
});

test("named class expressions retain a private inner binding", async (context) => {
  const safe = "src/features/round33-class-name-outer.tsx";
  const danger = "src/features/round33-class-name-inner.tsx";
  const result = await boundary(context, {
    [safe]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; const Hidden = () => {};
      const Alias = class Hidden {}; void Alias; void Hidden;
      export const Case = <Button {...props} />;`,
    [danger]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; const Alias = class Hidden {
        static run() { props.className = "border"; }
        static invoke() { Hidden.run(); } }; Alias.invoke();
      export const Case = <Button {...props} />;`,
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
});

test("class methods are installed before static fields and blocks execute", async (context) => {
  const safe = "src/features/round33-class-phase-inert.tsx";
  const danger = "src/features/round33-class-phase-method.tsx";
  const result = await boundary(context, {
    [safe]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; class Plain { static value = 1;
        static run() {} } void Plain; export const Case = <Button {...props} />;`,
    [danger]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; class Active {
        static value = Active.run(); static run() { props.className = "border"; } }
      void Active; export const Case = <Button {...props} />;`,
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
});

test("static fields and blocks execute with this bound to the class", async (context) => {
  const safe = "src/features/round33-static-this-inert.tsx";
  const danger = "src/features/round33-static-this-bound.tsx";
  const result = await boundary(context, {
    [safe]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; class Plain { static value = 1; }
      void Plain; export const Case = <Button {...props} />;`,
    [danger]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; class Active {
        static target = props; static run() { this.target.className = "border"; }
        static { this.run(); } } void Active;
      export const Case = <Button {...props} />;`,
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
});

test("external super reuses conservative evaluated callback effects", async (context) => {
  const safe = "src/features/round33-external-super-inert.tsx";
  const danger = "src/features/round33-external-super-callback.tsx";
  const result = await boundary(context, {
    [safe]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; declare class ExternalBase {
        constructor(value: number); } class Derived extends ExternalBase {
        constructor() { super(1); } } new Derived();
      export const Case = <Button {...props} />;`,
    [danger]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; declare class ExternalBase {
        constructor(callback: () => void); } class Derived extends ExternalBase {
        constructor() { super(() => { props.className = "border"; }); } }
      new Derived(); export const Case = <Button {...props} />;`,
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
});

test("fields without initializers define own undefined and shadow inherited members", async (context) => {
  const safe = "src/features/round33-empty-field-shadow.tsx";
  const danger = "src/features/round33-inherited-method.tsx";
  const body = (field) => `import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" }; class Base { run() {
      props.className = "border"; } } class Derived extends Base { ${field} }
    new Derived().run?.(); export const Case = <Button {...props} />;`;
  const result = await boundary(context, {
    [safe]: body("run: undefined;"),
    [danger]: body(""),
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
});

test("parenthesized optional call arguments run before non-callable throw", async (context) => {
  const safe = "src/features/round33-optional-continuous.tsx";
  const danger = "src/features/round33-optional-argument.tsx";
  const result = await boundary(context, {
    [safe]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; const missing: undefined = undefined;
      missing?.(props.className = "border");
      export const Case = <Button {...props} />;`,
    [danger]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; const missing: undefined = undefined;
      try { (missing?.())(props.className = "border"); } catch {}
      export const Case = <Button {...props} />;`,
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
});

test("loop caps emit target-scoped partial invocation evidence", async () => {
  const safe = flowFor(`function target(value: number) { void value; }
    target(1);`);
  const safeCall = safe.sourceFile.statements.at(-1).expression;
  assert.equal(safe.flow.invocationsAt(safeCall).kind, "exact");
  const control = await readFile(new URL(
    "./toolcraft-flow-control.mjs", import.meta.url), "utf8");
  assert.match(control, /ExhaustionEvent/u);
  assert.match(control, /loop-cap/u);
  assert.match(control, /may-revisit/u);
});
