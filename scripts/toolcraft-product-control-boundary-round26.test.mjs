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

function violationsFor(result, repoPath, kind = "public-component-chrome") {
  return result.violations.filter((violation) =>
    violation.repoPath === repoPath && violation.kind === kind
  );
}

function violationLines(result, repoPath) {
  return violationsFor(result, repoPath).map(({ line }) => line);
}

test("property aliases and assignment patterns preserve final write facts", async (context) => {
  const repoPath = "src/features/round26-assignment-flow.tsx";
  const rootDir = await createFixture(context, {
    [repoPath]: `
      import { Button } from "@/toolcraft/ui";
      const dangerousProps = { className: "flex" };
      const dangerousAlias = dangerousProps;
      dangerousAlias.className = "border";
      const safeProps = { className: "border" };
      const safeAlias = safeProps;
      safeAlias.className = "flex";

      let dangerousObject = "flex";
      ({ className: dangerousObject } = { className: "border" });
      let safeObject = "border";
      ({ className: safeObject } = { className: "flex" });
      let dangerousArray = "flex";
      [dangerousArray] = ["border"];
      let safeArray = "border";
      [safeArray] = ["flex"];

      export const Cases = <>
        <Button {...dangerousProps} />
        <Button {...safeProps} />
        <Button className={dangerousObject} />
        <Button className={safeObject} />
        <Button className={dangerousArray} />
        <Button className={safeArray} />
      </>;
    `,
  });
  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.equal(violationsFor(result, repoPath).length, 3,
    JSON.stringify(result.violations));
});

test("branch alternatives do not collapse to textual last writes", async (context) => {
  const repoPath = "src/features/round26-branches.tsx";
  const rootDir = await createFixture(context, {
    [repoPath]: `
      import { Button } from "@/toolcraft/ui";
      declare const flag: boolean;
      declare const mode: number;
      let conditional = "flex";
      flag ? (conditional = "border") : (conditional = "flex");
      let switched = "flex";
      switch (mode) {
        case 1: switched = "border"; break;
        default: switched = "flex";
      }
      let safe = "flex";
      if (flag) safe = "grid";
      export const Cases = <>
        <Button className={conditional} />
        <Button className={switched} />
        <Button className={safe} />
      </>;
    `,
  });
  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.equal(violationsFor(result, repoPath).length, 2,
    JSON.stringify(result.violations));
});

test("a preceding call exposes hoisted cross-scope writes", async (context) => {
  const repoPath = "src/features/round26-cross-scope.tsx";
  const rootDir = await createFixture(context, {
    [repoPath]: `
      import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" };
      mutate();
      export const Case = <Button {...props} />;
      function mutate() { props.className = "border"; }
    `,
  });
  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.equal(violationsFor(result, repoPath).length, 1,
    JSON.stringify(result.violations));
});

test("harmless aliases are reads rather than opaque mutations", async (context) => {
  const repoPath = "src/features/round26-alias-reads.tsx";
  const rootDir = await createFixture(context, {
    [repoPath]: `
      import { Button } from "@/toolcraft/ui";
      const props = { className: "flex", style: { display: "flex" } };
      const alias = props;
      const nested = alias.style;
      const tuple = ["flex", "grid"] as const;
      const tupleAlias = tuple;
      void alias; void nested; void tupleAlias;
      export const Case = <Button {...props} />;
    `,
  });
  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.deepEqual(violationsFor(result, repoPath), [],
    JSON.stringify(result.violations));
});

test("apply arrays retain tuple rest indexed and final adapter facts", async (context) => {
  const repoPath = "src/features/round26-apply-flow.tsx";
  const rootDir = await createFixture(context, {
    [repoPath]: `
      import { Button } from "@/toolcraft/ui";
      const Custom = () => null;
      type Component = typeof Button | typeof Custom;
      function choose(_first: Component, selected: Component) { return selected; }
      function custom(_first: Component, _selected: Component) { return Custom; }

      const tail = [Button] as const;
      const TupleSpread = choose.apply(undefined, [Custom, ...tail]);
      const tuple = [Custom, Button] as const;
      const [, ...rest] = tuple;
      const RestSpread = choose.apply(undefined, [Custom, ...rest]);
      const indexed: [Component, Component] = [Custom, Custom];
      indexed[1] = Button;
      const Indexed = choose.apply(undefined, indexed);
      declare const unknownLength: Component[];
      const UnknownLength = choose.apply(undefined, unknownLength);

      let toCustom = choose.apply;
      toCustom = custom.apply;
      const SafeFinal = toCustom(undefined, [Custom, Button]);
      let toPublic = custom.apply;
      toPublic = choose.apply;
      const PublicFinal = toPublic(undefined, [Custom, Button]);

      export const Cases = <>
        <TupleSpread className="border" />
        <RestSpread className="border" />
        <Indexed className="border" />
        <UnknownLength className="border" />
        <SafeFinal className="border" />
        <PublicFinal className="border" />
      </>;
    `,
  });
  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.deepEqual(violationLines(result, repoPath), [27, 28, 29, 30, 32],
    JSON.stringify(result.violations));
});

test("CSS subject facts include positive pseudos and conditional negation", async (context) => {
  const componentPath = "src/features/round26-selectors.tsx";
  const cssPath = "src/features/round26-selectors.module.css";
  const rootDir = await createFixture(context, {
    [componentPath]: `
      import { Button } from "@/toolcraft/ui";
      import styles from "./round26-selectors.module.css";
      export const Cases = <>
        <Button className={styles.isRoot} />
        <Button className={styles.notSpecial} />
      </>;
    `,
    [cssPath]: `
      :is(.isRoot) { border: 1px solid red; }
      .notSpecial:not(button.special) { border: 1px solid red; }
    `,
  });
  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.equal(violationsFor(result, componentPath).length, 2,
    JSON.stringify(result.violations));
  assert.deepEqual(violationsFor(result, cssPath), [],
    JSON.stringify(result.violations));
});

test("opaque style restoration is tracked per property", async context => {
  const repoPath = "src/features/restored-style.tsx";
  const rootDir = await createFixture(context, { [repoPath]: `
    import { Button } from "@/toolcraft/ui";
    declare const opaque: Record<string, unknown>;
    const unsafe = { ...opaque, color: "red", display: "flex" };
    const safe = { display: "flex" };
    export const Cases = <><Button style={unsafe} /><Button style={safe} /></>;
  ` });
  const result = await evaluateToolcraftProductBoundary({ rootDir });
  assert.equal(violationsFor(result, repoPath).length, 1, JSON.stringify(result.violations));
});

test("static flow overflow keeps its declared hard record cap", () => {
  const assignments = Array.from({ length: 80 }, (_, index) =>
    `value = ${index};`
  ).join("\n");
  const sourceFile = ts.createSourceFile(
    "round26-flow-cap.ts",
    `let value = 0;\n${assignments}\nvoid value;`,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const checker = createToolcraftTypeScriptChecker(sourceFile, ts);
  const use = sourceFile.statements.at(-1).expression.expression;
  const symbol = checker.getSymbolAtLocation(use);
  const flow = createToolcraftStaticFlowValues({
    checker,
    resolveStaticString: () => undefined,
    ts,
  });

  assert.ok(flow.recordsFor(symbol).length <= 64);
});
