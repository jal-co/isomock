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

function chromeViolations(result, repoPath) {
  return result.violations.filter((violation) =>
    violation.repoPath === repoPath &&
    violation.kind === "public-component-chrome"
  );
}

test("target cuts execute switch discriminants cases and fallthrough", async (context) => {
  const discriminantPath = "src/features/round28-switch-discriminant.tsx";
  const casePath = "src/features/round28-switch-case.tsx";
  const fallthroughPath = "src/features/round28-switch-fallthrough.tsx";
  const rootDir = await createFixture(context, {
    [discriminantPath]: `
      import { Button } from "@/toolcraft/ui";
      let className = "border";
      function select() { className = "flex"; return 0; }
      switch (select()) { case 0: break; default: break; }
      export const Safe = <Button className={className} />;
    `,
    [casePath]: `
      import { Button } from "@/toolcraft/ui";
      let className = "flex";
      function match() { className = "border"; return 0; }
      switch (0) { case match(): break; default: break; }
      export const Dangerous = <Button className={className} />;
    `,
    [fallthroughPath]: `
      import { Button } from "@/toolcraft/ui";
      let className = "border";
      switch (0) {
        case 0: className = "flex";
        case 1: className = "grid"; break;
        default: className = "block";
      }
      export const Safe = <Button className={className} />;
    `,
  });
  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.deepEqual(chromeViolations(result, discriminantPath), [],
    JSON.stringify(result.violations));
  assert.equal(chromeViolations(result, casePath).length, 1,
    JSON.stringify(result.violations));
  assert.deepEqual(chromeViolations(result, fallthroughPath), [],
    JSON.stringify(result.violations));
});

test("target cuts execute loop initializer condition body and increment", async (context) => {
  const repoPath = "src/features/round28-loop-prefix.tsx";
  const rootDir = await createFixture(context, {
    [repoPath]: `
      import { Button } from "@/toolcraft/ui";
      let initialized = "border";
      let conditioned = "border";
      let incremented = "border";
      let body = "border";
      let doBody = "border";
      let index = 0;
      for (
        initialized = "flex", index = 0;
        conditioned = "flex", index < 1;
        incremented = "flex", index++
      ) { body = "flex"; }
      do { doBody = "flex"; } while (false);
      export const Cases = <>
        <Button className={initialized} /><Button className={conditioned} />
        <Button className={incremented} /><Button className={body} />
        <Button className={doBody} />
      </>;
    `,
  });
  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.deepEqual(chromeViolations(result, repoPath), [],
    JSON.stringify(result.violations));
});

test("target cuts preserve try catch finally prefixes", async (context) => {
  const repoPath = "src/features/round28-try-prefix.tsx";
  const rootDir = await createFixture(context, {
    [repoPath]: `
      import { Button } from "@/toolcraft/ui";
      let caught = "border";
      let finalized = "border";
      let thrownValue = "border";
      try {
        caught = "flex";
        throw new Error("stop");
      } catch {
        const CatchCase = <Button className={caught} />;
        void CatchCase;
      } finally {
        finalized = "flex";
        const FinallyCase = <Button className={finalized} />;
        void FinallyCase;
      }
      try { throw "flex"; } catch (value) { thrownValue = value; }
      const CatchBinding = <Button className={thrownValue} />;
      void CatchBinding;
    `,
  });
  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.deepEqual(chromeViolations(result, repoPath), [],
    JSON.stringify(result.violations));
});

test("nested expressions use comma order and nullish rather than truth", async (context) => {
  const repoPath = "src/features/round28-expression-prefix.tsx";
  const rootDir = await createFixture(context, {
    [repoPath]: `
      import { Button } from "@/toolcraft/ui";
      let comma = "border";
      let nested = "border";
      let falseValue = "border";
      let nullValue = "border";
      function consume(value: number) { return value; }
      (comma = "flex", 0);
      consume((nested = "flex", 1));
      false ?? (falseValue = "flex");
      null ?? (nullValue = "flex");
      export const Cases = <>
        <Button className={comma} /><Button className={nested} />
        <Button className={falseValue} /><Button className={nullValue} />
      </>;
    `,
  });
  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.equal(chromeViolations(result, repoPath).length, 1,
    JSON.stringify(result.violations));
});

