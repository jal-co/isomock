import assert from "node:assert/strict";
import test from "node:test";

import { evaluateToolcraftProductBoundary } from
  "./toolcraft-product-boundary.mjs";
import { createToolcraftProductBoundaryFixture as createFixture } from
  "./toolcraft-product-boundary-test-fixtures.mjs";

function violationsFor(result, repoPath) {
  return result.violations.filter((violation) => violation.repoPath === repoPath);
}

test("product closes parameter DOM bindings and constrained subtypes", async (context) => {
  const repoPath = "src/features/round19-dom-bindings.ts";
  const rootDir = await createFixture(context, {
    [repoPath]: `
      function documentBinding({ createElement }: Document) {}
      function nestedBinding(
        { ownerDocument: { createElementNS } }:
        { ownerDocument: XMLDocument }
      ) {}
      function xmlBinding({ importNode }: XMLDocument) {}
      function nodeBinding({ cloneNode }: HTMLElement) {}
      function genericDocument<T extends XMLDocument>(
        { createElement }: T
      ) {}
      function genericNode<T extends Node>({ cloneNode }: T) {}
      void documentBinding; void nestedBinding; void xmlBinding;
      void nodeBinding; void genericDocument; void genericNode;
    `,
  });

  const result = await evaluateToolcraftProductBoundary({ rootDir });
  assert.equal(
    violationsFor(result, repoPath).filter(({ message }) =>
      message.includes("acquiring DOM host-factory authority")
    ).length,
    6,
    JSON.stringify(result.violations),
  );
});

test("product rejects factory erasure in variables, arguments, and returns", async (context) => {
  const repoPath = "src/features/round19-dom-erasure.ts";
  const rootDir = await createFixture(context, {
    [repoPath]: `
      type FactoryShape = {
        createElement(name: string): unknown;
        cloneNode(deep?: boolean): unknown;
      };
      declare function accept(value: { host: FactoryShape }): void;
      const variable: FactoryShape = document;
      accept({ host: document });
      function leak(): { host: FactoryShape } {
        return { host: document };
      }
      void variable; void leak;
    `,
  });

  const result = await evaluateToolcraftProductBoundary({ rootDir });
  assert.equal(
    violationsFor(result, repoPath).filter(({ message }) =>
      message.startsWith("lib.dom capability cannot be erased")
    ).length,
    3,
    JSON.stringify(result.violations),
  );
});

test("product recursively rejects Record and Array erasure but allows plain data", async (context) => {
  const repoPath = "src/features/round19-recursive-erasure.ts";
  const rootDir = await createFixture(context, {
    [repoPath]: `
      declare const element: HTMLDivElement;
      declare const optional: HTMLDivElement | undefined;
      const record: Record<string, { innerHTML: string }> = {
        host: element,
      };
      const array: Array<{ cloneNode(deep?: boolean): unknown }> = [
        ...[element],
      ];
      const optionalHost: { innerHTML: string } | undefined = optional;
      const accessor: { readonly host: { createElement(name: string): unknown } } = {
        get host() { return document; },
      };
      const deep: { a: { b: { c: { d: { e: { innerHTML: string } } } } } } = {
        a: { b: { c: { d: { e: element } } } },
      };
      const safeRecord: Record<string, { label: string }> = {
        host: { label: "plain" },
      };
      const safeArray: Array<{ label: string }> = [
        ...[{ label: "plain" }],
      ];
      void record; void array; void optionalHost; void accessor; void deep;
      void safeRecord; void safeArray;
    `,
  });

  const result = await evaluateToolcraftProductBoundary({ rootDir });
  assert.equal(
    violationsFor(result, repoPath).filter(({ message }) =>
      message.startsWith("lib.dom capability cannot be erased")
    ).length,
    5,
    JSON.stringify(result.violations),
  );
});
