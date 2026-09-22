import assert from "node:assert/strict";
import test from "node:test";
import ts from "typescript";

import { evaluateToolcraftProductBoundary } from
  "./toolcraft-product-boundary.mjs";
import { createToolcraftProductBoundaryFixture as createFixture } from
  "./toolcraft-product-boundary-test-fixtures.mjs";
import {
  ABSENT, emptyState, exact, mergeFacts, objectFactFromDescriptors, withObject,
} from "./toolcraft-flow-facts.mjs";
import {
  joinToolcraftDescriptors, toolcraftAbsentDescriptor,
  toolcraftAccessorDescriptor, toolcraftDataDescriptor,
} from "./toolcraft-flow-property-descriptors.mjs";
import { createToolcraftFlowPropertyOperations } from
  "./toolcraft-flow-property-operations.mjs";
import { toolcraftFlowStateKey } from "./toolcraft-flow-state-keys.mjs";
import { createToolcraftStaticFlowValues } from
  "./toolcraft-static-flow-values.mjs";
import { createToolcraftTypeScriptChecker } from
  "./toolcraft-typescript-analysis.mjs";

function violations(result, repoPath) {
  return result.violations.filter((violation) =>
    violation.repoPath === repoPath && violation.kind === "public-component-chrome"
  );
}

async function boundary(context, sources) {
  return evaluateToolcraftProductBoundary({
    rootDir: await createFixture(context, sources),
  });
}

function flowFor(source) {
  const sourceFile = ts.createSourceFile(
    "round35.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS,
  );
  const checker = createToolcraftTypeScriptChecker(sourceFile, ts);
  return { flow: createToolcraftStaticFlowValues({
    checker, resolveStaticString: () => undefined, ts,
  }), sourceFile };
}