test("unsupported executable prefixes fail closed instead of becoming identity", async (context) => {
  const repoPath = "src/features/round28-unsupported-prefix.tsx";
  const rootDir = await createFixture(context, {
    [repoPath]: `
      import { Button } from "@/toolcraft/ui";
      async function render() {
        const props = { className: "flex" };
        await (props.className = "border");
        return <Button {...props} />;
      }
      void render;
    `,
  });
  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.equal(chromeViolations(result, repoPath).length, 1,
    JSON.stringify(result.violations));
});

test("bind defers effects until invocation", async (context) => {
  const deferredPath = "src/features/round28-bind-deferred.tsx";
  const invokedPath = "src/features/round28-bind-invoked.tsx";
  const rootDir = await createFixture(context, {
    [deferredPath]: `
      import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" };
      function mutate(target: { className: string }) {
        target.className = "border";
      }
      const pending = mutate.bind(undefined, props);
      void pending;
      export const Safe = <Button {...props} />;
    `,
    [invokedPath]: `
      import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" };
      function mutate(target: { className: string }) {
        target.className = "border";
      }
      const pending = mutate.bind(undefined, props);
      pending();
      export const Dangerous = <Button {...props} />;
    `,
  });
  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.deepEqual(chromeViolations(result, deferredPath), [],
    JSON.stringify(result.violations));
  assert.equal(chromeViolations(result, invokedPath).length, 1,
    JSON.stringify(result.violations));
});

test("method and bound this use the canonical invocation frame", async (context) => {
  const safePath = "src/features/round28-method-this-safe.tsx";
  const dangerousPath = "src/features/round28-bound-this-dangerous.tsx";
  const rootDir = await createFixture(context, {
    [safePath]: `
      import { Button } from "@/toolcraft/ui";
      const props = {
        className: "border",
        restore() { this.className = "flex"; },
      };
      props.restore();
      export const Safe = <Button className={props.className} />;
    `,
    [dangerousPath]: `
      import { Button } from "@/toolcraft/ui";
      const props = {
        className: "flex",
        mutate() { this.className = "border"; },
      };
      const invoke = props.mutate.bind(props);
      invoke();
      export const Dangerous = <Button className={props.className} />;
    `,
  });
  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.deepEqual(chromeViolations(result, safePath), [],
    JSON.stringify(result.violations));
  assert.equal(chromeViolations(result, dangerousPath).length, 1,
    JSON.stringify(result.violations));
});

test("closures resolve captured identity from call time", async (context) => {
  const repoPath = "src/features/round28-closure-call-time.tsx";
  const rootDir = await createFixture(context, {
    [repoPath]: `
      import { Button } from "@/toolcraft/ui";
      const first = { className: "flex" };
      const second = { className: "flex" };
      let selected = first;
      const mutate = () => { selected.className = "border"; };
      selected = second;
      mutate();
      export const Cases = <>
        <Button {...first} /><Button {...second} />
      </>;
    `,
  });
  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.equal(chromeViolations(result, repoPath).length, 1,
    JSON.stringify(result.violations));
});

