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
    violation.repoPath === repoPath &&
    violation.kind === "public-component-chrome"
  );
}

async function boundary(context, sources) {
  const rootDir = await createFixture(context, sources);
  return evaluateToolcraftProductBoundary({ rootDir });
}

test("assignment evaluates the complete LHS before RHS and compound read", async (context) => {
  const order = "src/features/round29-lhs-order.tsx";
  const getter = "src/features/round29-compound-get.tsx";
  const result = await boundary(context, {
    [order]: `
      import { Button } from "@/toolcraft/ui";
      let className = "grid"; const target = { value: 0 };
      function base() { className = "block"; return target; }
      function key() { className = "border"; return "value" as const; }
      base()[key()] = (className = "flex", 1);
      export const Safe = <Button className={className} />;
    `,
    [getter]: `
      import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" };
      const value = { get current() { props.className = "border"; return 1; } };
      try { value.current += 1; } catch {}
      export const Dangerous = <Button {...props} />;
    `,
  });
  assert.deepEqual(violations(result, order), [], JSON.stringify(result.violations));
  assert.equal(violations(result, getter).length, 1, JSON.stringify(result.violations));
});

test("logical assignments short circuit RHS and setter by truth and nullishness", async (context) => {
  const repoPath = "src/features/round29-logical-assignment.tsx";
  const result = await boundary(context, { [repoPath]: `
    import { Button } from "@/toolcraft/ui";
    let skipped = "border", nullish = "border", falsy = "border";
    let truthy = "value", absent: string | null = null, falseValue = false;
    truthy ||= (skipped = "flex");
    absent ??= (nullish = "flex", "value");
    falseValue ??= (falsy = "flex", true);
    export const Cases = <><Button className={skipped} />
      <Button className={nullish} /><Button className={falsy} /></>;
  ` });
  assert.equal(violations(result, repoPath).length, 2, JSON.stringify(result.violations));
});

test("accessor reads and writes invoke once with the owning receiver", async (context) => {
  const dangerous = "src/features/round29-accessors.tsx";
  const inert = "src/features/round29-accessor-definition.tsx";
  const result = await boundary(context, {
    [dangerous]: `
      import { Button } from "@/toolcraft/ui";
      const first = { className: "flex" }, second = { className: "flex" };
      const source = { first, second,
        get current() { this.first.className = "border"; return 1; },
        set current(value: number) { this.second.className = value ? "border" : "flex"; }
      };
      void source.current; source.current = 1;
      export const Cases = <><Button {...first} /><Button {...second} /></>;
    `,
    [inert]: `
      import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" };
      const source = { get current() { props.className = "border"; return 1; } };
      void source; export const Safe = <Button {...props} />;
    `,
  });
  assert.equal(violations(result, dangerous).length, 2, JSON.stringify(result.violations));
  assert.deepEqual(violations(result, inert), [], JSON.stringify(result.violations));
});

test("optional calls skip keys arguments and invocation on nullish paths", async (context) => {
  const skipped = "src/features/round29-optional-skipped.tsx";
  const invoked = "src/features/round29-optional-invoked.tsx";
  const result = await boundary(context, {
    [skipped]: `
      import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" };
      const missing: undefined | ((value: unknown) => void) = undefined;
      missing?.((props.className = "border"));
      const object: undefined | { run(): void } = undefined;
      object?.[(props.className = "border", "run")]();
      export const Safe = <Button {...props} />;
    `,
    [invoked]: `
      import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" };
      const run = (value: string) => { props.className = value; };
      run?.("border"); export const Dangerous = <Button {...props} />;
    `,
  });
  assert.deepEqual(violations(result, skipped), [], JSON.stringify(result.violations));
  assert.equal(violations(result, invoked).length, 1, JSON.stringify(result.violations));
});

test("switch preserves fallthrough when a sibling path breaks", async (context) => {
  const repoPath = "src/features/round29-switch-fallthrough.tsx";
  const result = await boundary(context, { [repoPath]: `
    import { Button } from "@/toolcraft/ui"; declare const mode: 0 | 1;
    let className = "flex";
    switch (mode) { case 0: className = "grid"; break;
      case 1: className = "flex"; default: className = "border"; }
    export const Possible = <Button className={className} />;
  ` });
  assert.equal(violations(result, repoPath).length, 1, JSON.stringify(result.violations));
});

