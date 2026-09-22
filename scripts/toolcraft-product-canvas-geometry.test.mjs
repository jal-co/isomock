import assert from "node:assert/strict";
import test from "node:test";
import { evaluateToolcraftProductBoundary } from "./toolcraft-product-boundary.mjs";
import { createToolcraftProductBoundaryFixture as fixture } from "./toolcraft-product-boundary-test-fixtures.mjs";

test("registered canvas geometry accepts pointer manipulation but no panel action semantics", async context => {
  const rootDir = await fixture(context, { "src/features/handles.tsx": `
    export function Valid() { return <svg data-toolcraft-canvas-handle="" onPointerMove={() => {}}>
      <circle data-toolcraft-canvas-handle="" onPointerDown={() => {}} onPointerUp={() => {}} />
    </svg>; }
    export const Invalid = <><circle data-toolcraft-canvas-handle="" onClick={() => {}} />
      <div data-toolcraft-canvas-handle="" onPointerDown={() => {}} />
      <circle data-toolcraft-canvas-handle="" role="button" />
      <circle onPointerDown={() => {}} /></>;
  ` });
  const result = await evaluateToolcraftProductBoundary({rootDir});
  assert.equal(result.violations.filter(v => v.kind === "native-control-recreation").length, 4, JSON.stringify(result.violations));
});

test("SVG pointer handlers are not rendered public component descendants", async context => {
  const rootDir = await fixture(context, { "src/features/shape.tsx": `
    declare function update(value: object): void;
    export const Shape = <svg data-toolcraft-canvas-handle="" onPointerMove={() => update({y: 3})} style={{opacity: .6}}>
      <circle cx={3} cy={4} />
    </svg>;
  ` });
  const result = await evaluateToolcraftProductBoundary({rootDir});
  assert.deepEqual(result.violations, []);
});

test("numeric procedural drawing stays plain after bounded control-flow exhaustion", async context => {
  const stages = Array.from({length: 120}, (_, i) => `value += random() * ${i};`).join("\n");
  const rootDir = await fixture(context, { "src/features/generator.ts": `
    type Segment = { height: number; jitter: number };
    export function generate(random: () => number): Segment[] {
      let value = 0; ${stages}
      const rows: Segment[] = [];
      rows.push({ height: value, jitter: random() });
      return rows;
    }
  ` });
  const result = await evaluateToolcraftProductBoundary({rootDir});
  assert.deepEqual(result.violations, []);
});

test("worker messaging is not a DOM control mutation; element aliases remain guarded", async context => {
  const rootDir = await fixture(context, { "src/features/messaging.ts": `
    const worker = new Worker("/worker.js");
    worker.onmessage = () => {};
    worker.onerror = () => {};
    const element = document.createElement("div");
    const disguised = element as unknown as Worker;
    disguised.onmessage = () => {};
  ` });
  const result = await evaluateToolcraftProductBoundary({ rootDir });
  const mutations = result.violations.filter(v => v.message?.includes("imperative host mutation") || v.reason?.includes("imperative host mutation"));
  assert.ok(result.violations.some(v => v.line === 7), JSON.stringify(result.violations));
  assert.ok(!result.violations.some(v => v.line === 3 || v.line === 4), JSON.stringify(result.violations));
});
