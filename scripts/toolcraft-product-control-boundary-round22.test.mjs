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

test("public origin survives object and array spreads with destructuring", async (context) => {
  const repoPath = "src/features/round22-spread-origin.tsx";
  const rootDir = await createFixture(context, {
    [repoPath]: `
      import { Button } from "@/toolcraft/ui";
      const base = { Action: Button } as const;
      const registry = { ...base } as const;
      const { Action } = registry;
      const safe = { label: "safe" } as const;
      const registryAfter = { Action: Button, ...safe } as const;
      const { Action: AfterSafeSpread } = registryAfter;
      declare const possible: Partial<{ Action: typeof Button }>;
      const registryPossible = { Action: Button, ...possible } as const;
      const { Action: PossibleAction } = registryPossible;
      const Custom = () => null;
      const registryOverride = { Action: Button, ...{ Action: Custom } } as const;
      const { Action: CustomOverride } = registryOverride;
      const tuple = [Button] as const;
      const copied = [...tuple] as const;
      const [ArrayAction] = copied;
      declare const maybeItems: readonly (typeof Custom)[];
      const possibleArray = [...maybeItems, Button] as const;
      const [PossibleArrayAction] = possibleArray;
      export const Invalid = <>
        <Action className="border">Object</Action>
        <AfterSafeSpread className="opacity-50">After safe spread</AfterSafeSpread>
        <PossibleAction className="shadow-lg">Possible public action</PossibleAction>
        <CustomOverride className="border">Custom override</CustomOverride>
        <ArrayAction className="rounded-none">Array</ArrayAction>
        <PossibleArrayAction className="bg-red-500">Possible array action</PossibleArrayAction>
      </>;
    `,
  });
  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.equal(chrome(result, repoPath).length, 5, JSON.stringify(result.violations));
});

test("rest bindings spread offsets and closed factories preserve public origin", async (context) => {
  const repoPath = "src/features/round22-rest-factory-origin.tsx";
  const rootDir = await createFixture(context, {
    [repoPath]: `
      import { Button } from "@/toolcraft/ui";
      const Custom = () => null;
      const { ...objectRest } = { Custom, Action: Button } as const;
      const { Action } = objectRest;
      const [, ...arrayRest] = [Custom, Button] as const;
      const [RestAction] = arrayRest;
      const spreadThenValue = [...[Custom] as const, Button] as const;
      const [, SpreadAction] = spreadThenValue;
      function makeButton() { return function Closed() { return <Button>Base</Button>; }; }
      const Factory = makeButton();
      export const Invalid = <>
        <Action className="border" />
        <RestAction className="rounded-none" />
        <SpreadAction className="shadow-lg" />
        <Factory className="bg-red-500" />
      </>;
    `,
  });
  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.equal(chrome(result, repoPath).length, 4, JSON.stringify(result.violations));
});

test("forwardRef memo HOCs and factory closures preserve public origin", async (context) => {
  const repoPath = "src/features/round22-wrapper-origin.tsx";
  const rootDir = await createFixture(context, {
    [repoPath]: `
      import { forwardRef, memo } from "react";
      import { Button } from "@/toolcraft/ui";
      const Forward = forwardRef((_props, ref) => <Button ref={ref}>Base</Button>);
      const Memo = memo(Forward);
      function withTelemetry<T>(Component: T): T { return Component; }
      const Hoc = withTelemetry(Button);
      function make(Component: typeof Button) {
        return function Wrapped() { return <Component>Base</Component>; };
      }
      const Factory = make(Button);
      export const Invalid = <>
        <Forward className="border" />
        <Memo className="rounded-none" />
        <Hoc className="shadow-lg" />
        <Factory className="bg-red-500" />
      </>;
    `,
  });
  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.equal(chrome(result, repoPath).length, 4, JSON.stringify(result.violations));
});

test("default namespace object and barrel reexports retain public origin", async (context) => {
  const repoPath = "src/features/round22-reexports.tsx";
  const rootDir = await createFixture(context, {
    "src/features/default-button.ts": `
      export { Button as default } from "@/toolcraft/ui";
    `,
    "src/features/local-default.ts": `
      import { Button } from "@/toolcraft/ui";
      export default Button;
    `,
    "src/features/default-object.ts": `
      import { Button } from "@/toolcraft/ui";
      export default { Action: Button } as const;
    `,
    "src/features/namespace.ts": `
      export * as Controls from "@/toolcraft/ui";
    `,
    "src/features/object.ts": `
      import { Button } from "@/toolcraft/ui";
      export const controls = { Action: Button } as const;
    `,
    "src/features/barrel.ts": `
      export { default as DefaultButton } from "./default-button";
      export { default as LocalDefault } from "./local-default";
      export { default as DefaultObject } from "./default-object";
      export { Controls } from "./namespace";
      export { controls } from "./object";
    `,
    [repoPath]: `
      import { Controls, DefaultButton, DefaultObject, LocalDefault, controls } from "./barrel";
      export const Invalid = <>
        <DefaultButton className="border" />
        <LocalDefault className="bg-red-500" />
        <DefaultObject.Action className="opacity-50" />
        <Controls.Button className="rounded-none" />
        <controls.Action className="shadow-lg" />
      </>;
    `,
  });
  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.equal(chrome(result, repoPath).length, 5, JSON.stringify(result.violations));
});

