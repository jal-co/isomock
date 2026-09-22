import assert from "node:assert/strict";
import test from "node:test";
import ts from "typescript";

import { createToolcraftStaticFlowValues } from
  "./toolcraft-static-flow-values.mjs";
import { createToolcraftTypeScriptChecker } from
  "./toolcraft-typescript-analysis.mjs";

function flowFor(source) {
  const sourceFile = ts.createSourceFile(
    "round31-thermo.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS,
  );
  const checker = createToolcraftTypeScriptChecker(sourceFile, ts);
  return { flow: createToolcraftStaticFlowValues({
    checker, resolveStaticString: () => undefined, ts,
  }), sourceFile };
}

test("derived constructors preserve every pre-super branch", () => {
  const { flow, sourceFile } = flowFor(`
    let output = "border";
    class Base { constructor(value: string) { output = value; } }
    declare const flag: boolean;
    class Derived extends Base {
      constructor() {
        let value = "border";
        if (flag) value = "flex";
        super(value);
      }
    }
    new Derived(); output;
  `);
  const result = flow.resultAt(sourceFile.statements.at(-1).expression);
  assert.deepEqual(
    result.values?.map(({ text }) => text).sort(),
    ["border", "flex"],
  );
});
