import assert from "node:assert/strict";
import test from "node:test";

import { evaluateToolcraftProductBoundary } from
  "./toolcraft-product-boundary.mjs";
import { createToolcraftProductBoundaryFixture as createFixture } from
  "./toolcraft-product-boundary-test-fixtures.mjs";

function violationsFor(result, repoPath) {
  return result.violations.filter((violation) =>
    violation.repoPath === repoPath
  );
}

test("rejects React and JSX-runtime authority at acquisition", async (context) => {
  const repoPath = "src/features/react-authority.tsx";
  const rootDir = await createFixture(context, {
    [repoPath]: `
      import * as React from "react";
      import * as Runtime from "react/jsx-runtime";
      import { jsxDEV as dev } from "react/jsx-dev-runtime";
      let assigned: unknown;
      assigned = React.createElement;
      const object = { clone: React.cloneElement };
      const array = [React.createFactory];
      const spread = { ...Runtime };
      const computed = React["create" + "Element"];
      export { dev };
      void assigned; void object; void array; void spread; void computed;
    `,
  });

  const result = await evaluateToolcraftProductBoundary({ rootDir });
  assert.equal(violationsFor(result, repoPath).length, 6);
  assert.equal(
    violationsFor(result, repoPath).every(({ kind }) =>
      kind === "native-control-recreation"
    ),
    true,
  );
});

test("rejects CommonJS authority at the reference before it can be aliased", async (context) => {
  const repoPath = "src/features/commonjs-authority.ts";
  const rootDir = await createFixture(context, {
    [repoPath]: `
      declare const condition: boolean;
      const load = require;
      const loadFromModule = module.require;
      const conditionalLoad = condition ? require : module.require;
      void load; void loadFromModule; void conditionalLoad;
    `,
  });

  const result = await evaluateToolcraftProductBoundary({ rootDir });
  assert.equal(violationsFor(result, repoPath).length, 6);
  assert.equal(
    violationsFor(result, repoPath).every(({ kind }) =>
      kind === "native-control-recreation"
    ),
    true,
  );
});

test("rejects DOM factory authority before destructure, bind, assignment, and rest", async (context) => {
  const repoPath = "src/features/dom-authority.ts";
  const rootDir = await createFixture(context, {
    [repoPath]: `
      declare const element: Element;
      const { createElement } = document;
      const bound = document.createElement.bind(document);
      let assigned: unknown;
      assigned = element.ownerDocument.createElementNS;
      const { ...copy } = document;
      document.createElementNS("http://www.w3.org/1999/xhtml", "button");
      void createElement; void bound; void assigned; void copy;
    `,
  });

  const result = await evaluateToolcraftProductBoundary({ rootDir });
  assert.equal(violationsFor(result, repoPath).length, 5);
  assert.equal(
    violationsFor(result, repoPath).every(({ kind }) =>
      kind === "native-control-recreation"
    ),
    true,
  );
});

test("rejects raw DOM semantic and markup mutation", async (context) => {
  const repoPath = "src/features/dom-mutation.ts";
  const rootDir = await createFixture(context, {
    [repoPath]: `
      const host = document.createElement("div");
      host.onclick = () => undefined;
      host.innerHTML = "<button>Run</button>";
      host.setAttribute("role", "button");
      Object.assign(host, { tabIndex: 0 });
      Reflect.set(host, "contentEditable", "true");
    `,
  });

  const result = await evaluateToolcraftProductBoundary({ rootDir });
  assert.equal(violationsFor(result, repoPath).length, 6);
  assert.equal(
    violationsFor(result, repoPath).every(({ kind }) =>
      kind === "native-control-recreation"
    ),
    true,
  );
});

test("preserves both branches of conditional native and Base UI hosts", async (context) => {
  const repoPath = "src/features/conditional-hosts.tsx";
  const rootDir = await createFixture(context, {
    [repoPath]: `
      import * as React from "react";
      import { Button as RawButton } from "@base-ui/react/button";
      declare const condition: boolean;
      const Native = condition ? "div" : "BUTTON";
      const Base = condition ? React.Fragment : RawButton;
      export const Example = <><Native /><Base /></>;
    `,
  });

  const result = await evaluateToolcraftProductBoundary({ rootDir });
  assert.equal(
    violationsFor(result, repoPath).filter(({ kind }) =>
      kind === "native-control-recreation"
    ).length,
    2,
  );
});

test("allows any alias resolved to the exact public UI index", async (context) => {
  const rootDir = await createFixture(context, {
    "src/features/public-ui.tsx": `
      import { Button } from "#ui";
      export const Public = <Button>Run</Button>;
    `,
    "src/toolcraft/ui/components/primitives/button.tsx":
      "export const Button = (props: object) => null;\n",
    "src/toolcraft/ui/index.ts":
      'export { Button } from "./components/primitives/button";\n',
    "tsconfig.json": JSON.stringify({
      compilerOptions: {
        baseUrl: ".",
        paths: { "#ui": ["src/toolcraft/ui/index.ts"] },
      },
    }),
  });

  const result = await evaluateToolcraftProductBoundary({ rootDir });
  assert.deepEqual(result.violations, []);
});
