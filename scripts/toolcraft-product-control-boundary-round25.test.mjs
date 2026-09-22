import assert from "node:assert/strict";
import test from "node:test";

import { evaluateToolcraftProductBoundary } from
  "./toolcraft-product-boundary.mjs";
import { createToolcraftProductBoundaryFixture as createFixture } from
  "./toolcraft-product-boundary-test-fixtures.mjs";

function violationsFor(result, repoPath, kind) {
  return result.violations.filter((violation) =>
    violation.repoPath === repoPath && violation.kind === kind
  );
}

function chrome(result, repoPath) {
  return violationsFor(result, repoPath, "public-component-chrome");
}

test("component origin follows final writes methods and nonliteral apply arrays", async (context) => {
  const repoPath = "src/features/round25-component-flow.tsx";
  const rootDir = await createFixture(context, {
    "node_modules/opaque-component/index.d.ts": `
      import type { ComponentType } from "react";
      export function discard(value: ComponentType): () => null;
    `,
    [repoPath]: `
      import { Button } from "@/toolcraft/ui";
      import { discard } from "opaque-component";
      const Custom = () => null;
      type Component = typeof Button | typeof Custom;
      function choose(_ignored: Component, selected: Component) { return selected; }

      let FromPublic: Component = Button;
      FromPublic = Custom;
      let ToPublic: Component = Custom;
      ToPublic = Button;

      const FromPublicProperty: { View: Component } = { View: Button };
      FromPublicProperty.View = Custom;
      const ToPublicProperty: { View: Component } = { View: Custom };
      ToPublicProperty.View = Button;

      const registry = {
        choose(_ignored: Component, selected: Component) { return selected; },
      };
      const MethodSelected = registry.choose(Custom, Button);
      const args = [Custom, Button] as const;
      const spreadArgs = [...args] as const;
      const Applied = choose.apply(undefined, args);
      const SpreadApplied = choose.apply(undefined, spreadArgs);
      const applyAlias = choose.apply;
      const AliasApplied = applyAlias(undefined, args);
      declare const unknownArgs: Component[];
      const UnknownApplied = choose.apply(undefined, unknownArgs);
      const Opaque = discard(Button);

      export const Cases = <>
        <FromPublic className="border" />
        <ToPublic className="border" />
        <FromPublicProperty.View className="border" />
        <ToPublicProperty.View className="border" />
        <MethodSelected className="border" />
        <Applied className="border" />
        <SpreadApplied className="border" />
        <AliasApplied className="border" />
        <UnknownApplied className="border" />
        <Opaque className="border" />
      </>;
    `,
  });
  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.equal(chrome(result, repoPath).length, 7, JSON.stringify(result.violations));
});

test("whole replacements restore safety while opaque style remainder persists", async (context) => {
  const repoPath = "src/features/round25-value-flow-safe.tsx";
  const rootDir = await createFixture(context, {
    [repoPath]: `
      import type { CSSProperties } from "react";
      import { Button } from "@/toolcraft/ui";
      declare function mutate(value: object): void;

      let safeClass = "border";
      safeClass = "flex";
      const restoredClass = { className: "border" };
      mutate(restoredClass);
      restoredClass.className = "flex";

      let safeStyle: CSSProperties = { border: "1px solid red" };
      safeStyle = { display: "flex" };
      const restoredStyle: CSSProperties = { border: "1px solid red" };
      mutate(restoredStyle);
      restoredStyle.border = undefined;

      let safeHtml = { __html: "<button>Bad</button>" };
      safeHtml = { __html: "<strong>Safe</strong>" };
      const restoredHtml = { __html: "<button>Bad</button>" };
      mutate(restoredHtml);
      restoredHtml.__html = "<strong>Safe</strong>";

      export const Cases = <>
        <Button className={safeClass} />
        <Button {...restoredClass} />
        <Button style={safeStyle} />
        <Button style={restoredStyle} />
        <div dangerouslySetInnerHTML={safeHtml} />
        <div dangerouslySetInnerHTML={restoredHtml} />
      </>;
    `,
  });
  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.deepEqual(chrome(result, repoPath).map(({ line }) => line), [28],
    JSON.stringify(result.violations));
  assert.deepEqual(
    violationsFor(result, repoPath, "raw-control-markup"),
    [],
    JSON.stringify(result.violations),
  );
});

