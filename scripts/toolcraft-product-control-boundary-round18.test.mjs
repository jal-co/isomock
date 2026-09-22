import assert from "node:assert/strict";
import test from "node:test";

import { evaluateToolcraftProductBoundary } from
  "./toolcraft-product-boundary.mjs";
import { createToolcraftProductBoundaryFixture as createFixture } from
  "./toolcraft-product-boundary-test-fixtures.mjs";

const semanticTags = [
  "a", "area", "audio", "button", "datalist", "details", "dialog", "embed",
  "fieldset", "form", "iframe", "input", "label", "legend", "meter",
  "object", "optgroup", "option", "output", "progress", "select",
  "summary", "textarea", "video",
];

function violationsFor(result, repoPath) {
  return result.violations.filter((violation) => violation.repoPath === repoPath);
}

test("product code rejects the complete raw browser semantic-host set", async (context) => {
  const repoPath = "src/features/raw-semantic-hosts.tsx";
  const rootDir = await createFixture(context, {
    [repoPath]: `
      export const Hosts = <>
        <a /><area /><audio /><button /><datalist /><details /><dialog /><embed />
        <fieldset /><form /><iframe /><input /><label /><legend /><meter />
        <object /><optgroup /><option /><output /><progress /><select />
        <summary /><textarea /><video />
      </>;
    `,
  });

  const result = await evaluateToolcraftProductBoundary({ rootDir });
  assert.equal(violationsFor(result, repoPath).length, semanticTags.length);
  assert.equal(
    violationsFor(result, repoPath).every(({ kind }) =>
      kind === "native-control-recreation"
    ),
    true,
  );
});

test("product code closes nested Document, subtype, clone, and import authority", async (context) => {
  const repoPath = "src/features/dom-authority-round18.ts";
  const rootDir = await createFixture(context, {
    [repoPath]: `
      declare const node: Element;
      declare const xml: XMLDocument;
      const { ownerDocument: { createElement } } = node;
      const fromXml = xml.createElement;
      const cloned = node.cloneNode.bind(node);
      const { importNode } = node.ownerDocument;
      const { ...documentRest } = node.ownerDocument;
      let assigned: unknown;
      assigned = node["cloneNode"];
      void createElement; void fromXml; void cloned; void importNode;
      void documentRest; void assigned;
    `,
  });

  const result = await evaluateToolcraftProductBoundary({ rootDir });
  assert.equal(violationsFor(result, repoPath).length, 6);
});

test("plain product layout hosts remain valid", async (context) => {
  const repoPath = "src/features/plain-layout.tsx";
  const rootDir = await createFixture(context, {
    [repoPath]: `
      export const Layout = <main><section><article><div><span>Plain</span></div></article></section></main>;
    `,
  });

  const result = await evaluateToolcraftProductBoundary({ rootDir });
  assert.deepEqual(violationsFor(result, repoPath), []);
});
