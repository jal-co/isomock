import assert from "node:assert/strict";
import test from "node:test";

import { evaluateToolcraftProductBoundary } from
  "./toolcraft-product-boundary.mjs";
import { createToolcraftProductBoundaryFixture as createFixture } from
  "./toolcraft-product-boundary-test-fixtures.mjs";

function chromeViolations(result, repoPath) {
  return result.violations.filter((violation) =>
    violation.repoPath === repoPath &&
    violation.kind === "public-component-chrome"
  );
}

function nativeViolations(result, repoPath) {
  return result.violations.filter((violation) =>
    violation.repoPath === repoPath &&
    violation.kind === "native-control-recreation"
  );
}

test("ordered JSX expressions execute before later product targets", async (context) => {
  const repoPath = "src/features/round28-jsx-order.tsx";
  const rootDir = await createFixture(context, {
    [repoPath]: `
      import { Button } from "@/toolcraft/ui";
      let className = "border";
      const Earlier = <Button id={(className = "flex", "safe")} />;
      export const Safe = <Button className={className} />;
      void Earlier;
    `,
  });
  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.deepEqual(chromeViolations(result, repoPath), [],
    JSON.stringify(result.violations));
});

test("computed callees execute before invocation arguments", async (context) => {
  const repoPath = "src/features/round28-computed-callee.tsx";
  const rootDir = await createFixture(context, {
    [repoPath]: `
      import { Button } from "@/toolcraft/ui";
      let className = "border";
      const api = { run() {} };
      function select() { className = "flex"; return "run"; }
      api[select()]();
      export const Safe = <Button className={className} />;
    `,
  });
  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.deepEqual(chromeViolations(result, repoPath), [],
    JSON.stringify(result.violations));
});

test("JSX host cuts do not execute attributes after the host", async (context) => {
  const repoPath = "src/features/round28-jsx-host-cut.tsx";
  const rootDir = await createFixture(context, {
    [repoPath]: `
      import { Button } from "@/toolcraft/ui";
      import type { ElementType } from "react";
      const Custom = () => null;
      let Component: ElementType = Custom;
      export const Safe = <Component
        id={(Component = Button, "later")}
        className="border"
      />;
    `,
  });
  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.deepEqual(chromeViolations(result, repoPath), [],
    JSON.stringify(result.violations));
});

test("unary reads preserve safe local identities", async (context) => {
  const repoPath = "src/features/round28-unary-read.tsx";
  const rootDir = await createFixture(context, {
    [repoPath]: `
      import { Button } from "@/toolcraft/ui";
      let className = "flex";
      void !className;
      export const Safe = <Button className={className} />;
    `,
  });
  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.deepEqual(chromeViolations(result, repoPath), [],
    JSON.stringify(result.violations));
});

test("tagged templates execute their tag before later targets", async (context) => {
  const repoPath = "src/features/round28-tagged-template.tsx";
  const rootDir = await createFixture(context, {
    [repoPath]: `
      import { Button } from "@/toolcraft/ui";
      let className = "border";
      function tag() { className = "flex"; return "safe"; }
      tag\`value\`;
      export const Safe = <Button className={className} />;
    `,
  });
  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.deepEqual(chromeViolations(result, repoPath), [],
    JSON.stringify(result.violations));
});

test("direct invocation spreads preserve positional arguments", async (context) => {
  const repoPath = "src/features/round28-direct-spread.tsx";
  const rootDir = await createFixture(context, {
    [repoPath]: `
      import { Button } from "@/toolcraft/ui";
      import type { ElementType } from "react";
      function render(Component: ElementType) {
        return <Component className="border" />;
      }
      const args = [Button] as const;
      export const Case = render(...args);
    `,
  });
  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.equal(chromeViolations(result, repoPath).length, 1,
    JSON.stringify(result.violations));
});

test("new expressions execute local constructor effects", async (context) => {
  const repoPath = "src/features/round28-new-expression.tsx";
  const rootDir = await createFixture(context, {
    [repoPath]: `
      import { Button } from "@/toolcraft/ui";
      let className = "border";
      class Restore {
        constructor() { className = "flex"; }
      }
      new Restore();
      export const Safe = <Button className={className} />;
    `,
  });
  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.deepEqual(chromeViolations(result, repoPath), [],
    JSON.stringify(result.violations));
});

test("bind captures argument identities at bind time", async (context) => {
  const repoPath = "src/features/round28-bind-capture.tsx";
  const rootDir = await createFixture(context, {
    [repoPath]: `
      import { Button } from "@/toolcraft/ui";
      import type { ElementType } from "react";
      const Custom = () => null;
      function render(Component: ElementType) {
        return <Component className="border" />;
      }
      let Component: ElementType = Button;
      const pending = render.bind(undefined, Component);
      Component = Custom;
      export const Case = pending();
    `,
  });
  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.equal(chromeViolations(result, repoPath).length, 1,
    JSON.stringify(result.violations));
});

test("boolean JSX attributes remain inert ordered siblings", async (context) => {
  const repoPath = "src/features/round28-boolean-attribute.tsx";
  const rootDir = await createFixture(context, {
    [repoPath]: `
      import { Button } from "@/toolcraft/ui";
      let className = "border";
      export const Case = <Button disabled
        id={(className = "flex", "safe")} className={className} />;
    `,
  });
  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.deepEqual(chromeViolations(result, repoPath), [],
    JSON.stringify(result.violations));
});

test("call-frame discovery retains danger beyond the former scan cap", async (context) => {
  const repoPath = "src/features/round28-call-frame-overflow.tsx";
  const harmlessCalls = Array.from({ length: 40 }, () => "noop();").join("\n");
  const rootDir = await createFixture(context, {
    [repoPath]: `
      import { Button } from "@/toolcraft/ui";
      import type { ElementType } from "react";
      declare function noop(): void;
      function render(Component: ElementType) {
        return <Component className="border" />;
      }
      ${harmlessCalls}
      export const Case = render(Button);
    `,
  });
  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.equal(chromeViolations(result, repoPath).length, 1,
    JSON.stringify(result.violations));
});

test("external member aliases retain their host-factory identity", async (context) => {
  const repoPath = "src/features/round28-external-member-alias.tsx";
  const rootDir = await createFixture(context, {
    [repoPath]: `
      import * as React from "react";
      const create = React.createElement;
      export const Case = create("button", { type: "button" }, "Run");
    `,
  });
  const result = await evaluateToolcraftProductBoundary({ rootDir });

  assert.equal(nativeViolations(result, repoPath).length, 2,
    JSON.stringify(result.violations));
});
