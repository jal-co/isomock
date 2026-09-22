import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
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

test("ordered branch exits honor all-path safe final values", async (context) => {
  const repoPath = "src/features/round27-ordered-exits.tsx";
  const rootDir = await createFixture(context, {
    [repoPath]: `
      import { Button } from "@/toolcraft/ui";
      declare const flag: boolean;
      declare const mode: number;

      let safeIf = "border";
      if (flag) safeIf = "flex"; else safeIf = "grid";

      let dangerousIf = "flex";
      if (flag) dangerousIf = "border";

      let safeConditional = "border";
      flag ? (safeConditional = "flex") : (safeConditional = "grid");

      let safeLogical = "border";
      (flag && (safeLogical = "flex")) || (safeLogical = "grid");

      let safeSwitch = "border";
      switch (mode) {
        case 0: safeSwitch = "flex"; break;
        case 1: safeSwitch = "grid"; break;
        default: safeSwitch = "block";
      }

      let dangerousSwitch = "flex";
      switch (mode) { case 0: dangerousSwitch = "border"; break; }

      export const Cases = <>
        <Button className={safeIf} />
        <Button className={dangerousIf} />
        <Button className={safeConditional} />
        <Button className={safeLogical} />
        <Button className={safeSwitch} />
        <Button className={dangerousSwitch} />
      </>;
    `,
  });
  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.equal(chromeViolations(result, repoPath).length, 2,
    JSON.stringify(result.violations));
});

test("try catch finally preserves ordered abrupt exits", async (context) => {
  const repoPath = "src/features/round27-try-exits.tsx";
  const rootDir = await createFixture(context, {
    [repoPath]: `
      import { Button } from "@/toolcraft/ui";
      declare const flag: boolean;

      let safeFinally = "border";
      try {
        if (flag) throw new Error("x");
        safeFinally = "border";
      } catch {
        safeFinally = "border";
      } finally {
        safeFinally = "flex";
      }

      let dangerousCatch = "flex";
      try {
        if (flag) throw new Error("x");
      } catch {
        dangerousCatch = "border";
      }

      function abrupt(flag: boolean) {
        let unreachable = "flex";
        if (flag) return <Button className={unreachable} />;
        throw new Error("stop");
        unreachable = "border";
      }

      export const Cases = <>
        <Button className={safeFinally} />
        <Button className={dangerousCatch} />
        {abrupt(flag)}
      </>;
    `,
  });
  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.equal(chromeViolations(result, repoPath).length, 1,
    JSON.stringify(result.violations));
});

test("destructuring defaults execute for absent and undefined paths", async (context) => {
  const repoPath = "src/features/round27-pattern-defaults.tsx";
  const rootDir = await createFixture(context, {
    [repoPath]: `
      import { Button } from "@/toolcraft/ui";
      const { className: dangerousDeclaration = "border" } = {
        className: undefined,
      };
      const { className: safeDeclaration = "border" } = {
        className: "flex",
      };
      let dangerousAssignment = "flex";
      ({ className: dangerousAssignment = "border" } = {});
      let safeAssignment = "border";
      ({ className: safeAssignment = "border" } = { className: "grid" });
      const tuple: [undefined, string] = [undefined, "grid"];
      const [dangerousArray = "border", safeArray = "border"] = tuple;
      export const Cases = <>
        <Button className={dangerousDeclaration} />
        <Button className={safeDeclaration} />
        <Button className={dangerousAssignment} />
        <Button className={safeAssignment} />
        <Button className={dangerousArray} />
        <Button className={safeArray} />
      </>;
    `,
  });
  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.equal(chromeViolations(result, repoPath).length, 3,
    JSON.stringify(result.violations));
});

test("canonical calls apply alias object IIFE call and bind effects", async (context) => {
  const repoPath = "src/features/round27-call-effects.tsx";
  const rootDir = await createFixture(context, {
    [repoPath]: `
      import { Button } from "@/toolcraft/ui";
      const direct = { className: "flex" };
      const aliased = { className: "flex" };
      const member = { className: "flex" };
      const immediate = { className: "flex" };
      const called = { className: "flex" };
      const bound = { className: "flex" };
      const clean = { className: "flex" };
      function mutate(target: { className: string }) {
        target.className = "border";
      }
      function read(target: { className: string }) { return target.className; }
      mutate(direct);
      const alias = mutate;
      alias(aliased);
      const box = { run: mutate };
      box.run(member);
      ((target: { className: string }) => {
        target.className = "border";
      })(immediate);
      mutate.call(undefined, called);
      const invoke = mutate.bind(undefined);
      invoke(bound);
      void read(clean);
      export const Cases = <>
        <Button {...direct} /><Button {...aliased} /><Button {...member} />
        <Button {...immediate} /><Button {...called} /><Button {...bound} />
        <Button {...clean} />
      </>;
    `,
  });
  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.equal(chromeViolations(result, repoPath).length, 6,
    JSON.stringify(result.violations));
});