function namedCalls(sourceFile) {
  const calls = new Map();
  function visit(node) {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      calls.set(node.expression.text, node);
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return calls;
}

function objectAtVoid(source, name = "owner") {
  const { flow, sourceFile } = flowFor(source);
  let use;
  function visit(node) {
    if (ts.isIdentifier(node) && node.text === name &&
      ts.isVoidExpression(node.parent)) use = node;
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  assert.ok(use, `missing void ${name}`);
  return flow.objectAt(use, use.parent.parent);
}

function strictContextFor(source, marker) {
  const sourceFile = ts.createSourceFile(
    "round35-strict.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS,
  );
  const checker = createToolcraftTypeScriptChecker(sourceFile, ts);
  let target;
  function visit(node) {
    if (ts.isIdentifier(node) && node.text === marker) target = node;
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  assert.ok(target, `missing ${marker}`);
  return createToolcraftFlowPropertyOperations({
    checker, index: { unwrap: (node) => node }, memory: {},
    propertyKeys: {}, ts,
  }).strictContext(target);
}

function propertyFacts(object, name) {
  return object.variants.flatMap((variant) => variant.properties.entries())
    .filter(([key]) => key === name).map(([, fact]) => fact);
}

test("non-writable assignment preserves strict sloppy and caught outcomes", async (context) => {
  const safe = "src/features/round35-non-writable.tsx";
  const result = await boundary(context, { [safe]: `import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" }; const owner: Record<string, unknown> = {};
    Object.defineProperty(owner, "run", { writable: false, value: () => {} });
    try { owner.run = () => { props.className = "border"; }; } catch {}
    (owner.run as () => void)(); export const Case = <Button {...props} />;` });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
});

test("strict mutation context follows directive prologues and ignores later strings", () => {
  assert.equal(strictContextFor(`function run() { "use strict";
    const strictMarker = 1; }`, "strictMarker"), true);
  assert.equal(strictContextFor(`const before = 0; "use strict";
    const sloppyMarker = 1;`, "sloppyMarker"), false);
});

test("non-configurable delete preserves strict sloppy and caught outcomes", async (context) => {
  const danger = "src/features/round35-non-config-delete.tsx";
  const result = await boundary(context, { [danger]: `import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" }; const owner: Record<string, unknown> = {};
    Object.defineProperty(owner, "run", { configurable: false,
      value: () => { props.className = "border"; } });
    try { delete owner.run; } catch {} (owner.run as () => void)();
    export const Case = <Button {...props} />;` });
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
});

test("non-configurable descriptors accept compatible and reject incompatible redefinition", async (context) => {
  const safe = "src/features/round35-non-config-redefine.tsx";
  const result = await boundary(context, { [safe]: `import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" }; const owner: Record<string, unknown> = {};
    Object.defineProperty(owner, "run", { configurable: false, writable: false,
      value: () => {} }); try { Object.defineProperty(owner, "run", {
        configurable: true, value: () => { props.className = "border"; } }); } catch {}
    (owner.run as () => void)(); export const Case = <Button {...props} />;` });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
});

test("unknown writable and configurable domains retain old and new value worlds", () => {
  const object = objectAtVoid(`declare const flag: boolean; const owner = {};
    Object.defineProperty(owner, "run", { configurable: flag, writable: flag,
      value: function original() {} }); try { owner.run = function replacement() {}; } catch {}
    void owner;`);
  const values = propertyFacts(object, "run").flatMap((fact) =>
    fact.kind === "exact" ? fact.values : fact.possibleValues ?? []
  );
  assert.equal(new Set(values.map((value) => value.name?.text)).has("original"), true);
  assert.equal(new Set(values.map((value) => value.name?.text)).has("replacement"), true);
});

test("accessor assignment distinguishes a callable setter from no setter", async (context) => {
  const safe = "src/features/round35-missing-setter.tsx";
  const danger = "src/features/round35-present-setter.tsx";
  const source = (descriptor, tail) => `import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" }; const owner: Record<string, unknown> = {};
    Object.defineProperty(owner, "value", ${descriptor}); ${tail}
    export const Case = <Button {...props} />;`;
  const result = await boundary(context, {
    [safe]: source("{ get() { return 1; } }",
      'owner.value = 2; props.className = "border";'),
    [danger]: source('{ set(_value) { props.className = "border"; } }',
      "owner.value = 2;"),
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
});

test("non-callable getter throws before the setter field is read", async (context) => {
  const safe = "src/features/round35-non-callable-get.tsx";
  const result = await boundary(context, { [safe]: `import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" }; const owner = {}; const descriptor = {
      get: 1, get set() { props.className = "border"; return undefined; } };
    try { Object.defineProperty(owner, "value", descriptor); } catch {}
    export const Case = <Button {...props} />;` });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
});

test("non-callable setter throws before descriptor mutation", async (context) => {
  const danger = "src/features/round35-non-callable-set.tsx";
  const result = await boundary(context, { [danger]: `import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" }; const owner: Record<string, unknown> = {};
    try { Object.defineProperty(owner, "run", { set: 1 }); } catch {}
    owner.run = () => { props.className = "border"; }; (owner.run as () => void)();
    export const Case = <Button {...props} />;` });
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
});

test("callable and non-callable descriptor alternatives store only successful setters", () => {
  const object = objectAtVoid(`declare const flag: boolean; const owner = {};
    const setter = flag ? function accepted(_value: unknown) {} : 1;
    try { Object.defineProperty(owner, "value", { set: setter }); } catch {}
    void owner;`);
  const descriptors = object.variants.flatMap((variant) =>
    variant.propertyDescriptors.entries()
  ).filter(([name]) => name === "value").map(([, descriptor]) => descriptor);
  const setterValues = descriptors.flatMap(({ alternatives }) => alternatives)
    .flatMap(({ setFact }) => setFact?.kind === "exact" ? setFact.values : []);
  assert.equal(setterValues.some(ts.isNumericLiteral), false);
  assert.equal(setterValues.some((node) => node.name?.text === "accepted"), true);
});

test("descriptor overflow preserves absent data and accessor modes", () => {
  const data = Array.from({ length: 8 }, (_, index) => toolcraftDataDescriptor(
    exact([ts.factory.createNumericLiteral(index)]), {
      configurable: Boolean(index & 1), enumerable: Boolean(index & 2),
      writable: Boolean(index & 4),
    },
  ));
  const joined = joinToolcraftDescriptors([
    toolcraftAbsentDescriptor(), ...data,
    toolcraftAccessorDescriptor({ getFact: exact([ts.factory.createIdentifier("get")]) }),
  ], mergeFacts, ABSENT);
  assert.deepEqual(new Set(joined.alternatives.map(({ kind }) => kind)),
    new Set(["absent", "data", "accessor"]));
});

test("descriptor normalization is independent of input order", () => {
  const first = toolcraftDataDescriptor(exact([ts.factory.createNumericLiteral(1)]));
  const second = toolcraftDataDescriptor(exact([ts.factory.createNumericLiteral(2)]),
    { writable: false });
  const accessor = toolcraftAccessorDescriptor({
    getFact: exact([ts.factory.createIdentifier("get")]),
  });
  const left = joinToolcraftDescriptors([first, second, accessor], mergeFacts, ABSENT);
  const right = joinToolcraftDescriptors([accessor, second, first], mergeFacts, ABSENT);
  assert.deepEqual(left, right);
});

test("finite key overflow includes the omitted seventeenth but excludes an unrelated key", async (context) => {
  const danger = "src/features/round35-key-seventeen.tsx";
  const safe = "src/features/round35-key-unrelated.tsx";
  const keys = Array.from({ length: 17 }, (_, index) => `"k${index + 1}"`).join(" | ");
  const source = (invoke) => `import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" }; declare const key: ${keys};
    const owner: Record<string, unknown> = {}; Object.defineProperty(owner, key,
      { value: () => { props.className = "border"; } }); ${invoke}
    export const Case = <Button {...props} />;`;
  const result = await boundary(context, {
    [danger]: source("(owner.k17 as undefined | (() => void))?.();"),
    [safe]: source("(owner.unrelated18 as undefined | (() => void))?.();"),
  });
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
});

test("symbol and string typed remainders never cross-contaminate lookup", async (context) => {
  const danger = "src/features/round35-symbol-remainder.tsx";
  const safe = "src/features/round35-symbol-string-control.tsx";
  const source = (invoke) => `import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" }; declare const key: symbol;
    const selected = Symbol("selected"); const owner: Record<PropertyKey, unknown> = {};
    Object.defineProperty(owner, key, { value: () => { props.className = "border"; } });
    ${invoke} export const Case = <Button {...props} />;`;
  const result = await boundary(context, {
    [danger]: source("(owner[selected] as undefined | (() => void))?.();"),
    [safe]: source("(owner.unrelated as undefined | (() => void))?.();"),
  });
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
});

test("Symbol.for shares registry identity while ordinary Symbol stays unique", async (context) => {
  const danger = "src/features/round35-symbol-for.tsx";
  const safe = "src/features/round35-symbol-unique.tsx";
  const source = (first, second) => `import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" }; const first = ${first}; const second = ${second};
    const owner = { [first]: () => { props.className = "border"; } };
    owner[second]?.(); export const Case = <Button {...props} />;`;
  const result = await boundary(context, {
    [danger]: source('Symbol.for("shared")', 'Symbol.for("shared")'),
    [safe]: source('Symbol("shared")', 'Symbol("shared")'),
  });
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
});

test("non-enumerable descriptor remainder is skipped during copy", async (context) => {
  const safe = "src/features/round35-remainder-non-enumerable.tsx";
  const result = await boundary(context, { [safe]: `import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" }; declare const key: string;
    const owner: Record<string, unknown> = {}; Object.defineProperty(owner, key,
      { enumerable: false, value: () => { props.className = "border"; } });
    const copy = { ...owner }; (copy.run as undefined | (() => void))?.();
    export const Case = <Button {...props} />;` });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
});

test("unknown remainder enumerability retains separate copy and skip worlds", () => {
  const object = objectAtVoid(`declare const key: string; declare const flag: boolean;
    const owner: Record<string, unknown> = {}; Object.defineProperty(owner, key,
      { enumerable: flag, value: function copied() {} }); const copy = { ...owner };
    void copy;`, "copy");
  const remainders = object.variants.map(({ propertyRemainder }) => propertyRemainder);
  assert.equal(remainders.some((remainder) => remainder.entries.every(({ descriptor }) =>
    descriptor.alternatives.some(({ kind }) => kind === "absent")
  )), true);
  assert.equal(remainders.some((remainder) => remainder.entries.some(({ descriptor }) =>
    descriptor.alternatives.every(({ kind }) => kind === "data")
  )), true);
});

test("accessor remainder getter runs once and copy stores returned data", async (context) => {
  const danger = "src/features/round35-remainder-getter.tsx";
  const result = await boundary(context, { [danger]: `import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" }; declare const key: string;
    const owner: Record<string, unknown> = {}; Object.defineProperty(owner, key,
      { enumerable: true, get() { props.className = "border"; return 1; } });
    const copy = { ...owner }; void copy; export const Case = <Button {...props} />;` });
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
});

test("for-of exhaustion covers declaration binding and assignment targets", () => {
  const { flow, sourceFile } = flowFor(`declare const items: Array<{}>;
    function bind() { return 1; } const owner: Record<string, unknown> = {};
    function key() { return "value"; }
    for (const { value = bind() } of items) {}
    for (owner[key()] of items) {} function after() {} after();`);
  const calls = namedCalls(sourceFile);
  assert.equal(flow.invocationsAt(calls.get("bind")).kind, "partial");
  assert.equal(flow.invocationsAt(calls.get("key")).kind, "partial");
  assert.equal(flow.invocationsAt(calls.get("after")).kind, "exact");
});

test("for-in exhaustion covers declaration binding and assignment targets", () => {
  const { flow, sourceFile } = flowFor(`declare const items: Record<string, {}>;
    function bind() { return 1; } const owner: Record<string, unknown> = {};
    function key() { return "value"; }
    for (const { value = bind() } in items) {}
    for (owner[key()] in items) {} function after() {} after();`);
  const calls = namedCalls(sourceFile);
  assert.equal(flow.invocationsAt(calls.get("bind")).kind, "partial");
  assert.equal(flow.invocationsAt(calls.get("key")).kind, "partial");
  assert.equal(flow.invocationsAt(calls.get("after")).kind, "exact");
});

test("ToBoolean NaN skips copy while numeric one remains truthy", async (context) => {
  const safe = "src/features/round35-enumerable-nan.tsx";
  const danger = "src/features/round35-enumerable-one.tsx";
  const source = (enumerable) => `import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" }; const owner: Record<string, unknown> = {};
    Object.defineProperty(owner, "run", { enumerable: ${enumerable}, value: () => {
      props.className = "border"; } }); const copy = { ...owner };
    (copy.run as undefined | (() => void))?.(); export const Case = <Button {...props} />;`;
  const result = await boundary(context, { [safe]: source("NaN"), [danger]: source("1") });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
});

test("descriptor state identity is sorted and retains writable configurable distinctions", () => {
  const owner = ts.factory.createIdentifier("owner");
  const data = toolcraftDataDescriptor(exact([ts.factory.createNumericLiteral(1)]));
  const frozen = toolcraftDataDescriptor(exact([ts.factory.createNumericLiteral(1)]),
    { configurable: false, writable: false });
  const accessor = toolcraftAccessorDescriptor({
    getFact: exact([ts.factory.createIdentifier("get")]),
  });
  const alternatives = [...data.alternatives, ...accessor.alternatives];
  const state = (items) => withObject(emptyState(), owner,
    objectFactFromDescriptors(new Map([["value", Object.freeze({
      alternatives: Object.freeze(items), factKind: "PropertyDescriptorFact",
    })]])));
  assert.equal(toolcraftFlowStateKey(state(alternatives)),
    toolcraftFlowStateKey(state([...alternatives].reverse())));
  assert.notEqual(toolcraftFlowStateKey(state(data.alternatives)),
    toolcraftFlowStateKey(state(frozen.alternatives)));
});
