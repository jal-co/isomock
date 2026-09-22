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

test("public origin survives literal containers destructure memo and HOCs", async (context) => {
  const repoPath = "src/features/round21-origin.tsx";
  const rootDir = await createFixture(context, {
    [repoPath]: `
      import { memo } from "react";
      import { Anchor, Button } from "@/toolcraft/ui";
      const registry = { nested: { Action: Button } } as const;
      const { nested: { Action } } = registry;
      const tuple = [Anchor, Button] as const;
      const [Link, TupleAction] = tuple;
      const MemoAction = memo(Button);
      function withTelemetry<T>(Component: T): T { return Component; }
      const HocAction = withTelemetry(Button);
      export const Invalid = <>
        <Action className="border">Object</Action>
        <Link className="rounded-none">Array</Link>
        <TupleAction className="shadow-lg">Tuple</TupleAction>
        <MemoAction className="bg-red-500">Memo</MemoAction>
        <HocAction className="opacity-50">HOC</HocAction>
      </>;
    `,
  });
  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.equal(
    violationsFor(result, repoPath, "public-component-chrome").length,
    5,
    JSON.stringify(result.violations),
  );
});

test("opaque renderable results do not inherit unrelated argument origin", async (context) => {
  const repoPath = "src/features/round21-possible-origin.tsx";
  const rootDir = await createFixture(context, {
    [repoPath]: `
      import type { ComponentType } from "react";
      import { Button } from "@/toolcraft/ui";
      declare function uncertain<T>(component: T): ComponentType<{ className?: string }>;
      const PossibleButton = uncertain(Button);
      const Custom = (_props: { className?: string }) => null;
      const PossibleCustom = uncertain(Custom);
      const metadata = uncertain(Button);
      export const Render = <>
        <PossibleButton className="border" />
        <PossibleCustom className="border" />
      </>;
      void metadata;
    `,
  });
  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.equal(
    violationsFor(result, repoPath, "public-component-chrome").length,
    0,
    JSON.stringify(result.violations),
  );
});

test("public components own inline visual style and ordered unknowns", async (context) => {
  const repoPath = "src/features/round21-inline-style.tsx";
  const rootDir = await createFixture(context, {
    [repoPath]: `
      import { Anchor, Button } from "@/toolcraft/ui";
      declare const dynamicStyle: React.CSSProperties;
      declare const props: object;
      export const Invalid = <>
        <Button style={{ border: 0, borderRadius: 0, background: "red",
          color: "white", boxShadow: "none", opacity: 0.5 }}>Run</Button>
        <Anchor style={dynamicStyle}>Docs</Anchor>
      </>;
      export const Valid = <>
        <Button style={{ display: "flex", width: "100%", marginInline: 4 }}>Run</Button>
        <Button {...props} className="flex" style={{ display: "flex", paddingInline: 8 }}>Save</Button>
      </>;
    `,
  });
  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.equal(
    violationsFor(result, repoPath, "public-component-chrome").length,
    2,
    JSON.stringify(result.violations),
  );
});

test("finite Tailwind chrome and state namespaces stay owned", async (context) => {
  const repoPath = "src/features/round21-tailwind.tsx";
  const rootDir = await createFixture(context, {
    [repoPath]: `
      import { Button } from "@/toolcraft/ui";
      export const Invalid = <>
        <Button className="shadow-lg bg-red-500 text-red-500 opacity-50">One</Button>
        <Button className="aria-busy:px-2 data-active:gap-2 enabled:mt-2 not-disabled:ml-2">Two</Button>
      </>;
      export const Valid = <Button className="flex w-full gap-2 px-3 text-sm font-medium leading-5">
        Layout
      </Button>;
    `,
  });
  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.equal(
    violationsFor(result, repoPath, "public-component-chrome").length,
    2,
    JSON.stringify(result.violations),
  );
});

test("symbol-proven clsx and cn composition resolve finite class trees", async (context) => {
  const repoPath = "src/features/round21-class-composition.tsx";
  const rootDir = await createFixture(context, {
    [repoPath]: `
      import clsx from "clsx";
      import { Button } from "@/toolcraft/ui";
      const cn = clsx;
      declare const compact: boolean;
      export const Invalid = <Button className={clsx("flex", ["border"])}>Bad</Button>;
      export const Valid = <Button className={cn(
        "flex gap-2",
        compact && "px-2 text-sm",
        { "w-full": true, "font-medium": compact },
      )}>Good</Button>;
    `,
  });
  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.equal(
    violationsFor(result, repoPath, "public-component-chrome").length,
    1,
    JSON.stringify(result.violations),
  );
});

test("CSS Modules cannot restyle standard button or anchor chrome", async (context) => {
  const buttonPath = "src/features/round21-button.module.css";
  const anchorPath = "src/features/round21-anchor.module.css";
  const cleanPath = "src/features/round21-layout.module.css";
  const rootDir = await createFixture(context, {
    [buttonPath]: `.toolbar > button { border: 0; background: red; color: white; }`,
    [anchorPath]: `.links a:hover { padding-inline: 0.5rem; }`,
    [cleanPath]: `.layout > button { display: flex; margin-inline: 1rem; font-size: 0.875rem; }`,
  });
  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.equal(violationsFor(result, buttonPath, "public-component-chrome").length, 1,
    JSON.stringify(result.violations));
  assert.equal(violationsFor(result, anchorPath, "public-component-chrome").length, 1,
    JSON.stringify(result.violations));
  assert.deepEqual(violationsFor(result, cleanPath), [], JSON.stringify(result.violations));
});

test("raw markup uses the complete semantic host policy and decodes entities", async (context) => {
  const repoPath = "src/features/round21-raw-markup.tsx";
  const rootDir = await createFixture(context, {
    [repoPath]: `
      export const Audio = <div dangerouslySetInnerHTML={{ __html:
        "<audio controls></audio>" }} />;
      export const Anchor = <div dangerouslySetInnerHTML={{ __html:
        "<a href='/docs'>Docs</a>" }} />;
      export const Details = <div dangerouslySetInnerHTML={{ __html:
        "<details open><summary>More</summary></details>" }} />;
      export const Encoded = <div dangerouslySetInnerHTML={{ __html:
        "&lt;button type='button'&gt;Run&lt;/button&gt;" }} />;
      export const Srcdoc = <div dangerouslySetInnerHTML={{ __html:
        '<iframe srcdoc="&lt;button type=&quot;button&quot;&gt;Run&lt;/button&gt;"></iframe>'
      }} />;
      export const Plain = <div dangerouslySetInnerHTML={{ __html:
        "<strong>Read-only information</strong>" }} />;
    `,
  });
  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.equal(
    violationsFor(result, repoPath, "raw-control-markup").length,
    5,
    JSON.stringify(result.violations),
  );
});
