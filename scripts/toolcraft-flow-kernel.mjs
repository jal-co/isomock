import { createToolcraftStaticFlowIndex } from
  "./toolcraft-static-flow-index.mjs";
import { createToolcraftFlowStatements } from
  "./toolcraft-flow-statements.mjs";

export function createToolcraftFlowKernel({
  checker,
  resolveStaticString,
  ts,
}) {
  const index = createToolcraftStaticFlowIndex({
    checker, resolveStaticString, ts,
  });
  const statements = createToolcraftFlowStatements({
    checker, index, resolveStaticString, ts,
  });
  return Object.freeze({ index, ...statements });
}