test("ordinary apply methods use their declared object effect", async (context) => {
  const safePath = "src/features/round27-ordinary-apply-safe.tsx";
  const dangerousPath = "src/features/round27-ordinary-apply-dangerous.tsx";
  const rootDir = await createFixture(context, {
    [safePath]: `
      import { Button } from "@/toolcraft/ui";
      const props = { className: "border" };
      const adapter = {
        apply(target: { className: string }, value: string) {
          target.className = value;
        },
      };
      adapter.apply(props, "flex");
      export const Safe = <Button {...props} />;
    `,
    [dangerousPath]: `
      import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" };
      const adapter = {
        apply(target: { className: string }, value: string) {
          target.className = value;
        },
      };
      adapter.apply(props, "border");
      export const Dangerous = <Button {...props} />;
    `,
  });
  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.deepEqual(chromeViolations(result, safePath), [],
    JSON.stringify(result.violations));
  assert.equal(chromeViolations(result, dangerousPath).length, 1,
    JSON.stringify(result.violations));
});

test("mutable reference aliases follow their final identity", async (context) => {
  const repoPath = "src/features/round27-alias-identity.tsx";
  const rootDir = await createFixture(context, {
    [repoPath]: `
      import { Button } from "@/toolcraft/ui";
      const first = { className: "flex" };
      const second = { className: "flex" };
      let alias = first;
      alias = second;
      alias.className = "border";
      const propertyRead = first.className;
      void propertyRead;
      export const Cases = <>
        <Button {...first} />
        <Button {...second} />
      </>;
    `,
  });
  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.equal(chromeViolations(result, repoPath).length, 1,
    JSON.stringify(result.violations));
});

test("opaque style remainder survives one-domain restoration", async (context) => {
  const repoPath = "src/features/round27-style-remainder.tsx";
  const rootDir = await createFixture(context, {
    [repoPath]: `
      import { Button } from "@/toolcraft/ui";
      declare function opaque(value: object): void;
      const unresolved = { border: "none" };
      opaque(unresolved);
      unresolved.border = undefined as never;
      let replaced = { border: "none" };
      opaque(replaced);
      replaced = { display: "flex" };
      export const Cases = <>
        <Button style={unresolved} />
        <Button style={replaced} />
      </>;
    `,
  });
  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.equal(chromeViolations(result, repoPath).length, 1,
    JSON.stringify(result.violations));
});

test("uppercase CSS pseudos retain lowercase subject semantics", async (context) => {
  const componentPath = "src/features/round27-pseudos.tsx";
  const cssPath = "src/features/round27-pseudos.module.css";
  const rootDir = await createFixture(context, {
    [componentPath]: `
      import { Button } from "@/toolcraft/ui";
      import styles from "./round27-pseudos.module.css";
      export const Cases = <>
        <Button className={styles.upperIs} />
        <Button className={styles.upperNot} />
      </>;
    `,
    [cssPath]: `
      :IS(.upperIs) { border: 1px solid red; }
      .upperNot:NOT(button.special) { border: 1px solid red; }
    `,
  });
  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.equal(chromeViolations(result, componentPath).length, 2,
    JSON.stringify(result.violations));
  assert.deepEqual(result.violations.filter(({ repoPath }) =>
    repoPath === cssPath), [], JSON.stringify(result.violations));
});

test("Round 27 uses decomposed canonical flow owners", async () => {
  const owners = [
    "toolcraft-flow-facts.mjs",
    "toolcraft-flow-expressions.mjs",
    "toolcraft-flow-memory.mjs",
    "toolcraft-flow-patterns.mjs",
    "toolcraft-execution-budget.mjs",
    "toolcraft-execution-engine.mjs",
    "toolcraft-execution-observer.mjs",
    "toolcraft-flow-calls.mjs",
    "toolcraft-flow-control.mjs",
    "toolcraft-flow-environments.mjs",
    "toolcraft-flow-evaluated-values.mjs",
    "toolcraft-flow-literal-values.mjs",
    "toolcraft-flow-operators.mjs",
    "toolcraft-flow-public-facts.mjs",
    "toolcraft-flow-references.mjs",
    "toolcraft-flow-state-joining.mjs",
    "toolcraft-flow-statements.mjs",
    "toolcraft-invocation-authority.mjs",
    "toolcraft-invocation-facts.mjs",
    "toolcraft-static-flow-index.mjs",
  ];
  for (const owner of owners) {
    await access(new URL(owner, import.meta.url));
    const source = await readFile(new URL(owner, import.meta.url), "utf8");
    assert.ok(source.split("\n").length <= 350, owner);
  }
  await assert.rejects(access(new URL(
    "toolcraft-flow-literal-memory.mjs", import.meta.url,
  )));
  await assert.rejects(access(new URL(
    "toolcraft-flow-literals.mjs", import.meta.url,
  )));
  await assert.rejects(access(new URL(
    "toolcraft-static-flow-writes.mjs", import.meta.url,
  )));
  await assert.rejects(access(new URL(
    "toolcraft-invocation-adapter.mjs", import.meta.url,
  )));
  await assert.rejects(access(new URL(
    "toolcraft-invocation-execution.mjs", import.meta.url,
  )));
});

