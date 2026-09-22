import assert from "node:assert/strict";
import test from "node:test";
import ts from "typescript";

import { evaluateToolcraftProductBoundary } from
  "./toolcraft-product-boundary.mjs";
import { createToolcraftProductBoundaryFixture as createFixture } from
  "./toolcraft-product-boundary-test-fixtures.mjs";
import {
  ABSENT, emptyState, exact, objectFact, toolcraftEmptyPropertyRemainder,
  withObject,
} from "./toolcraft-flow-facts.mjs";
import {
  createDescriptorPatch, sameValue, validateAndApplyDescriptor,
} from "./toolcraft-flow-descriptor-patches.mjs";
import { createToolcraftFlowPropertyCopy } from
  "./toolcraft-flow-property-copy.mjs";
import { createToolcraftFlowPropertyOperations } from
  "./toolcraft-flow-property-operations.mjs";
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
    "round36.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS,
  );
  const checker = createToolcraftTypeScriptChecker(sourceFile, ts);
  return { flow: createToolcraftStaticFlowValues({
    checker, resolveStaticString: () => undefined, ts,
  }), sourceFile };
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

function propertyValues(object, name) {
  return object.variants.flatMap((variant) => variant.properties.entries())
    .filter(([key]) => key === name).flatMap(([, fact]) =>
      fact.kind === "exact" ? fact.values : fact.possibleValues ?? []
    );
}

function valueNames(values) {
  return new Set(values.map((value) => value.name?.text ?? value.text));
}

function descriptorOwnerOutcomes(count, reverse = false) {
  const identities = Array.from({ length: count }, (_, position) =>
    ts.factory.createIdentifier(`owner${position}`));
  const ordered = reverse ? [...identities].reverse() : identities;
  const values = new Map(identities.map((identity, position) => [identity,
    exact([ts.factory.createFunctionDeclaration(undefined, undefined,
      `value${position}`, undefined, [], undefined,
      ts.factory.createBlock([]))])
  ]));
  const state = { ...emptyState(), objects: new Map(identities.map((identity) =>
    [identity, Object.freeze({})])) };
  const memory = {
    callablesForFact: () => [],
    candidatesForOutcome: () => [],
    descriptorOutcomesFromFact(fact, member, ready) {
      const identity = fact.values[0];
      const alternative = member === "value"
        ? { kind: "data", valueFact: values.get(identity) }
        : { kind: "absent" };
      return [{ alternative, ownerFact: fact, receiverFact: fact, state: ready }];
    },
  };
  const checker = createToolcraftTypeScriptChecker(ts.createSourceFile(
    "owners.ts", "", ts.ScriptTarget.Latest, true,
  ), ts);
  const operations = createToolcraftFlowPropertyOperations({
    checker, index: { unwrap: (node) => node }, memory,
    propertyKeys: {}, ts,
  });
  const outcomes = operations.toPropertyDescriptors(Object.freeze({
    kind: "exact", values: Object.freeze(ordered),
  }), state, {
    applyCandidate: () => [],
  });
  return outcomes.flatMap(({ descriptor }) => descriptor?.alternatives ?? [])
    .flatMap(({ valueFact }) => valueFact?.values ?? [])
    .map((value) => value.name?.text);
}

function copiedWorlds(count, reverse = false) {
  const markers = Array.from({ length: count }, (_, position) => position);
  if (reverse) markers.reverse();
  const emptyRemainder = toolcraftEmptyPropertyRemainder();
  const owners = markers.map((marker) => ts.factory.createIdentifier(`source${marker}`));
  const markerByOwner = new Map(owners.map((owner, position) =>
    [owner, markers[position]]));
  const propertyOperations = {
    assign: (_reference, _fact, state) => [state],
    defineProperty: () => [],
    enumerate: () => [],
    read: (outcome, state) => [{ fact: outcome.alternative.valueFact, state }],
  };
  const emptyCoverage = () => ({ string: { finiteTypes: [], unbounded: false },
    symbol: { finiteTypes: [], unbounded: false } });
  const memory = { propertyKeys: { emptyCoverage },
    ownDescriptorOutcomesFromFact(ownerFact, _cursor, state) {
      const marker = markerByOwner.get(ownerFact.values[0]);
      return [{ alternative: { enumerable: true, kind: "data",
        valueFact: exact([ts.factory.createNumericLiteral(marker)]) },
      ownerFact, receiverFact: ownerFact, state: withObject(
        { ...state, marker }, ownerFact.values[0], objectFact(),
      ) }];
    },
    ownDescriptorsFromFact: () => owners.map((owner) => ({
      descriptors: new Map([["value", {}]]), ownerFact: exact([owner]),
      propertyRemainder: emptyRemainder,
    })) };
  const copy = createToolcraftFlowPropertyCopy({ memory, propertyOperations });
  const results = copy.assign({ actual: [exact([ts.factory.createIdentifier("target")]),
    exact([ts.factory.createIdentifier("source")])],
    call: ts.factory.createIdentifier("call") }, emptyState(), {});
  return results.map(
      ({ state }) => state.marker,
    );
}