test("labeled completions are consumed only by their matching target", async (context) => {
  const danger = "src/features/round29-label-danger.tsx";
  const safe = "src/features/round29-label-safe.tsx";
  const result = await boundary(context, {
    [danger]: `
      import { Button } from "@/toolcraft/ui"; let className = "flex";
      outer: { inner: { className = "border"; break outer; }
        className = "flex"; } export const Case = <Button className={className} />;
    `,
    [safe]: `
      import { Button } from "@/toolcraft/ui"; let className = "border";
      outer: { inner: { className = "flex"; break inner; }
        className = "grid"; } export const Case = <Button className={className} />;
    `,
  });
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
});

test("nested loops preserve a break owned by an outer label", async (context) => {
  const repoPath = "src/features/round29-loop-label-owner.tsx";
  const result = await boundary(context, { [repoPath]: `
    import { Button } from "@/toolcraft/ui"; let className = "border";
    outer: for (let i = 0; i < 1; i += 1) {
      for (let j = 0; j < 1; j += 1) {
        className = "flex"; break outer;
      }
      className = "border";
    }
    export const Case = <Button className={className} />;
  ` });
  assert.deepEqual(violations(result, repoPath), [], JSON.stringify(result.violations));
});

test("finally resumes or overrides the exact preceding completion", async (context) => {
  const safe = "src/features/round29-finally-safe.tsx";
  const result = await boundary(context, { [safe]: `
    import { Button } from "@/toolcraft/ui"; const Custom = () => null;
    function choose() { try { return Button; } finally { return Custom; } }
    const Component = choose(); export const Safe = <Component className="border" />;
  ` });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
});

test("parameter defaults execute only for absent or exact undefined", async (context) => {
  const danger = "src/features/round29-parameter-default.tsx";
  const safe = "src/features/round29-parameter-supplied.tsx";
  const files = (call) => `
    import { Button } from "@/toolcraft/ui"; const props = { className: "flex" };
    function use(value = (props.className = "border", "fallback")) { void value; }
    ${call}; export const Case = <Button {...props} />;
  `;
  const result = await boundary(context, {
    [danger]: files("use(undefined)"), [safe]: files("use(null)"),
  });
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
});

test("destructuring defaults execute only for absent and undefined slots", async (context) => {
  const danger = "src/features/round29-pattern-default.tsx";
  const safe = "src/features/round29-pattern-null.tsx";
  const result = await boundary(context, {
    [danger]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; let value;
      ({ value = (props.className = "border", 1) } = {});
      export const Case = <Button {...props} />;`,
    [safe]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; let value;
      ({ value = (props.className = "border", 1) } = { value: null });
      export const Case = <Button {...props} />;`,
  });
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
});

test("opaque calls preserve possible captured callback effects", async (context) => {
  const danger = "src/features/round29-opaque-callback.tsx";
  const safe = "src/features/round29-read-callback.tsx";
  const source = (body) => `import { Button } from "@/toolcraft/ui";
    declare function schedule(callback: () => void): void;
    const props = { className: "flex" }; schedule(() => { ${body} });
    export const Case = <Button {...props} />;`;
  const result = await boundary(context, {
    [danger]: source(`props.className = "border";`),
    [safe]: source("void props.className;"),
  });
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
});

test("closure instances retain independent activation cells", async (context) => {
  const repoPath = "src/features/round29-closure-instances.tsx";
  const result = await boundary(context, { [repoPath]: `
    import { Button } from "@/toolcraft/ui";
    const first = { className: "flex" }, second = { className: "flex" };
    function make(target: { className: string }) {
      return () => { target.className = "border"; };
    }
    const mutateFirst = make(first); make(second); mutateFirst();
    export const Safe = <Button {...second} />;
  ` });
  assert.deepEqual(violations(result, repoPath), [], JSON.stringify(result.violations));
});

test("bound this wins over call and caller bindings restore after return", async (context) => {
  const dangerous = "src/features/round29-bound-this-danger.tsx";
  const safe = "src/features/round29-bound-this-safe.tsx";
  const source = (render) => `
    import { Button } from "@/toolcraft/ui";
    const bound = { className: "flex", mutate() { this.className = "border"; } };
    const other = { className: "flex" };
    const invoke = bound.mutate.bind(bound); invoke.call(other);
    ${render}
  `;
  const result = await boundary(context, {
    [dangerous]: source("export const Case = <Button {...bound} />;"),
    [safe]: source("export const Case = <Button {...other} />;"),
  });
  assert.equal(violations(result, dangerous).length, 1,
    JSON.stringify(result.violations));
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
});

