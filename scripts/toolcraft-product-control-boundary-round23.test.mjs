import assert from "node:assert/strict";
import test from "node:test";

import { evaluateToolcraftProductBoundary } from
  "./toolcraft-product-boundary.mjs";
import { createToolcraftProductBoundaryFixture as createFixture } from
  "./toolcraft-product-boundary-test-fixtures.mjs";

function violationsFor(result, repoPath, kind) {
  return result.violations.filter((violation) =>
    violation.repoPath === repoPath && (!kind || violation.kind === kind)
  );
}

function chrome(result, repoPath) {
  return violationsFor(result, repoPath, "public-component-chrome");
}

test("local callable returns substitute actual component arguments", async (context) => {
  const repoPath = "src/features/round23-origin-positive.tsx";
  const rootDir = await createFixture(context, {
    "src/features/round23-origin-leaf.ts": `
      export { Button as NestedButton } from "@/toolcraft/ui";
    `,
    "src/features/round23-origin-barrel-a.ts": `
      export { NestedButton } from "./round23-origin-leaf";
    `,
    "src/features/round23-origin-barrel-b.ts": `
      export * from "./round23-origin-barrel-a";
    `,
    [repoPath]: `
      import { Button } from "@/toolcraft/ui";
      import { NestedButton } from "./round23-origin-barrel-b";
      const Custom = () => null;
      type Component = typeof Button | typeof Custom;
      function choose(_ignored: Component, selected: Component) {
        return selected;
      }
      function capture(View: Component) {
        return function Captured() { return <View>Captured</View>; };
      }
      function nested({ items: [, View] }: {
        items: readonly [typeof Custom, typeof Button]
      }) { return View; }
      const Selected = choose(Custom, Button);
      const Captured = capture(Button);
      const Nested = nested({ items: [Custom, Button] as const });
      export const Invalid = <>
        <Selected className="border" />
        <Captured className="rounded-none" />
        <Nested className="shadow-lg" />
        <NestedButton className="bg-red-500" />
      </>;
    `,
  });
  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.equal(chrome(result, repoPath).length, 4, JSON.stringify(result.violations));
});

test("ignored public arguments do not taint unrelated callable results", async (context) => {
  const repoPath = "src/features/round23-origin-negative.tsx";
  const rootDir = await createFixture(context, {
    [repoPath]: `
      import { Button } from "@/toolcraft/ui";
      const Custom = () => null;
      type Component = typeof Button | typeof Custom;
      function choose(ignored: Component, selected: Component) {
        void ignored;
        return selected;
      }
      function ignore(View: Component) {
        void View;
        return function Plain() { return <div>Plain</div>; };
      }
      const Selected = choose(Button, Custom);
      const Plain = ignore(Button);
      export const Valid = <>
        <Selected className="border" />
        <Plain className="rounded-none" />
      </>;
    `,
  });
  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.deepEqual(chrome(result, repoPath), [], JSON.stringify(result.violations));
});

test("referenced CSS Module classes carry exact ordered chrome facts", async (context) => {
  const componentPath = "src/features/round23-css-facts.tsx";
  const cssPath = "src/features/round23-css-facts.module.css";
  const rootDir = await createFixture(context, {
    [componentPath]: `
      import { Button } from "@/toolcraft/ui";
      import styles from "./round23-css-facts.module.css";
      export const Invalid = <Button className={styles.danger}>Bad</Button>;
      export const Missing = <Button className={styles.missing}>Missing</Button>;
      export const Valid = <Button className={styles.layout}>Good</Button>;
    `,
    [cssPath]: `
      .danger { border: 1px solid red; }
      .unused { border-radius: 0; }
      .layout { display: flex; gap: 0.5rem; font-weight: 600; }
    `,
  });
  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.equal(chrome(result, componentPath).length, 2, JSON.stringify(result.violations));
  assert.deepEqual(chrome(result, cssPath), [], JSON.stringify(result.violations));
});

