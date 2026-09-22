import assert from "node:assert/strict";
import test from "node:test";
import ts from "typescript";
import { createToolcraftStaticFlowValues } from "./toolcraft-static-flow-values.mjs";
import { createToolcraftTypeScriptChecker } from "./toolcraft-typescript-analysis.mjs";

function finalValue(source) {
  const parsed = ts.createSourceFile(
    "construction.ts",
    source,
    ts.ScriptTarget.Latest,
    true,
  );
  const flow = createToolcraftStaticFlowValues({
    checker: createToolcraftTypeScriptChecker(parsed, ts),
    resolveStaticString: () => undefined,
    ts,
  });
  return flow.valueAt(
    parsed.statements.at(-1).declarationList.declarations[0].initializer,
  );
}

test("opaque callbacks receiving classes preserve unknown instance authority", () => {
  const value = finalValue(`
    declare function register(factory: unknown): void;
    class ImageDouble { src = ""; }
    register(ImageDouble);
    const result = "safe";
  `);
  assert.equal(value.kind, "overflow");
});

test("new without parentheses has an empty argument list and initializes fields", () => {
  const value = finalValue(`
    class Item { label = "ready"; }
    const item = new Item;
    const result = item.label;
  `);
  assert.equal(value.kind, "exact");
  assert.deepEqual(
    value.values.map((node) => node.text),
    ["ready"],
  );
});