test("omitted data fields preserve existing value and writable", () => {
  const object = objectAtVoid(`const owner = {}; function retained() {}
    Object.defineProperty(owner, "run", { configurable: true, writable: true,
      value: retained }); Object.defineProperty(owner, "run", { enumerable: true });
    void owner;`);
  assert.equal(valueNames(propertyValues(object, "run")).has("retained"), true);
});

test("empty descriptor patch is an existing no-op and a new-property default", () => {
  const object = objectAtVoid(`const owner = {}; function retained() {}
    Object.defineProperty(owner, "run", { configurable: true, writable: true,
      value: retained }); Object.defineProperty(owner, "run", {});
    Object.defineProperty(owner, "created", {}); void owner;`);
  assert.equal(valueNames(propertyValues(object, "run")).has("retained"), true);
  assert.equal(propertyValues(object, "created").some((node) =>
    ts.isIdentifier(node) && node.text === "undefined"), true);
});

test("omitted accessor fields preserve the other half and present undefined", async (context) => {
  const danger = "src/features/round36-accessor-patch.tsx";
  const result = await boundary(context, { [danger]: `import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" }; const owner: Record<string, unknown> = {};
    Object.defineProperty(owner, "value", { configurable: true,
      set(_value) { props.className = "border"; } });
    Object.defineProperty(owner, "value", { get: undefined });
    owner.value = 1; export const Case = <Button {...props} />;` });
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
});

test("descriptor field getters are ordered once and abrupt stops later fields", async (context) => {
  const danger = "src/features/round36-field-order.tsx";
  const safe = "src/features/round36-field-abrupt.tsx";
  const result = await boundary(context, {
    [danger]: `import { Button } from "@/toolcraft/ui"; const props = { className: "flex" };
      const owner: Record<string, unknown> = {}; Object.defineProperty(owner, "run",
        { configurable: true, value: () => { props.className = "border"; } });
      const descriptor = { get enumerable() { props.className = "border"; return true; },
        get configurable() { props.className = "flex"; return true; } };
      Object.defineProperty(owner, "run", descriptor); (owner.run as () => void)();
      export const Case = <Button {...props} />;`,
    [safe]: `import { Button } from "@/toolcraft/ui"; const props = { className: "flex" };
      const owner = {}; const descriptor = { get enumerable(): boolean { throw new Error(); },
        get configurable() { props.className = "border"; return true; } };
      try { Object.defineProperty(owner, "run", descriptor); } catch {}
      export const Case = <Button {...props} />;`,
  });
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
});

test("frozen data accepts SameValue and rejects a different value", async (context) => {
  const safe = "src/features/round36-frozen-data.tsx";
  const result = await boundary(context, { [safe]: `import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" }; const owner: Record<string, unknown> = {};
    const original = () => {}; Object.defineProperty(owner, "run", { value: original });
    Object.defineProperty(owner, "run", { value: original });
    try { Object.defineProperty(owner, "run", { value: () => {
      props.className = "border"; } }); } catch {}
    (owner.run as () => void)(); export const Case = <Button {...props} />;` });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
});

test("frozen accessor accepts identical slots and rejects replacements", async (context) => {
  const safe = "src/features/round36-frozen-accessor.tsx";
  const result = await boundary(context, { [safe]: `import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" }; const owner: Record<string, unknown> = {};
    const original = () => () => {}; Object.defineProperty(owner, "run", { get: original });
    Object.defineProperty(owner, "run", { get: original });
    try { Object.defineProperty(owner, "run", { get: () => () => {
      props.className = "border"; } }); } catch {}
    (owner.run as () => void)(); export const Case = <Button {...props} />;` });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
});

test("configurable conversion and generic patches preserve descriptor category", async (context) => {
  const danger = "src/features/round36-generic-patch.tsx";
  const result = await boundary(context, { [danger]: `import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" }; const owner: Record<string, unknown> = {};
    Object.defineProperty(owner, "run", { configurable: true, get() { return () => {
      props.className = "border"; }; } }); Object.defineProperty(owner, "run", {});
    (owner.run as () => void)(); export const Case = <Button {...props} />;` });
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
});