test("typed spreads use case-sensitive className and style symbols", async (context) => {
  const badPath = "src/features/round22-typed-spread-bad.tsx";
  const cleanPath = "src/features/round22-typed-spread-clean.tsx";
  const rootDir = await createFixture(context, {
    [badPath]: `
      import { Button } from "@/toolcraft/ui";
      declare const bad: { className: "border" };
      export const Invalid = <Button {...bad}>Bad</Button>;
    `,
    [cleanPath]: `
      import { Button } from "@/toolcraft/ui";
      declare const unrelatedCase: { classname: "border"; Style: { color: string } };
      export const Valid = <Button {...unrelatedCase}>Good</Button>;
    `,
  });
  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.equal(chrome(result, badPath).length, 1, JSON.stringify(result.violations));
  assert.deepEqual(chrome(result, cleanPath), [], JSON.stringify(result.violations));
});

test("compositional variants and template branches preserve owned state", async (context) => {
  const repoPath = "src/features/round22-state-grammar.tsx";
  const rootDir = await createFixture(context, {
    [repoPath]: `
      import { Button } from "@/toolcraft/ui";
      declare const compact: boolean;
      export const Invalid = <>
        <Button className="group-invalid:px-2">Invalid</Button>
        <Button className="peer-checked:underline">Checked</Button>
        <Button className="group-focus-visible:mt-2">Focus</Button>
        <Button className="not-checked:gap-2">Not checked</Button>
        <Button className="[text-decoration:none]">Arbitrary decoration</Button>
        <Button className={\`flex \${compact ? "px-2" : "peer-invalid:no-underline"}\`}>
          Template state
        </Button>
      </>;
      export const Valid = <Button className={\`flex \${compact ? "px-2" : "gap-2"}\`}>
        Layout
      </Button>;
    `,
  });
  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.equal(chrome(result, repoPath).length, 6, JSON.stringify(result.violations));
  assert.ok(chrome(result, repoPath).every(({ message }) =>
    !message.includes("unresolved-class")), JSON.stringify(result.violations));
});

test("safe CSS Module classes and exact selector subjects stay clean", async (context) => {
  const componentPath = "src/features/round22-css-module.tsx";
  const cssPath = "src/features/round22-layout.module.css";
  const statePath = "src/features/round22-state.module.css";
  const rootDir = await createFixture(context, {
    [componentPath]: `
      import { Button } from "@/toolcraft/ui";
      import styles from "./round22-layout.module.css";
      export const Valid = <Button className={styles.layout}>Layout</Button>;
    `,
    [cssPath]: `
      .layout { display: flex; gap: 0.5rem; }
      .toolbar button .icon { color: red; }
      .toolbar button + .icon { background: red; }
      .toolbar:has(button) > .icon { opacity: 0.5; }
    `,
    [statePath]: `.toolbar button:is(:hover, :focus-visible) { display: flex; }`,
  });
  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.deepEqual(chrome(result, componentPath), [], JSON.stringify(result.violations));
  assert.deepEqual(chrome(result, cssPath), [], JSON.stringify(result.violations));
  assert.equal(chrome(result, statePath).length, 1, JSON.stringify(result.violations));
});

test("CSS subject properties include text decoration", async (context) => {
  const componentPath = "src/features/round22-anchor.tsx";
  const cssPath = "src/features/round22-anchor.module.css";
  const rootDir = await createFixture(context, {
    [componentPath]: `
      import { Anchor } from "@/toolcraft/ui";
      export const Invalid = <Anchor style={{ textDecoration: "none" }}>Docs</Anchor>;
    `,
    [cssPath]: `.links > a { text-decoration: none; }`,
  });
  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.equal(chrome(result, componentPath).length, 1, JSON.stringify(result.violations));
  assert.equal(chrome(result, cssPath).length, 1, JSON.stringify(result.violations));
});

test("raw markup rejects universal action attributes", async (context) => {
  const repoPath = "src/features/round22-raw-actions.tsx";
  const rootDir = await createFixture(context, {
    [repoPath]: `
      export const Role = <div dangerouslySetInnerHTML={{ __html:
        "<div role='button'>Run</div>" }} />;
      export const Tab = <div dangerouslySetInnerHTML={{ __html:
        "<span tabindex='0'>Run</span>" }} />;
      export const Edit = <div dangerouslySetInnerHTML={{ __html:
        "<p contenteditable>Change</p>" }} />;
      export const Event = <div dangerouslySetInnerHTML={{ __html:
        "<img onerror='run()'>" }} />;
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

test("external wrapper arguments and properties retain DOM evidence", async (context) => {
  const repoPath = "src/features/round22-external-wrapper.ts";
  const rootDir = await createFixture(context, {
    "node_modules/dom-box/package.json": JSON.stringify({
      name: "dom-box",
      types: "index.d.ts",
      version: "1.0.0",
    }),
    "node_modules/dom-box/index.d.ts": `
      export interface DomBox<T> { readonly current: T; }
      export interface PropertyBox { readonly current: Document; }
      export interface WidePropertyBox {
        readonly a: string; readonly b: string; readonly c: string;
        readonly d: string; readonly e: string; readonly f: string;
        readonly g: string; readonly h: string; readonly i: string;
        readonly current: Document;
      }
    `,
    [repoPath]: `
      import type { DomBox, PropertyBox, WidePropertyBox } from "dom-box";
      type Shape = { createElement(name: string): unknown };
      declare const generic: DomBox<Document>;
      declare const property: PropertyBox;
      declare const wide: WidePropertyBox;
      const erasedGeneric: DomBox<Shape> = generic;
      const erasedProperty: { current: Shape } = property;
      const erasedWide: { current: Shape } = wide;
      void erasedGeneric; void erasedProperty; void erasedWide;
    `,
  });
  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.equal(
    violationsFor(result, repoPath, "native-control-recreation").length,
    3,
    JSON.stringify(result.violations),
  );
});