test("deep paths and positional holes preserve exact mutation targets", async (context) => {
  const deepSafePath = "src/features/round28-deep-safe.tsx";
  const deepDangerPath = "src/features/round28-deep-danger.tsx";
  const holePath = "src/features/round28-hole.tsx";
  const rootDir = await createFixture(context, {
    [deepSafePath]: `
      import { Button } from "@/toolcraft/ui";
      const props = { nested: { className: "border" } };
      props.nested.className = "flex";
      export const Safe = <Button {...props.nested} />;
    `,
    [deepDangerPath]: `
      import { Button } from "@/toolcraft/ui";
      const props = { nested: { className: "flex" } };
      props.nested.className = "border";
      export const Dangerous = <Button {...props.nested} />;
    `,
    [holePath]: `
      import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" };
      function mutate(unused: unknown, target: { className: string }) {
        void unused; target.className = "border";
      }
      mutate.apply(undefined, [, props]);
      export const Dangerous = <Button {...props} />;
    `,
  });
  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.deepEqual(chromeViolations(result, deepSafePath), [],
    JSON.stringify(result.violations));
  assert.equal(chromeViolations(result, deepDangerPath).length, 1,
    JSON.stringify(result.violations));
  assert.equal(chromeViolations(result, holePath).length, 1,
    JSON.stringify(result.violations));
});

test("defaults distinguish absent undefined unknown null and supplied values", async (context) => {
  const nullPath = "src/features/round28-null-default.tsx", unknownPath =
    "src/features/round28-unknown-default.tsx", suppliedPath = "src/features/round28-supplied-default.tsx",
    fallbackPath = "src/features/round28-nullish-fallback.tsx";
  const rootDir = await createFixture(context, {
    [nullPath]: `
      import { Button } from "@/toolcraft/ui";
      const { className = "border" } = { className: null };
      export const Safe = <Button className={className ?? undefined} />;
    `,
    [unknownPath]: `
      import { Button } from "@/toolcraft/ui";
      declare const source: { className?: string };
      const { className = "flex" } = source;
      export const Unknown = <Button className={className} />;
    `,
    [suppliedPath]: `
      import { Button } from "@/toolcraft/ui";
      function render(className = "border") {
        return <Button className={className} />;
      }
      export const Safe = render("flex");
    `,
    [fallbackPath]: `
      import { Button } from "@/toolcraft/ui"; declare const branch: boolean;
      const className = branch ? null : "flex"; export const Dangerous =
        <Button className={className ?? "border"} />;
    `,
  });
  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.deepEqual(chromeViolations(result, nullPath), [],
    JSON.stringify(result.violations));
  assert.equal(chromeViolations(result, unknownPath).length, 1, JSON.stringify(result.violations));
  assert.deepEqual(chromeViolations(result, suppliedPath), [],
    JSON.stringify(result.violations));
  assert.equal(chromeViolations(result, fallbackPath).length, 1, JSON.stringify(result.violations));
});

test("host origins use only reachable return exits", async (context) => {
  const unreachablePath = "src/features/round28-unreachable-return.tsx";
  const reachablePath = "src/features/round28-reachable-return.tsx";
  const rootDir = await createFixture(context, {
    [unreachablePath]: `
      import { Button } from "@/toolcraft/ui";
      const Custom = () => null;
      function choose() { return Custom; return Button; }
      const Safe = choose();
      export const Case = <Safe className="border" />;
    `,
    [reachablePath]: `
      import { Button } from "@/toolcraft/ui";
      const Custom = () => null;
      declare const flag: boolean;
      function choose() { if (flag) return Button; return Custom; }
      const Dangerous = choose();
      export const Case = <Dangerous className="border" />;
    `,
  });
  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.deepEqual(chromeViolations(result, unreachablePath), [],
    JSON.stringify(result.violations));
  assert.equal(chromeViolations(result, reachablePath).length, 1,
    JSON.stringify(result.violations));
});