test("unknown descriptor flags retain allowed and rejected worlds", () => {
  const object = objectAtVoid(`declare const flag: boolean; const owner = {};
    function original() {} function replacement() {}
    Object.defineProperty(owner, "run", { configurable: flag, writable: false,
      value: original }); try { Object.defineProperty(owner, "run",
        { value: replacement }); } catch {} void owner;`);
  const names = valueNames(propertyValues(object, "run"));
  assert.equal(names.has("original"), true);
  assert.equal(names.has("replacement"), true);
});

test("SameValue distinguishes NaN positive zero and negative zero", async (context) => {
  const safe = "src/features/round36-same-value-zero.tsx";
  const danger = "src/features/round36-same-value-nan.tsx";
  const source = (first, second) => `import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" }; const owner = {};
    Object.defineProperty(owner, "value", { value: ${first} });
    try { Object.defineProperty(owner, "value", { value: ${second} });
      props.className = "border"; } catch {}
    export const Case = <Button {...props} />;`;
  const result = await boundary(context, {
    [safe]: source("+0", "-0"), [danger]: source("NaN", "NaN"),
  });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
});

test("SameValue overlapping alternatives preserve compatible and rejected worlds", () => {
  const shared = ts.factory.createIdentifier("shared");
  const left = ts.factory.createIdentifier("left");
  const right = ts.factory.createIdentifier("right");
  const key = (node) => node.text;
  assert.equal(sameValue(exact([shared, left]), exact([shared, right]), key),
    "unknown");
  assert.equal(sameValue(exact([left]), exact([right]), key), false);
  assert.equal(sameValue(exact([shared]), exact([shared]), key), true);
});

test("unknown descriptor patch booleans preserve compatible and rejected worlds", () => {
  const original = exact([ts.factory.createIdentifier("original")]);
  const current = {
    configurable: false,
    enumerable: false,
    kind: "data",
    valueFact: original,
    writable: false,
  };
  const patch = createDescriptorPatch({
    configurable: "unknown",
    enumerable: "unknown",
    writable: "unknown",
  });
  const results = validateAndApplyDescriptor(current, patch, {
    undefinedFact: exact([ts.factory.createIdentifier("undefined")]),
  });
  assert.deepEqual(new Set(results.map(({ kind }) => kind)),
    new Set(["replace", "throw"]));
});

test("evaluated const and cross-file strings share Symbol.for registry identity", async (context) => {
  const danger = "src/features/round36-symbol-cross-file.tsx";
  const result = await boundary(context, {
    "src/features/registry-key.ts": `export const registryKey = "shared" as const;`,
    [danger]: `import { Button } from "@/toolcraft/ui"; import { registryKey } from "./registry-key";
      const props = { className: "flex" }; const local = registryKey;
      const owner: Record<PropertyKey, unknown> = {};
      owner[Symbol.for(local)] = () => { props.className = "border"; };
      (owner[Symbol.for(registryKey)] as () => void)();
      export const Case = <Button {...props} />;`,
  });
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
});

test("conditional registry strings retain alternatives while shadowed Symbol stays ordinary", async (context) => {
  const danger = "src/features/round36-symbol-conditional.tsx";
  const safe = "src/features/round36-symbol-shadowed.tsx";
  const result = await boundary(context, {
    [danger]: `import { Button } from "@/toolcraft/ui"; declare const flag: boolean;
      const props = { className: "flex" }; const key = flag ? "first" : "second";
      const owner: Record<PropertyKey, unknown> = {};
      owner[Symbol.for(key)] = () => { props.className = "border"; };
      (owner[Symbol.for(key)] as () => void)(); export const Case = <Button {...props} />;`,
    [safe]: `import { Button } from "@/toolcraft/ui"; const props = { className: "flex" };
      const Symbol = { for: (_key: string) => globalThis.Symbol() };
      const owner: Record<PropertyKey, unknown> = {};
      owner[Symbol.for("key")] = () => { props.className = "border"; };
      (owner[Symbol.for("key")] as (() => void) | undefined)?.();
      export const Case = <Button {...props} />;`,
  });
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
});

test("Object.assign interleaves source Get and target Set per key", async (context) => {
  const danger = "src/features/round36-assign-interleave.tsx";
  const result = await boundary(context, { [danger]: `import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" }; let ready = false;
    const target = { set first(_value: number) { ready = true; } };
    const source = { get first() { return 1; }, get second() {
      if (ready) props.className = "border"; return 2; } };
    Object.assign(target, source); export const Case = <Button {...props} />;` });
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
});

test("Object.assign target setters receive the authored receiver before later Get", async (context) => {
  const danger = "src/features/round36-assign-receiver.tsx";
  const result = await boundary(context, { [danger]: `import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" }; const target = { ready: false,
      set first(value: boolean) { this.ready = value; } };
    const source = { get first() { return true; }, get second() {
      if (target.ready) props.className = "border"; return 2; } };
    Object.assign(target, source); export const Case = <Button {...props} />;` });
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
});

