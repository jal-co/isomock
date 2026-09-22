import assert from "node:assert/strict";
import test from "node:test";
import { evaluateToolcraftProductBoundary } from "./toolcraft-product-boundary.mjs";
import { createToolcraftProductBoundaryFixture } from "./toolcraft-product-boundary-test-fixtures.mjs";

test("composed class text preserves opaque mutation instead of restoring lexical literals", async (context) => {
  const files = Object.fromEntries([
    ["direct", "theme.className"],
    ["template", "`flex ${theme.className}`"],
    ["concatenated", "'flex ' + theme.className"],
    ["nested", "`flex ${'' + theme.className}`"],
  ].map(([name, expression]) => [`src/features/${name}.tsx`, `
    import { Button } from "@/toolcraft/ui";
    declare function mutate(value: unknown): void;
    const theme = { className: "gap-2" };
    mutate(theme);
    export const Case = <Button className={${expression}} />;
  `]));
  const rootDir = await createToolcraftProductBoundaryFixture(context, files);
  const result = await evaluateToolcraftProductBoundary({ rootDir });
  for (const repoPath of Object.keys(files)) {
    const violations = result.violations.filter((violation) =>
      violation.repoPath === repoPath && violation.kind === "public-component-chrome"
    );
    assert.equal(violations.length, 1, JSON.stringify({ repoPath, violations }));
    assert.match(violations[0].message, /unresolved-class/u);
  }
});

test("composed class text uses the final executed value and retains finite declarations", async (context) => {
  const repoPath = "src/features/composed-classes.tsx";
  const rootDir = await createToolcraftProductBoundaryFixture(context, {
    [repoPath]: `
      import { Button } from "@/toolcraft/ui";
      const theme = { className: "border" };
      theme.className = "gap-2";
      declare const spacing: "gap-2" | "gap-4";
      export const Cases = <>
        <Button className={\`flex \${theme.className}\`} />
        <Button className={'flex ' + theme.className} />
        <Button className={\`flex \${spacing}\`} />
      </>;
    `,
  });
  const result = await evaluateToolcraftProductBoundary({ rootDir });
  assert.deepEqual(result.violations.filter((violation) =>
    violation.repoPath === repoPath && violation.kind === "public-component-chrome"
  ), [], JSON.stringify(result.violations));
});

test("computed CSS module and class-helper keys retain opaque reference authority", async (context) => {
  const repoPath = "src/features/computed-classes.tsx";
  const rootDir = await createToolcraftProductBoundaryFixture(context, {
    [repoPath]: `
      import clsx from "clsx";
      import { Button } from "@/toolcraft/ui";
      import styles from "./classes.module.css";
      declare function mutate(value: unknown): void;
      const theme = { moduleKey: "layout", classKey: "gap-2" };
      mutate(theme);
      export const Cases = <>
        <Button className={styles[theme.moduleKey]} />
        <Button className={clsx({ [theme.classKey]: true })} />
      </>;
    `,
    "src/features/classes.module.css": ".layout { display: flex; }",
  });
  const result = await evaluateToolcraftProductBoundary({ rootDir });
  const violations = result.violations.filter((violation) =>
    violation.repoPath === repoPath && violation.kind === "public-component-chrome"
  );
  assert.equal(violations.length, 2, JSON.stringify(result.violations));
  assert.ok(violations.every(({ message }) => message.includes("unresolved-class")));
});
