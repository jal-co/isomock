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

test("callable aliases and adapters preserve exact returned component origin", async (context) => {
  const repoPath = "src/features/round24-callable-positive.tsx";
  const rootDir = await createFixture(context, {
    [repoPath]: `
      import { Button } from "@/toolcraft/ui";
      const Custom = () => null;
      type Component = typeof Button | typeof Custom;
      function identity(View: Component) { return View; }
      function choose(_ignored: Component, selected: Component) { return selected; }
      function fromRest(...views: Component[]) { return views[1]; }
      function factory(View: Component) { return () => View; }
      function fromDefault({ View = Button }: { View?: Component } = {}) {
        return View;
      }
      function nestedDefault({ config: { View = Button } }: {
        config: { View?: Component }
      }) { return View; }
      const alias = identity;
      const Alias = alias(Button);
      const Applied = identity.apply(undefined, [Button]);
      const callAlias = identity.call;
      const CalledAlias = callAlias(undefined, Button);
      const { call: destructuredCall } = identity;
      const DestructuredCalled = destructuredCall(undefined, Button);
      const applyAlias = identity.apply;
      const AppliedAlias = applyAlias(undefined, [Button]);
      const bindAlias = identity.bind;
      const BoundAlias = bindAlias(undefined, Button);
      const SelectedAlias = BoundAlias();
      const Bound = choose.bind(undefined, Custom, Button);
      const Selected = Bound();
      const Rest = fromRest(Custom, Button);
      const Factory = factory(Button);
      const Chained = Factory();
      const Defaulted = fromDefault({});
      const NestedDefaulted = nestedDefault({ config: {} });
      declare const maybe: { View?: Component };
      const Possible = fromDefault(maybe);
      export const Invalid = <>
        <Alias className="border" />
        <Applied className="rounded-none" />
        <CalledAlias className="bg-red-500" />
        <DestructuredCalled className="border-0" />
        <AppliedAlias className="shadow-lg" />
        <SelectedAlias className="opacity-50" />
        <Selected className="bg-red-500" />
        <Rest className="shadow-lg" />
        <Chained className="opacity-50" />
        <Defaulted className="border-0" />
        <NestedDefaulted className="rounded-none" />
        <Possible className="text-red-500" />
      </>;
    `,
  });
  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.equal(chrome(result, repoPath).length, 12, JSON.stringify(result.violations));
});

test("present defaults ignored call arguments and opaque results stay clean", async (context) => {
  const repoPath = "src/features/round24-callable-negative.tsx";
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
      function fromDefault({ View = Button }: { View?: Component }) { return View; }
      function nestedDefault({ config: { View = Button } }: {
        config: { View?: Component }
      }) { return View; }
      const ViaCall = choose.call(undefined, Button, Custom);
      const ViaApply = choose.apply(undefined, [Button, Custom]);
      const Present = fromDefault({ View: Custom });
      const NestedPresent = nestedDefault({ config: { View: Custom } });
      const Opaque = discard(Button);
      export const Valid = <>
        <ViaCall className="border" />
        <ViaApply className="rounded-none" />
        <Present className="bg-red-500" />
        <NestedPresent className="opacity-50" />
        <Opaque className="shadow-lg" />
      </>;
    `,
  });
  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.deepEqual(chrome(result, repoPath), [], JSON.stringify(result.violations));
});

test("CSS Module facts own neutralizers composition and applicability", async (context) => {
  const componentPath = "src/features/round24-css.tsx";
  const localPath = "src/features/round24-css.module.css";
  const remotePath = "src/features/round24-remote.module.css";
  const rootDir = await createFixture(context, {
    [componentPath]: `
      import { Button } from "@/toolcraft/ui";
      import styles from "./round24-css.module.css";
      export const Invalid = <>
        <Button className={styles.borderNone} />
        <Button className={styles.borderZero} />
        <Button className={styles.backgroundNone} />
        <Button className={styles.resetAll} />
        <Button className={styles.localComposed} />
        <Button className={styles.remoteComposed} />
        <Button className={styles.missing} />
      </>;
      export const Valid = <>
        <Button className={styles.anchorOnly} />
        <Button className={styles.anchorCompositionOnly} />
      </>;
    `,
    [localPath]: `
      .borderNone { border: none; }
      .borderZero { border: 0; }
      .backgroundNone { background: none; }
      .resetAll { all: unset; display: flex; }
      .danger { border-radius: 0; }
      .localComposed { composes: danger; display: flex; }
      .remoteComposed { composes: remoteDanger from "./round24-remote.module.css"; }
      .anchorOnly:not(button) { border: 1px solid red; }
      .anchorCompositionOnly:not(button) { composes: danger; }
      .anchorCompositionOnly { display: flex; }
    `,
    [remotePath]: `.remoteDanger { box-shadow: none; }`,
  });
  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.equal(chrome(result, componentPath).length, 7, JSON.stringify(result.violations));
  assert.deepEqual(chrome(result, localPath), [], JSON.stringify(result.violations));
  assert.deepEqual(chrome(result, remotePath), [], JSON.stringify(result.violations));
});

test("raw markup object facts reduce computed keys and spreads in order", async (context) => {
  const repoPath = "src/features/round24-raw.tsx";
  const rootDir = await createFixture(context, {
    [repoPath]: `
      const dangerous = { __html: "<button>Bad</button>" };
      const safe = { __html: "<strong>Fine</strong>" };
      const __html = "<a href='/bad'>Bad</a>";
      declare const unknown: Record<string, unknown>;
      export const OverriddenBySpread = <div dangerouslySetInnerHTML={{
        __html: safe.__html, ...dangerous
      }} />;
      export const Computed = <div dangerouslySetInnerHTML={{
        ["__html"]: "<input type='text'>"
      }} />;
      export const Shorthand = <div dangerouslySetInnerHTML={{ __html }} />;
      export const UnknownOverride = <div dangerouslySetInnerHTML={{
        __html: safe.__html, ...unknown
      }} />;
      export const Restored = <div dangerouslySetInnerHTML={{
        ...unknown, __html: safe.__html
      }} />;
      export const DirectRestored = <div dangerouslySetInnerHTML={{
        ...dangerous, __html: safe.__html
      }} />;
    `,
  });
  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.equal(
    violationsFor(result, repoPath, "raw-control-markup").length,
    4,
    JSON.stringify(result.violations),
  );
});