test("canonical local class composition and finite templates stay clean", async (context) => {
  const componentPath = "src/features/round23-css-helper.tsx";
  const cssPath = "src/features/round23-css-helper.module.css";
  const rootDir = await createFixture(context, {
    [componentPath]: `
      import clsx from "clsx";
      import { twMerge } from "tailwind-merge";
      import { Button } from "@/toolcraft/ui";
      import styles from "./round23-css-helper.module.css";
      const cn = (...values: unknown[]) => twMerge(clsx(values));
      declare const spacing: "gap-2" | "gap-4";
      export const Valid = <>
        <Button className={cn(styles.layout, "flex px-2")} />
        <Button className={${"`"}flex ${"${spacing}"}${"`"}} />
        <Button className="aria-label:px-2 data-testid:flex" />
      </>;
    `,
    [cssPath]: `.layout { display: flex; gap: 0.5rem; }`,
  });
  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.deepEqual(chrome(result, componentPath), [], JSON.stringify(result.violations));
});

test("selector subjects and inline styles respect ordered evidence", async (context) => {
  const componentPath = "src/features/round23-ordered-style.tsx";
  const dangerousCss = "src/features/round23-double-not.module.css";
  const cleanCss = "src/features/round23-descriptive.module.css";
  const rootDir = await createFixture(context, {
    [componentPath]: `
      import { Button } from "@/toolcraft/ui";
      const bad = { border: "1px solid red" } as const;
      const restored = { ...bad, border: undefined };
      const replaced = { border: undefined, ...bad };
      export const Valid = <Button style={restored}>Good</Button>;
      export const Invalid = <Button style={replaced}>Bad</Button>;
    `,
    [dangerousCss]: `.action:not(:not(button)) { border: 1px solid red; }`,
    [cleanCss]: `
      .action:not(button) { display: flex; }
      .action button[aria-label] { display: flex; }
      .action button[data-testid] { display: flex; }
      .action:has(button) { display: flex; }
    `,
  });
  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.equal(chrome(result, componentPath).length, 1, JSON.stringify(result.violations));
  assert.equal(chrome(result, dangerousCss).length, 1, JSON.stringify(result.violations));
  assert.deepEqual(chrome(result, cleanCss), [], JSON.stringify(result.violations));
});

test("raw markup rejects style link and document-global injection", async (context) => {
  const repoPath = "src/features/round23-raw-injection.tsx";
  const rootDir = await createFixture(context, {
    [repoPath]: `
      export const StyleTag = <div dangerouslySetInnerHTML={{ __html:
        "<style>.x{color:red}</style>" }} />;
      export const LinkTag = <div dangerouslySetInnerHTML={{ __html:
        "<link rel='stylesheet' href='/theme.css'>" }} />;
      export const GlobalTag = <div dangerouslySetInnerHTML={{ __html:
        "&lt;body&gt;replace&lt;/body&gt;" }} />;
      export const Inline = <div dangerouslySetInnerHTML={{ __html:
        "<span style='color:red'>replace</span>" }} />;
      export const Plain = <div dangerouslySetInnerHTML={{ __html:
        "<strong data-label='info'>Read only</strong>" }} />;
    `,
  });
  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.equal(
    violationsFor(result, repoPath, "raw-control-markup").length,
    4,
    JSON.stringify(result.violations),
  );
});

test("product retains ambient DOM erasure without a lexical authority owner", async (context) => {
  const repoPath = "src/features/round23-ambient-dom.ts";
  const rootDir = await createFixture(context, {
    [repoPath]: `
      const leaked: unknown = document.querySelector("button");
      const asserted: unknown = document.body as unknown;
      void leaked; void asserted;
    `,
  });
  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.equal(
    violationsFor(result, repoPath, "native-control-recreation").length,
    2,
    JSON.stringify(result.violations),
  );
});