test("dangerous and unknown class style and raw mutations fail closed", async (context) => {
  const repoPath = "src/features/round25-value-flow-dangerous.tsx";
  const rootDir = await createFixture(context, {
    [repoPath]: `
      import type { CSSProperties } from "react";
      import { Button } from "@/toolcraft/ui";
      declare function mutate(value: object): void;
      let dangerousClass = "flex";
      dangerousClass = "border";
      const unknownClass = { className: "flex" };
      mutate(unknownClass);
      const dangerousStyle: CSSProperties = { display: "flex" };
      dangerousStyle.border = "1px solid red";
      const unknownStyle: CSSProperties = { display: "flex" };
      mutate(unknownStyle);
      const dangerousHtml = { __html: "<strong>Safe</strong>" };
      dangerousHtml.__html = "<button>Bad</button>";
      const unknownHtml = { __html: "<strong>Safe</strong>" };
      mutate(unknownHtml);
      export const Cases = <>
        <Button className={dangerousClass} />
        <Button {...unknownClass} />
        <Button style={dangerousStyle} />
        <Button style={unknownStyle} />
        <div dangerouslySetInnerHTML={dangerousHtml} />
        <div dangerouslySetInnerHTML={unknownHtml} />
      </>;
    `,
  });
  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.equal(chrome(result, repoPath).length, 4, JSON.stringify(result.violations));
  assert.equal(
    violationsFor(result, repoPath, "raw-control-markup").length,
    2,
    JSON.stringify(result.violations),
  );
});

test("utility inline and CSS reset values all remain owned chrome", async (context) => {
  const componentPath = "src/features/round25-resets.tsx";
  const cssPath = "src/features/round25-resets.module.css";
  const rootDir = await createFixture(context, {
    [componentPath]: `
      import { Button } from "@/toolcraft/ui";
      import styles from "./round25-resets.module.css";
      export const Invalid = <>
        <Button className="[all:unset]" />
        <Button className="[all:revert]" />
        <Button className="[all:revert-layer]" />
        <Button style={{ all: "unset" }} />
        <Button style={{ all: "revert" }} />
        <Button style={{ all: "revert-layer" }} />
        <Button className={styles.unset} />
        <Button className={styles.revert} />
        <Button className={styles.revertLayer} />
      </>;
    `,
    [cssPath]: `
      .unset { all: unset; }
      .revert { all: revert; }
      .revertLayer { all: revert-layer; }
    `,
  });
  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.equal(chrome(result, componentPath).length, 9, JSON.stringify(result.violations));
  assert.deepEqual(chrome(result, cssPath), [], JSON.stringify(result.violations));
});

test("CSS selector facts keep relationship pseudos outside the final subject", async (context) => {
  const componentPath = "src/features/round25-selectors.tsx";
  const cssPath = "src/features/round25-selectors.module.css";
  const rootDir = await createFixture(context, {
    [componentPath]: `
      import { Button } from "@/toolcraft/ui";
      export const Valid = <Button className="flex" />;
    `,
    [cssPath]: `
      .relationship:has(button) { border: 1px solid red; }
      .negated:not(button) { border: 1px solid red; }
      .doubleNegated:not(:not(button)) { border: 1px solid red; }
      :is(.isA, .isB):not(button) { border: 1px solid red; }
      :where(.whereA, .whereB):not(button) { border: 1px solid red; }
    `,
  });
  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.equal(chrome(result, cssPath).length, 1, JSON.stringify(result.violations));
  assert.deepEqual(chrome(result, componentPath), [], JSON.stringify(result.violations));
});
