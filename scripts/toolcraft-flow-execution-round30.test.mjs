import assert from "node:assert/strict";
import test from "node:test";
import ts from "typescript";

import { createToolcraftExecutionBudget } from
  "./toolcraft-execution-budget.mjs";
import { createToolcraftExecutionObserver } from
  "./toolcraft-execution-observer.mjs";
import {
  emptyState, exact, objectFact, updateState, withCallable, withObject,
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

function flowFor(source) {
  const sourceFile = ts.createSourceFile(
    "round30.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS,
  );
  const checker = createToolcraftTypeScriptChecker(sourceFile, ts);
  return { flow: createToolcraftStaticFlowValues({
    checker, resolveStaticString: () => undefined, ts,
  }), sourceFile };
}

test("prefix update evaluates a computed reference once and invokes its setter", async (context) => {
  const repoPath = "src/features/round30-prefix-update.tsx";
  const result = await boundary(context, { [repoPath]: `
    import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" };
    const model = { get value() { return 1; },
      set value(next: number) { props.className = next === 2 ? "border" : "flex"; } };
    function base() { return model; } function key() { return "value" as const; }
    ++base()[key()]; export const Case = <Button {...props} />;
  ` });
  assert.equal(violations(result, repoPath).length, 1, JSON.stringify(result.violations));
});

test("postfix update returns the old fact and writes the incremented fact", async (context) => {
  const repoPath = "src/features/round30-postfix-update.tsx";
  const result = await boundary(context, { [repoPath]: `
    import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" }; let stored = 1;
    const model = { get value() { return stored; }, set value(next: number) {
      stored = next; props.className = next === 2 ? "border" : "flex"; } };
    const previous = model.value++; if (previous !== 1) props.className = "flex";
    export const Case = <Button {...props} />;
  ` });
  assert.equal(violations(result, repoPath).length, 1, JSON.stringify(result.violations));
});

test("delete evaluates its computed key but invokes neither getter nor setter", async (context) => {
  const danger = "src/features/round30-delete-key.tsx";
  const safe = "src/features/round30-delete-accessor.tsx";
  const result = await boundary(context, {
    [safe]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; const model = {
        get value() { props.className = "border"; return 1; },
        set value(next: number) { props.className = "border"; } };
      delete model.value; export const Safe = <Button {...props} />;`,
    [danger]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; const model = { value: 1 };
      delete model[(props.className = "border", "value")];
      export const Danger = <Button {...props} />;`,
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
});

test("simple assignment preserves its evaluated reference through RHS effects", async (context) => {
  const first = "src/features/round30-reference-first.tsx";
  const second = "src/features/round30-reference-second.tsx";
  const source = (render) => `import { Button } from "@/toolcraft/ui";
    const first = { className: "flex" }, second = { className: "flex" };
    let current = first; current.className = (current = second, "border"); ${render}`;
  const result = await boundary(context, {
    [first]: source("export const Case = <Button {...first} />;"),
    [second]: source("export const Case = <Button {...second} />;"),
  });
  assert.deepEqual(violations(result, second), [], JSON.stringify(result.violations));
  assert.equal(violations(result, first).length, 1, JSON.stringify(result.violations));
});

test("compound and logical assignments retain the same ReferenceFact", async (context) => {
  const first = "src/features/round30-reference-compound.tsx";
  const second = "src/features/round30-reference-logical.tsx";
  const result = await boundary(context, {
    [first]: `import { Button } from "@/toolcraft/ui";
      const first = { className: "flex" }, second = { className: "flex" };
      let current = first; current.className += (current = second, " border");
      export const Case = <Button {...first} />;`,
    [second]: `import { Button } from "@/toolcraft/ui";
      const first = { className: "present" }, second = { className: "flex" };
      let current = first; current.className ||= (current = second, "border");
      export const Case = <Button {...second} />;`,
  });
  assert.deepEqual(violations(result, second), [], JSON.stringify(result.violations));
  assert.equal(violations(result, first).length, 1, JSON.stringify(result.violations));
});

test("optional short circuit propagates through property element and call segments", async (context) => {
  const repoPath = "src/features/round30-optional-continuation.tsx";
  const result = await boundary(context, { [repoPath]: `
    import { Button } from "@/toolcraft/ui"; const props = { className: "flex" };
    const missing: undefined | { nested: { run(value: string): void } } = undefined;
    missing?.nested[(props.className = "border", "run")](
      props.className = "border"); export const Safe = <Button {...props} />;
  ` });
  assert.deepEqual(violations(result, repoPath), [], JSON.stringify(result.violations));
});

test("optional chain completion clears at a non-chain expression boundary", async (context) => {
  const safe = "src/features/round30-chain-safe.tsx";
  const danger = "src/features/round30-chain-boundary.tsx";
  const result = await boundary(context, {
    [danger]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; const missing: undefined = undefined;
      (missing?.value, props.className = "border");
      export const Case = <Button {...props} />;`,
    [safe]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; const missing: undefined = undefined;
      missing?.value[(props.className = "border", "next")];
      export const Case = <Button {...props} />;`,
  });
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
});

test("direct and method calls expose immutable canonical invocation events", () => {
  const { flow, sourceFile } = flowFor(`
    function direct(value: string) { return value; }
    const owner = { method(value: string) { return value; } };
    direct("a"); owner.method("b");
  `);
  for (const statement of sourceFile.statements.slice(-2)) {
    const call = statement.expression;
    const fact = flow.invocationsAt(call);
    assert.equal(fact.kind, "exact");
    assert.equal(fact.values[0].kind, "invocation");
    assert.equal(fact.values[0].call, call);
    assert.ok(Object.isFrozen(fact.values[0]));
  }
});

test("call and apply retain the pre-evaluated callable across argument effects", async (context) => {
  const callPath = "src/features/round30-call-snapshot.tsx";
  const applyPath = "src/features/round30-apply-snapshot.tsx";
  const source = (invoke) => `import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" };
    function dangerous(value: string) { props.className = value; }
    function safe(value: string) { void value; } let fn = dangerous;
    ${invoke}; export const Case = <Button {...props} />;`;
  const result = await boundary(context, {
    [callPath]: source(`fn.call(undefined, (fn = safe, "border"))`),
    [applyPath]: source(`fn.apply(undefined, [(fn = safe, "border")])`),
  });
  assert.equal(violations(result, callPath).length, 1, JSON.stringify(result.violations));
  assert.equal(violations(result, applyPath).length, 1, JSON.stringify(result.violations));
});

test("spread arguments retain their pre-evaluated positional shape", async (context) => {
  const firstPath = "src/features/round30-spread-snapshot-first.tsx";
  const secondPath = "src/features/round30-spread-snapshot-second.tsx";
  const source = (render) => `import { Button } from "@/toolcraft/ui";
    const first = { className: "flex" }, second = { className: "flex" };
    const values = [first];
    function mutate(target: { className: string }) { target.className = "border"; }
    function replace() { values[0] = second; return undefined; }
    mutate(...values, replace()); ${render}`;
  const result = await boundary(context, {
    [firstPath]: source("export const Case = <Button {...first} />;"),
    [secondPath]: source("export const Case = <Button {...second} />;"),
  });
  assert.deepEqual(violations(result, secondPath), [], JSON.stringify(result.violations));
  assert.equal(violations(result, firstPath).length, 1, JSON.stringify(result.violations));
});

test("bind captures callable this and arguments before later invocation", async (context) => {
  const danger = "src/features/round30-bind-snapshot.tsx";
  const safe = "src/features/round30-bind-deferred.tsx";
  const result = await boundary(context, {
    [safe]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; function mutate(this: typeof props,
      value: string) { this.className = value; } const pending = mutate.bind(props, "border");
      void pending; export const Case = <Button {...props} />;`,
    [danger]: `import { Button } from "@/toolcraft/ui";
      const target = { className: "flex" }, other = { className: "flex" };
      function dangerous(this: typeof target, value: string) { this.className = value; }
      function safe(this: typeof target, value: string) { void value; }
      let fn = dangerous; const pending = fn.bind(target, (fn = safe, "border"));
      pending.call(other); export const Case = <Button {...target} />;`,
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
});

test("function declarations capture a fresh activation environment", async (context) => {
  const first = "src/features/round30-declaration-first.tsx";
  const second = "src/features/round30-declaration-second.tsx";
  const source = (render) => `import { Button } from "@/toolcraft/ui";
    const first = { className: "flex" }, second = { className: "flex" };
    function make(target: { className: string }) {
      function mutate() { target.className = "border"; } return mutate; }
    const mutateFirst = make(first); make(second); mutateFirst(); ${render}`;
  const result = await boundary(context, {
    [first]: source("export const Case = <Button {...first} />;"),
    [second]: source("export const Case = <Button {...second} />;"),
  });
  assert.deepEqual(violations(result, second), [], JSON.stringify(result.violations));
  assert.equal(violations(result, first).length, 1, JSON.stringify(result.violations));
});

test("array rest patterns execute defaults only for missing or undefined", async (context) => {
  const danger = "src/features/round30-array-rest-default.tsx";
  const safe = "src/features/round30-array-rest-supplied.tsx";
  const source = (input) => `import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" }; let value, tail;
    [value = (props.className = "border", 1), ...tail] = ${input};
    export const Case = <Button {...props} />;`;
  const result = await boundary(context, {
    [danger]: source("[]"), [safe]: source("[null, 2]"),
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
});

test("object rest patterns execute defaults only for missing or undefined", async (context) => {
  const danger = "src/features/round30-object-rest-default.tsx";
  const safe = "src/features/round30-object-rest-supplied.tsx";
  const source = (input) => `import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" }; let value, rest;
    ({ value = (props.className = "border", 1), ...rest } = ${input});
    export const Case = <Button {...props} />;`;
  const result = await boundary(context, {
    [danger]: source("{}"), [safe]: source("{ value: null, keep: 2 }"),
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
});

test("bare return clears a nested stale returnFact", async (context) => {
  const safe = "src/features/round30-bare-return.tsx";
  const danger = "src/features/round30-explicit-return.tsx";
  const result = await boundary(context, {
    [safe]: `import { Button } from "@/toolcraft/ui";
      function prior() { return Button; } function blank() { return; }
      prior(); const Component = blank(); export const Case = <Component className="border" />;`,
    [danger]: `import { Button } from "@/toolcraft/ui";
      function choose() { return Button; } const Component = choose();
      export const Case = <Component className="border" />;`,
  });
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
});

test("every public observer query resets its budget once including cache hits", () => {
  const sourceFile = ts.createSourceFile("query.ts", "void value;",
    ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const target = sourceFile.statements[0].expression.expression;
  const state = emptyState(); let activeObserver; let resets = 0;
  const observer = createToolcraftExecutionObserver({
    index: { unwrap: (node) => node }, memory: { patterns: { assign: () => state } },
    reset() { resets += 1; }, runExpression: () => [], runStatement: () => [state],
    runStatements() { activeObserver?.(target, state); return [state]; },
    setObserver(value) { activeObserver = value; }, ts,
  });
  observer.statesBefore(target); observer.statesBefore(target);
  assert.equal(resets, 2);
});

test("argument products admit 32 alternatives and reject 33 before expansion", () => {
  const budget = createToolcraftExecutionBudget();
  assert.equal(budget.product(4, 8, 32), true);
  budget.reset();
  assert.equal(budget.product(1, 33, 32), false);
  assert.deepEqual(budget.snapshot(), { checkpoints: 0, remaining: 2_048 });
});

test("state keys include thisBound and the bound receiver", () => {
  const fn = ts.factory.createIdentifier("fn");
  const receiver = exact([ts.factory.createIdentifier("receiver")]);
  const first = withCallable(emptyState(), fn, [{ bound: [], fn,
    thisBound: false, thisFact: receiver }]);
  const second = withCallable(emptyState(), fn, [{ bound: [], fn,
    thisBound: true, thisFact: receiver }]);
  assert.notEqual(toolcraftFlowStateKey(first), toolcraftFlowStateKey(second));
});

test("state keys include positional slots tails and evidence", () => {
  const identity = ts.factory.createIdentifier("items");
  const slot = exact([ts.factory.createStringLiteral("slot")]);
  const tail = ts.factory.createIdentifier("tail");
  const stateFor = (array) => withObject(emptyState(), identity,
    objectFact(new Map(), { array }));
  const base = stateFor({ evidence: [], slots: [slot], tails: [] });
  const slotChanged = stateFor({ evidence: [], slots: [exact([
    ts.factory.createStringLiteral("other"),
  ])], tails: [] });
  const tailChanged = stateFor({ evidence: [], slots: [slot], tails: [tail] });
  const evidenceChanged = stateFor({ evidence: ["unknown-slot"], slots: [slot], tails: [] });
  assert.notEqual(toolcraftFlowStateKey(base), toolcraftFlowStateKey(slotChanged));
  assert.notEqual(toolcraftFlowStateKey(base), toolcraftFlowStateKey(tailChanged));
  assert.notEqual(toolcraftFlowStateKey(base), toolcraftFlowStateKey(evidenceChanged));
  assert.equal(toolcraftFlowStateKey(base), toolcraftFlowStateKey(updateState(base, {})));
});