test("abrupt target write suppresses later getters keys and sources", async (context) => {
  const safe = "src/features/round36-assign-abrupt.tsx";
  const result = await boundary(context, { [safe]: `import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" }; const target = {};
    Object.defineProperty(target, "first", { value: 0 });
    const source = { get first() { return 1; }, get later() {
      props.className = "border"; return 2; } };
    const next = { get final() { props.className = "border"; return 3; } };
    try { Object.assign(target, source, next); } catch {}
    export const Case = <Button {...props} />;` });
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
});

test("later Object.assign sources observe successful earlier target writes", async (context) => {
  const danger = "src/features/round36-assign-source-order.tsx";
  const result = await boundary(context, { [danger]: `import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" }; let ready = false;
    const target = { set first(_value: number) { ready = true; } };
    const first = { first: 1, get after() { if (ready) props.className = "border"; return 2; } };
    const second = { final: 3 };
    Object.assign(target, first, second); export const Case = <Button {...props} />;` });
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
});

test("typed remainder copy invokes source getter then target Set", async (context) => {
  const danger = "src/features/round36-assign-remainder.tsx";
  const result = await boundary(context, { [danger]: `import { Button } from "@/toolcraft/ui";
    declare const key: string; const props = { className: "flex" };
    const source: Record<string, string> = {};
    Object.defineProperty(source, key, { enumerable: true, get() { return "border"; } });
    const target: Record<string, string> = {};
    Object.defineProperty(target, key, { set(value: string) { props.className = value; } });
    Object.assign(target, source); export const Case = <Button {...props} />;` });
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
});

test("uncertain setter retains callable and missing completion worlds", () => {
  const setter = ts.factory.createFunctionDeclaration(undefined, undefined,
    "accepted", undefined, [], undefined, ts.factory.createBlock([]));
  const undefinedNode = ts.factory.createIdentifier("undefined");
  const marker = ts.factory.createIdentifier("setter-called");
  const state = emptyState();
  const memory = {
    candidatesForOutcome: () => [{ fn: setter }],
    descriptorOutcomesFromFact: () => [{ alternative: { kind: "accessor",
      setFact: exact([setter, undefinedNode]) } }],
  };
  const checker = createToolcraftTypeScriptChecker(ts.createSourceFile(
    "setter.ts", "", ts.ScriptTarget.Latest, true,
  ), ts);
  const operations = createToolcraftFlowPropertyOperations({ checker,
    index: { unwrap: (node) => node }, memory, propertyKeys: {}, ts });
  const outcomes = operations.assign({ baseFact: exact([
    ts.factory.createIdentifier("owner"),
  ]), kind: "property", member: "value", node: setter, strict: false },
  exact([ts.factory.createStringLiteral("border")]), state, {
    applyCandidate: (_candidate, _facts, ready) => [{ fact: ABSENT,
      state: withObject(ready, marker, objectFact()) }],
  });
  assert.equal(outcomes.some(({ objects }) => objects.has(marker)), true);
  assert.equal(outcomes.some(({ objects }) => !objects.has(marker)), true);
});

test("descriptor operation cap preserves first middle and last worlds", () => {
  const values = descriptorOwnerOutcomes(40);
  assert.equal(values.includes("value0"), true);
  assert.equal(values.includes("value20"), true);
  assert.equal(values.includes("value39"), true);
  assert.equal(descriptorOwnerOutcomes(16).length, 16);
});

test("property copy cap preserves first middle and last worlds", () => {
  const values = copiedWorlds(40);
  assert.equal(values.includes(0), true);
  assert.equal(values.includes(20), true);
  assert.equal(values.includes(39), true);
  assert.equal(copiedWorlds(16).length, 16);
});

test("bounded world normalization is permutation independent without silent tails", () => {
  assert.deepEqual(new Set(descriptorOwnerOutcomes(40, true)),
    new Set(descriptorOwnerOutcomes(40, false)));
  assert.deepEqual(new Set(copiedWorlds(40, true)),
    new Set(copiedWorlds(40, false)));
  assert.deepEqual(new Set(copiedWorlds(8)),
    new Set(Array.from({ length: 8 }, (_, index) => index)));
});

test("dynamic descriptor patches validate the current typed remainder", async (context) => {
  const danger = "src/features/round36-dynamic-redefine.tsx";
  const result = await boundary(context, { [danger]: `import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" }; declare const key: string;
    const owner: Record<string, unknown> = {};
    Object.defineProperty(owner, key, { configurable: false, value: 1 });
    try { Object.defineProperty(owner, key, { value: 2 }); }
    catch { props.className = "border"; }
    export const Case = <Button {...props} />;` });
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
});