test("public flow facts expose no mutable Map or array authority", () => {
  const sourceFile = ts.createSourceFile(
    "round28-immutable-facts.ts",
    `const props = { className: "flex" };\nvoid props;`,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const checker = createToolcraftTypeScriptChecker(sourceFile, ts);
  const flow = createToolcraftStaticFlowValues({
    checker,
    resolveStaticString: () => undefined,
    ts,
  });
  const use = sourceFile.statements[1].expression.expression;
  const fact = flow.objectAt(use, use);
  const [variant] = fact.variants;

  assert.ok(Object.isFrozen(fact));
  assert.ok(Object.isFrozen(fact.variants));
  assert.ok(Object.isFrozen(variant));
  assert.equal(typeof variant.properties.set, "undefined");
  const entries = variant.properties.entries();
  assert.ok(Array.isArray(entries));
  assert.ok(Object.isFrozen(entries));
});

test("unsupported executable statements expose overflow rather than identity", () => {
  const sourceFile = ts.createSourceFile(
    "round28-unsupported-statement.ts",
    `const props = { className: "flex" };
     namespace Unsupported { export const value = props; }
     void props;`,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const checker = createToolcraftTypeScriptChecker(sourceFile, ts);
  const flow = createToolcraftStaticFlowValues({
    checker, resolveStaticString: () => undefined, ts,
  });
  const useStatement = sourceFile.statements[2];
  const use = useStatement.expression.expression;

  assert.equal(flow.valueAt(use, useStatement).kind, "overflow");
});

test("target cuts enter switch clauses and loop bodies with executed prefixes", async (context) => {
  const switchPath = "src/features/round28-switch-target.tsx";
  const loopPath = "src/features/round28-loop-target.tsx";
  const rootDir = await createFixture(context, {
    [switchPath]: `
      import { Button } from "@/toolcraft/ui";
      function render(mode: "show") {
        let className = "border";
        switch ((className = "flex", mode)) {
          case "show":
            className = "grid";
            return <Button className={className} />;
        }
      }
      export const Safe = render("show");
    `,
    [loopPath]: `
      import { Button } from "@/toolcraft/ui";
      function render() {
        let className = "border";
        do {
          className = "flex";
          return <Button className={className} />;
        } while ((className = "border", false));
      }
      export const Safe = render();
    `,
  });
  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.deepEqual(chromeViolations(result, switchPath), [],
    JSON.stringify(result.violations));
  assert.deepEqual(chromeViolations(result, loopPath), [],
    JSON.stringify(result.violations));
});

test("call frames share canonical alias object IIFE call and bind resolution", async (context) => {
  const cases = {
    alias: `const invoke = render; export const Case = invoke(Button);`,
    object: `const api = { invoke: render }; export const Case = api.invoke(Button);`,
    iife: `export const Case = ((Component: ElementType) =>
      <Component className="border" />)(Button);`,
    call: `export const Case = render.call(undefined, Button);`,
    bind: `export const Case = render.bind(undefined, Button)();`,
  };
  const sources = Object.fromEntries(Object.entries(cases).map(([name, call]) => [
    `src/features/round28-frame-${name}.tsx`,
    `
      import { Button } from "@/toolcraft/ui";
      import type { ElementType } from "react";
      function render(Component: ElementType) {
        return <Component className="border" />;
      }
      ${call}
    `,
  ]));
  const safePath = "src/features/round28-frame-safe.tsx";
  sources[safePath] = `
    import { Button } from "@/toolcraft/ui";
    import type { ElementType } from "react";
    const Custom = () => null;
    function render(Component: ElementType) {
      return <Component className="border" />;
    }
    const invoke = render;
    export const Safe = invoke(Custom);
  `;
  const rootDir = await createFixture(context, sources);
  const result = await evaluateToolcraftProductBoundary({ rootDir });

  for (const name of Object.keys(cases)) {
    const repoPath = `src/features/round28-frame-${name}.tsx`;
    assert.equal(chromeViolations(result, repoPath).length, 1,
      `${repoPath}: ${JSON.stringify(result.violations)}`);
  }
  assert.deepEqual(chromeViolations(result, safePath), [],
    JSON.stringify(result.violations));
});

test("expression target cuts execute ordered siblings before the target", async (context) => {
  const repoPath = "src/features/round28-expression-target.tsx";
  const rootDir = await createFixture(context, {
    [repoPath]: `
      import { Button } from "@/toolcraft/ui";
      let className = "border";
      export const Safe = <Button
        id={(className = "flex", "safe")}
        className={className}
      />;
    `,
  });
  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.deepEqual(chromeViolations(result, repoPath), [],
    JSON.stringify(result.violations));
});