test("execution exposes typed exhaustion at the shared work boundary", () => {
  const statements = Array.from({ length: 2_100 }, () => "flag ? value : value;").join("\n");
  const sourceFile = ts.createSourceFile("round29-budget.ts",
    `declare const flag: boolean; let value = "flex"; ${statements}\nvoid value;`,
    ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const checker = createToolcraftTypeScriptChecker(sourceFile, ts);
  const flow = createToolcraftStaticFlowValues({ checker, ts,
    resolveStaticString: () => undefined });
  const statement = sourceFile.statements.at(-1);
  const use = statement.expression.expression;
  assert.equal(flow.valueAt(use, statement).kind, "overflow");
});

test("kernel snapshots are deeply immutable without mutable collection escape", () => {
  const sourceFile = ts.createSourceFile("round29-immutable.ts",
    `const props = { nested: { className: "flex" } }; void props;`,
    ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const checker = createToolcraftTypeScriptChecker(sourceFile, ts);
  const flow = createToolcraftStaticFlowValues({ checker, ts,
    resolveStaticString: () => undefined });
  const statement = sourceFile.statements[1];
  const use = statement.expression.expression;
  const fact = flow.objectAt(use, statement);
  const entries = fact.variants[0].properties.entries();
  assert.ok(Object.isFrozen(fact) && Object.isFrozen(fact.variants));
  assert.ok(Object.isFrozen(entries));
  assert.throws(() => fact.variants.push(fact.variants[0]), TypeError);
  assert.throws(() => entries.push(entries[0]), TypeError);
  assert.equal(typeof fact.variants[0].properties.set, "undefined");
});

test("activation cells keep a practical bounded top-level working set", () => {
  const count = 180;
  const sourceFile = ts.createSourceFile("round29-cell-working-set.ts", [
    ...Array.from({ length: count }, (_, index) =>
      `let value${index} = "flex";`),
    ...Array.from({ length: count }, (_, index) => `void value${index};`),
  ].join("\n"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const checker = createToolcraftTypeScriptChecker(sourceFile, ts);
  const flow = createToolcraftStaticFlowValues({ checker, ts,
    resolveStaticString: () => undefined });
  const uses = sourceFile.statements.slice(count).map(
    (statement) => statement.expression.expression,
  );
  const startedAt = performance.now();
  for (const use of uses) flow.valueAt(use, use);
  const elapsed = performance.now() - startedAt;
  assert.ok(elapsed < 1_800, `activation cell working set took ${elapsed}ms`);
});

test("linear closure inventories skip redundant state canonicalization", () => {
  const count = 120;
  const sourceFile = ts.createSourceFile("round29-closure-working-set.ts", [
    ...Array.from({ length: count }, (_, index) =>
      `const closure${index} = () => "flex";`),
    `void closure${count - 1};`,
  ].join("\n"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const checker = createToolcraftTypeScriptChecker(sourceFile, ts);
  const flow = createToolcraftStaticFlowValues({ checker, ts,
    resolveStaticString: () => undefined });
  const statement = sourceFile.statements.at(-1);
  const use = statement.expression.expression;
  const startedAt = performance.now();
  flow.valueAt(use, use);
  const elapsed = performance.now() - startedAt;
  assert.ok(elapsed < 25, `linear closure inventory took ${elapsed}ms`);
});

test("branched closure inventories memoize immutable state keys", () => {
  const count = 120;
  const sourceFile = ts.createSourceFile("round29-branch-working-set.ts", [
    "declare const flag: boolean;",
    'let chosen = "flex";',
    ...Array.from({ length: count }, (_, index) =>
      `const closure${index} = () => "flex";`),
    'if (flag) chosen = "flex"; else chosen = "block";',
    ...Array.from({ length: count - 1 }, (_, index) =>
      `void closure${index};`),
    `void closure${count - 1};`,
  ].join("\n"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const checker = createToolcraftTypeScriptChecker(sourceFile, ts);
  const flow = createToolcraftStaticFlowValues({ checker, ts,
    resolveStaticString: () => undefined });
  const statement = sourceFile.statements.at(-1);
  const use = statement.expression.expression;
  const startedAt = performance.now();
  flow.valueAt(use, use);
  const elapsed = performance.now() - startedAt;
  assert.ok(elapsed < 250, `branched closure inventory took ${elapsed}ms`);
});

test("synthetic compound results remain distinct across branch exits", () => {
  const sourceFile = ts.createSourceFile("round29-synthetic-state-key.ts", `
    declare const flag: boolean;
    let value = 0;
    if (flag) value += 1; else value += 2;
    void value;
  `, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const checker = createToolcraftTypeScriptChecker(sourceFile, ts);
  const flow = createToolcraftStaticFlowValues({ checker, ts,
    resolveStaticString: () => undefined });
  const statement = sourceFile.statements.at(-1);
  const use = statement.expression.expression;
  const fact = flow.valueAt(use, use);
  assert.equal(fact.kind, "exact");
  assert.deepEqual(fact.values.map(({ text }) => text).sort(), ["1", "2"]);
});