test("structured flow caches bounded observer results instead of query prefixes", async () => {
  const source = await readFile(new URL(
    "toolcraft-execution-observer.mjs", import.meta.url,
  ), "utf8");

  assert.doesNotMatch(source, /stateCache\.set\(useNode/u);
  assert.match(source, /MAX_OBSERVED_STATES = 32/u);
  assert.match(source, /const executionSummaries = new WeakMap/u);
  assert.match(source, /function summaryForRegion/u);
});

test("structured flow reuses a bounded working set of scope prefixes", async () => {
  const scopeCount = 12;
  const assignmentCount = 80;
  const declarations = Array.from({ length: scopeCount }, (_, scope) => `
    function scope${scope}() {
      let value = "flex";
      ${Array.from({ length: assignmentCount }, (_, write) =>
        `value = "${write % 2 === 0 ? "grid" : "flex"}";`
      ).join("\n")}
      return value;
    }
  `).join("\n");
  const sourceFile = ts.createSourceFile(
    "round27-scope-cache.ts", declarations, ts.ScriptTarget.Latest, true,
    ts.ScriptKind.TS,
  );
  const checker = createToolcraftTypeScriptChecker(sourceFile, ts);
  const flow = createToolcraftStaticFlowValues({
    checker,
    resolveStaticString: () => undefined,
    ts,
  });
  const uses = sourceFile.statements.map((statement) =>
    statement.body.statements.at(-1).expression
  );
  const startedAt = performance.now();
  for (let pass = 0; pass < 12; pass += 1) {
    for (const use of uses) flow.valueAt(use, use);
  }
  const elapsed = performance.now() - startedAt;
  const observerSource = await readFile(new URL(
    "toolcraft-execution-observer.mjs", import.meta.url,
  ), "utf8");

  assert.ok(elapsed < 2_000, `scope prefix working set took ${elapsed}ms`);
  assert.match(observerSource, /MAX_OBSERVED_STATES = 32/u);
  assert.match(observerSource, /const executionSummaries = new WeakMap/u);
  assert.match(observerSource, /function summaryForRegion/u);
});

test("structured flow stops oversized statement regions conservatively", async () => {
  const calls = Array.from({ length: 2_048 }, () => "noop();").join("\n");
  const sourceFile = ts.createSourceFile(
    "round27-statement-budget.ts",
    `function noop() {}\nfunction oversized() {\n${calls}\nreturn noop;\n}`,
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
  const use = sourceFile.statements[1].body.statements.at(-1).expression;
  const startedAt = performance.now();
  const fact = flow.valueAt(use, use);
  const elapsed = performance.now() - startedAt;
  const regionsSource = await readFile(new URL(
    "toolcraft-execution-engine.mjs", import.meta.url,
  ), "utf8");

  assert.equal(fact.kind, "overflow");
  assert.ok(elapsed < 1_000, `statement overflow took ${elapsed}ms`);
  assert.match(regionsSource, /MAX_STATEMENT_VISITS = 1024/u);
});

test("host invocation preserves dangerous middle return overflow", async (context) => {
  const repoPath = "src/features/round27-return-overflow.tsx";
  const branches = Array.from({ length: 40 }, (_, index) =>
    `if (mode === ${index}) return ${index === 20 ? "Button" : "Custom"};`
  ).join("\n");
  const safeBranches = Array.from({ length: 40 }, (_, index) =>
    `if (mode === ${index}) return Custom;`
  ).join("\n");
  const rootDir = await createFixture(context, {
    [repoPath]: `
      import { Button } from "@/toolcraft/ui";
      const Custom = () => null;
      declare const mode: number;
      function choose() { ${branches} return Custom; }
      function chooseSafe() { ${safeBranches} return Custom; }
      const Dangerous = choose();
      const Safe = chooseSafe();
      export const Cases = <>
        <Dangerous className="border" />
        <Safe className="border" />
      </>;
    `,
  });
  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.equal(chromeViolations(result, repoPath).length, 1,
    JSON.stringify(result.violations));
});
