import assert from "node:assert/strict";
import test from "node:test";

import { evaluateToolcraftProductBoundary } from
  "./toolcraft-product-boundary.mjs";
import { createToolcraftProductBoundaryFixture as createFixture } from
  "./toolcraft-product-boundary-test-fixtures.mjs";

function violations(result, repoPath) {
  return result.violations.filter((violation) =>
    violation.repoPath === repoPath && violation.kind === "public-component-chrome"
  );
}

async function run(context, sources) {
  return evaluateToolcraftProductBoundary({
    rootDir: await createFixture(context, sources),
  });
}

test("product object copying executes enumerable getters once in authored order", async (context) => {
  const safe = "src/features/round33-product-copy-data.tsx";
  const spread = "src/features/round33-product-copy-spread.tsx";
  const assign = "src/features/round33-product-copy-assign.tsx";
  const danger = (operation) => `import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" }; let phase = 0;
    const source = { get first() { phase += 1; return 1; }, get second() {
      if (phase === 1) props.className = "border"; return 2; } }; ${operation}
    export const Case = <Button {...props} />;`;
  const result = await run(context, {
    [safe]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; const copy = { ...{ value: 1 } };
      void copy; export const Case = <Button {...props} />;`,
    [spread]: danger("const copy = { ...source }; void copy;"),
    [assign]: danger("Object.assign({}, source);"),
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, spread).length, 1, JSON.stringify(result.violations));
  assert.equal(violations(result, assign).length, 1, JSON.stringify(result.violations));
});

test("product defineProperty value get and set descriptors preserve behavior", async (context) => {
  const safe = "src/features/round33-product-descriptor-safe.tsx";
  const getter = "src/features/round33-product-descriptor-get.tsx";
  const setter = "src/features/round33-product-descriptor-set.tsx";
  const result = await run(context, {
    [safe]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; const owner = {};
      Object.defineProperty(owner, "value", { value: 1 }); void owner;
      export const Case = <Button {...props} />;`,
    [getter]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; const owner: Record<string, unknown> = {};
      Object.defineProperty(owner, "run", { get() { return () => {
        props.className = "border"; }; } }); (owner.run as () => void)();
      export const Case = <Button {...props} />;`,
    [setter]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; const owner: Record<string, unknown> = {};
      Object.defineProperty(owner, "value", { set(value: unknown) {
        if (value === "border") props.className = "border"; } });
      Object.assign(owner, { value: "border" });
      export const Case = <Button {...props} />;`,
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, getter).length, 1, JSON.stringify(result.violations));
  assert.equal(violations(result, setter).length, 1, JSON.stringify(result.violations));
});

test("product dynamic computed keys retain correlated dangerous alternatives", async (context) => {
  const safe = "src/features/round33-product-dynamic-inert.tsx";
  const literal = "src/features/round33-product-dynamic-literal.tsx";
  const descriptor = "src/features/round33-product-dynamic-descriptor.tsx";
  const result = await run(context, {
    [safe]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; const owner = { other() {} };
      void owner; export const Case = <Button {...props} />;`,
    [literal]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; declare const choose: boolean;
      const owner = { [choose ? "run" : "other"]: choose ? () => {
        props.className = "border"; } : () => {} }; owner.run?.();
      export const Case = <Button {...props} />;`,
    [descriptor]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; declare const key: "call" | "other";
      function owner() {} Object.defineProperty(owner, key, { get() {
        return (value: string) => { props.className = value; }; } });
      owner.call("border"); export const Case = <Button {...props} />;`,
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, literal).length, 1, JSON.stringify(result.violations));
  assert.equal(violations(result, descriptor).length, 1, JSON.stringify(result.violations));
});

test("product abrupt literal children cannot execute later mutations", async (context) => {
  const safe = "src/features/round33-product-abrupt-literal.tsx";
  const danger = "src/features/round33-product-normal-literal.tsx";
  const source = (key) => `import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" }; function stop(): string {
      throw new Error("stop"); } try { const owner = { [${key}]: 0,
      later: (props.className = "border") }; void owner; } catch {}
    export const Case = <Button {...props} />;`;
  const result = await run(context, {
    [safe]: source("stop()"),
    [danger]: source('"first"'),
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
});

test("product spread calls use the evaluated positional value", async (context) => {
  const safe = "src/features/round33-product-spread-inert.tsx";
  const danger = "src/features/round33-product-spread-result.tsx";
  const source = (invoke) => `import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" }; function mutate(target: typeof props) {
      target.className = "border"; } function values() { return [props] as const; }
    ${invoke} export const Case = <Button {...props} />;`;
  const result = await run(context, {
    [safe]: source("void values;"),
    [danger]: source("mutate(...values());"),
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
});

test("product named classes and constructor return categories preserve flow", async (context) => {
  const safe = "src/features/round33-product-class-return-safe.tsx";
  const named = "src/features/round33-product-class-name.tsx";
  const returned = "src/features/round33-product-class-undefined.tsx";
  const result = await run(context, {
    [safe]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; class Base {} class Derived extends Base {
        constructor() { super(); return 1 as never; } } try { new Derived(); } catch {}
      export const Case = <Button {...props} />;`,
    [named]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; const Alias = class Hidden {
        static run() { props.className = "border"; }
        static invoke() { Hidden.run(); } }; Alias.invoke();
      export const Case = <Button {...props} />;`,
    [returned]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; class Base {} class Derived extends Base {
        constructor() { super(); return undefined as never; }
        run() { props.className = "border"; } } new Derived().run();
      export const Case = <Button {...props} />;`,
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, named).length, 1, JSON.stringify(result.violations));
  assert.equal(violations(result, returned).length, 1, JSON.stringify(result.violations));
});

test("product static phases this binding and empty-field shadowing are exact", async (context) => {
  const safe = "src/features/round33-product-empty-shadow.tsx";
  const phase = "src/features/round33-product-static-phase.tsx";
  const bound = "src/features/round33-product-static-this.tsx";
  const result = await run(context, {
    [safe]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; class Base { run() {
        props.className = "border"; } } class Derived extends Base { run: undefined; }
      new Derived().run?.(); export const Case = <Button {...props} />;`,
    [phase]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; class Active {
        static value = Active.run(); static run() { props.className = "border"; } }
      void Active; export const Case = <Button {...props} />;`,
    [bound]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; class Active { static target = props;
        static run() { this.target.className = "border"; }
        static { this.run(); } } void Active;
      export const Case = <Button {...props} />;`,
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, phase).length, 1, JSON.stringify(result.violations));
  assert.equal(violations(result, bound).length, 1, JSON.stringify(result.violations));
});

test("product external super callbacks and parenthesized optional arguments preserve effects", async (context) => {
  const safe = "src/features/round33-product-optional-continuous.tsx";
  const external = "src/features/round33-product-external-super.tsx";
  const optional = "src/features/round33-product-optional-argument.tsx";
  const result = await run(context, {
    [safe]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; const missing: undefined = undefined;
      missing?.(props.className = "border");
      export const Case = <Button {...props} />;`,
    [external]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; declare class ExternalBase {
        constructor(callback: () => void); } class Derived extends ExternalBase {
        constructor() { super(() => { props.className = "border"; }); } }
      new Derived(); export const Case = <Button {...props} />;`,
    [optional]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; const missing: undefined = undefined;
      try { (missing?.())(props.className = "border"); } catch {}
      export const Case = <Button {...props} />;`,
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, external).length, 1, JSON.stringify(result.violations));
  assert.equal(violations(result, optional).length, 1, JSON.stringify(result.violations));
});
