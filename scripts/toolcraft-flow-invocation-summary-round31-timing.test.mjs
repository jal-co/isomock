import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import test from "node:test";
import ts from "typescript";

import { createToolcraftStaticFlowValues } from
  "./toolcraft-static-flow-values.mjs";
import { createToolcraftTypeScriptChecker } from
  "./toolcraft-typescript-analysis.mjs";

test("invocation queries share one containing-function execution summary", () => {
  const callCount = 256;
  const sourceFile = ts.createSourceFile(
    "round31-invocation-summary.ts",
    `declare function consume(value: number): void;
      function controller(value: number) {
        ${Array.from({ length: callCount }, (_, index) =>
          `consume(value + ${index});`).join("\n")}
      }`,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const checker = createToolcraftTypeScriptChecker(sourceFile, ts);
  const flow = createToolcraftStaticFlowValues({
    checker, resolveStaticString: () => undefined, ts,
  });
  const calls = [];
  function visit(node) {
    if (ts.isCallExpression(node)) calls.push(node);
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);

  const startedAt = performance.now();
  const facts = calls.map((call) => flow.invocationsAt(call));
  const durationMs = performance.now() - startedAt;

  assert.equal(calls.length, callCount);
  assert.ok(facts.every(({ kind, values }) =>
    kind === "exact" && values.length === 1
  ));
  assert.ok(
    durationMs < 250,
    `shared invocation queries took ${durationMs.toFixed(1)}ms (limit 250ms)`,
  );
});
