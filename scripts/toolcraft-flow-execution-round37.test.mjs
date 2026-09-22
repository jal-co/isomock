import assert from "node:assert/strict";
import test from "node:test";
import ts from "typescript";

import { evaluateToolcraftProductBoundary } from
  "./toolcraft-product-boundary.mjs";
import { createToolcraftProductBoundaryFixture as createFixture } from
  "./toolcraft-product-boundary-test-fixtures.mjs";
import { createDescriptorPatch, validateAndApplyDescriptor } from
  "./toolcraft-flow-descriptor-patches.mjs";
import { emptyState, exact, objectFactFromDescriptors, withObject } from
  "./toolcraft-flow-facts.mjs";
import { createToolcraftFlowPropertyKeys } from
  "./toolcraft-flow-property-keys.mjs";
import { toolcraftDataDescriptor } from
  "./toolcraft-flow-property-descriptors.mjs";
import { toolcraftFlowStateKey } from "./toolcraft-flow-state-keys.mjs";
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
function parsed(source) {
  const sourceFile = ts.createSourceFile(
    "round37.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS,
  );
  const checker = createToolcraftTypeScriptChecker(sourceFile, ts);
  const values = new Map();
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.initializer) {
        values.set(declaration.name.text, declaration.initializer);
      }
    }
  }
  return { checker, sourceFile, values };
}
async function identitiesFor(source) {
  const { createToolcraftFlowValueIdentities } = await import(
    "./toolcraft-flow-value-identities.mjs"
  );
  const parsedSource = parsed(source);
  const index = { unwrap: (node) => node };
  const propertyKeys = createToolcraftFlowPropertyKeys({
    checker: parsedSource.checker, index, ts,
  });
  return { ...parsedSource, identities: createToolcraftFlowValueIdentities({
    checker: parsedSource.checker, index, propertyKeys, ts,
  }) };
}
function hasRelation(relation, name) {
  return (relation[name] ?? []).length > 0;
}
test("SameValue canonicalizes BigInt infinities NaN and signed zero", async () => {
  const { identities, values } = await identitiesFor(`
    const bigA = 9007199254740993n; const bigB = 9007199254740993n;
    const negativeBigA = -1n; const negativeBigB = -1n;
    const negativeBigZero = -0n; const bigZero = 0n;
    const infinityA = Infinity; const infinityB = +Infinity;
    const nanA = NaN; const nanB = NaN; const negativeNan = -NaN;
    const zero = +0; const negativeZero = -0; const bitwise = ~1; const minusTwo = -2;
  `);
  for (const [left, right] of [["bigA", "bigB"], ["infinityA", "infinityB"],
    ["nanA", "nanB"], ["negativeBigA", "negativeBigB"],
    ["negativeBigZero", "bigZero"], ["negativeNan", "nanA"],
    ["bitwise", "minusTwo"]]) {
    const relation = identities.sameValueRelation(
      exact([values.get(left)]), exact([values.get(right)]),
    );
    assert.equal(hasRelation(relation, "equal"), true, `${left}/${right}`);
  }
  const signed = identities.sameValueRelation(
    exact([values.get("zero")]), exact([values.get("negativeZero")]),
  );
  assert.equal(hasRelation(signed, "equal"), false);
  assert.equal(hasRelation(signed, "unequal"), true);
});
test("SameValue keeps shadowed globals ordinary and canonicalizes undefined", async (context) => {
  const { identities, values } = await identitiesFor(`
    const globalThis = { Infinity: {} }; const shadowed = globalThis.Infinity;
    const local = {}; const ambient = Infinity;
  `);
  const relation = identities.sameValueRelation(
    exact([values.get("local")]), exact([values.get("ambient")]),
  );
  assert.equal(hasRelation(relation, "equal"), false);
  assert.equal(hasRelation(relation, "unequal"), true);
  assert.equal(identities.identityOf(values.get("shadowed")), undefined);
  const undefinedValues = await identitiesFor(`
    const viaVoid = void 0; const viaGlobal = globalThis.undefined;
  `);
  const undefinedRelation = undefinedValues.identities.sameValueRelation(
    exact([undefinedValues.values.get("viaVoid")]),
    exact([undefinedValues.values.get("viaGlobal")]),
  );
  assert.equal(hasRelation(undefinedRelation, "equal"), true);

  const repoPath = "src/neutral/global-undefined.tsx";
  const result = await boundary(context, { [repoPath]: `
    import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" }; const owner = {};
    Object.defineProperty(owner, "slot", { value: undefined });
    try {
      Object.defineProperty(owner, "slot", { value: globalThis.undefined });
      props.className = "border";
    } catch {}
    export const Case = <Button {...props} />;
  ` });
  assert.equal(violations(result, repoPath).length, 1,
    JSON.stringify(result.violations));
});
test("SameValue compares object and symbol reference identities", async () => {
  const { identities, values } = await identitiesFor(`
    const shared = {}; const other = {}; const first = Symbol(); const second = Symbol();
  `);
  assert.equal(hasRelation(identities.sameValueRelation(
    exact([values.get("shared")]), exact([values.get("shared")]),
  ), "equal"), true);
  assert.equal(hasRelation(identities.sameValueRelation(
    exact([values.get("shared")]), exact([values.get("other")]),
  ), "equal"), false);
  assert.equal(hasRelation(identities.sameValueRelation(
    exact([values.get("first")]), exact([values.get("second")]),
  ), "equal"), false);
});
test("SameValue narrows overlapping alternatives without losing rejection", async () => {
  const { identities, values } = await identitiesFor(`
    const shared = {}; const left = {}; const right = {};
  `);
  const relation = identities.sameValueRelation(
    exact([values.get("shared"), values.get("left")]),
    exact([values.get("shared"), values.get("right")]),
  );
  assert.deepEqual(relation.equal.flatMap(({ leftFact }) => leftFact.values),
    [values.get("shared")]);
  assert.deepEqual(relation.equal.flatMap(({ rightFact }) => rightFact.values),
    [values.get("shared")]);
  assert.equal(hasRelation(relation, "unequal"), true);
  assert.equal(relation.unequal.some(({ leftFact, rightFact }) =>
    leftFact.values.includes(values.get("shared")) &&
      rightFact.values.includes(values.get("shared"))), false);
  const results = validateAndApplyDescriptor({ configurable: false,
    enumerable: true, kind: "data",
    valueFact: exact([values.get("shared"), values.get("left")]), writable: false,
  }, createDescriptorPatch({ value: exact([
    values.get("shared"), values.get("right"),
  ]) }), { compare: (left, right) => identities.sameValueRelation(left, right),
    undefinedFact: exact([ts.factory.createIdentifier("undefined")]) });
  assert.equal(results.some(({ kind, sameValueEvidence }) => kind === "replace" &&
    sameValueEvidence.some((evidence) => evidence.kind === "equal")), true);
  assert.equal(results.some(({ kind, sameValueEvidence }) => kind === "throw" &&
    sameValueEvidence.some((evidence) => evidence.kind === "unequal")), true);
  const successful = results.find(({ kind, sameValueEvidence }) =>
    kind === "replace" && sameValueEvidence.some(
      (evidence) => evidence.kind === "equal"
    ));
  assert.deepEqual(successful.alternative.valueFact.values, [values.get("shared")]);

  const unknowns = await identitiesFor(`declare const left: number;
    declare const right: number; declare const box: { left: number; right: number };
    const leftValue = left; const rightValue = right;
    const memberLeft = box.left; const memberRight = box.right;`);
  for (const [left, right] of [["leftValue", "rightValue"],
    ["memberLeft", "memberRight"]]) {
    const uncertain = unknowns.identities.sameValueRelation(
      exact([unknowns.values.get(left)]), exact([unknowns.values.get(right)]));
    assert.equal(hasRelation(uncertain, "equal"), false);
    assert.equal(hasRelation(uncertain, "unequal"), false);
    assert.equal(hasRelation(uncertain, "uncertain"), true);
  }
});

test("empty existing descriptor patch returns unchanged", () => {
  const valueFact = exact([ts.factory.createIdentifier("retained")]);
  const current = { configurable: true, enumerable: false, kind: "data",
    valueFact, writable: true };
  const [result] = validateAndApplyDescriptor(current, createDescriptorPatch(), {
    undefinedFact: exact([ts.factory.createIdentifier("undefined")]),
  });
  assert.equal(result.kind, "unchanged");
  assert.equal(result.alternative, current);
});

test("descriptor owner alternatives preserve non-object abrupt worlds", async (context) => {
  const danger = "src/features/round37-descriptor-owner.tsx";
  const safe = "src/features/round37-descriptor-owner-safe.tsx";
  const nan = "src/features/round37-descriptor-owner-nan.tsx";
  const infinity = "src/features/round37-descriptor-owner-infinity.tsx";
  const result = await boundary(context, {
    [danger]: `import { Button } from "@/toolcraft/ui"; declare const flag: boolean;
      const props = { className: "flex" }; const owner = {};
      const descriptor = flag ? { value: 1 } : 1;
      try { Object.defineProperty(owner, "value", descriptor as object); }
      catch { props.className = "border"; }
      export const Case = <Button {...props} />;`,
    [safe]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; Object.defineProperty({}, "value", { value: 1 });
      export const Case = <Button {...props} />;`,
    [nan]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; try {
        Object.defineProperty({}, "value", NaN as unknown as PropertyDescriptor);
      } catch { props.className = "border"; }
      export const Case = <Button {...props} />;`,
    [infinity]: `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; try {
        Object.defineProperty({}, "value", Infinity as unknown as PropertyDescriptor);
      } catch { props.className = "border"; }
      export const Case = <Button {...props} />;`,
  });
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
  assert.deepEqual(violations(result, safe), [], JSON.stringify(result.violations));
  assert.equal(violations(result, nan).length, 1, JSON.stringify(result.violations));
  assert.equal(violations(result, infinity).length, 1,
    JSON.stringify(result.violations));
});

test("inherited descriptor fields use receiver-correct HasProperty and Get order", async (context) => {
  const danger = "src/features/round37-inherited-fields.tsx";
  const result = await boundary(context, { [danger]: `import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" }; let first = false; const descriptor = Object.create({
      get enumerable() { first = this === descriptor; return true; },
      get configurable() { if (first && this === descriptor) props.className = "border"; return true; },
    }); Object.defineProperty({}, "value", descriptor);
    export const Case = <Button {...props} />;` });
  assert.equal(violations(result, danger).length, 1, JSON.stringify(result.violations));
});

test("descriptor conversion suppresses later field cursors after abrupt completion", async (context) => {
  const repoPath = "src/neutral/descriptor-abrupt.tsx";
  const result = await boundary(context, { [repoPath]: `
    import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" };
    const descriptor = {
      get enumerable() { props.className = "border"; throw new Error(); },
      get configurable() { props.className = "flex"; return true; },
    };
    try { Object.defineProperty({}, "slot", descriptor); } catch {}
    export const Case = <Button {...props} />;
  ` });
  assert.equal(violations(result, repoPath).length, 1,
    JSON.stringify(result.violations));
});

test("OwnPropertyKeys orders edge indices strings and symbols canonically", async () => {
  const { canonicalOwnPropertyKeyOrder } = await import(
    "./toolcraft-flow-own-property-keys.mjs"
  );
  const first = { id: "symbol:1", kind: "symbol" };
  const second = { id: "symbol:2", kind: "symbol" };
  const ordered = canonicalOwnPropertyKeyOrder([
    "02", "4294967295", "2", "1", "alpha", first, second,
  ]);
  assert.deepEqual(ordered, ["1", "2", "02", "4294967295", "alpha", first, second]);
});

test("OwnPropertyKeys snapshots own keys without inherited keys", async () => {
  const { createToolcraftOwnPropertyKeys } = await import(
    "./toolcraft-flow-own-property-keys.mjs"
  );
  const emptyDomain = Object.freeze({ finiteTypes: Object.freeze([]),
    typeIds: Object.freeze([]), unbounded: false });
  const emptyCoverage = () => Object.freeze({ string: emptyDomain,
    symbol: emptyDomain });
  const dynamicCoverage = Object.freeze({ string: Object.freeze({
    finiteTypes: Object.freeze([{}]), typeIds: Object.freeze(["dynamic"]),
    unbounded: false }), symbol: emptyDomain });
  const totalCoverage = Object.freeze({ string: Object.freeze({
    finiteTypes: dynamicCoverage.string.finiteTypes,
    typeIds: dynamicCoverage.string.typeIds, unbounded: true,
  }), symbol: emptyDomain });
  const descriptor = (writeOrder, insertionOrder) => Object.freeze({
    ...toolcraftDataDescriptor(exact([ts.factory.createNumericLiteral(writeOrder)])),
    ...(insertionOrder === undefined ? {} : { insertionOrder }), writeOrder,
  });
  const absent = Object.freeze({ alternatives: Object.freeze([
    Object.freeze({ kind: "absent" }),
  ]), factKind: "PropertyDescriptorFact" });
  const remainder = Object.freeze({ coverage: totalCoverage,
    entries: Object.freeze([Object.freeze({ coverage: dynamicCoverage,
      descriptor: descriptor(2, 2), id: "dynamic-key", order: 2 })]),
    string: absent, symbol: absent });
  const memory = { ownDescriptorsFromFact: () => [{
    descriptors: new Map([["late", descriptor(3, 3)], ["gone", absent],
      ["2", descriptor(5, 5)], ["early", descriptor(1, 1)],
      ["1", descriptor(4, 4)]]),
    ownerFact: exact([ts.factory.createIdentifier("owner")]),
    propertyRemainder: remainder,
  }] };
  const propertyKeys = { emptyCoverage };
  const [snapshot] = createToolcraftOwnPropertyKeys({ memory, propertyKeys })
    .snapshot(exact([ts.factory.createIdentifier("source")]), emptyState());
  assert.deepEqual(snapshot.cursors.map((cursor) => typeof cursor === "string"
    ? cursor : cursor.dynamicId ?? cursor.remainderDomain),
  ["1", "2", "early", "dynamic-key", "late", "string"]);
  assert.equal(snapshot.cursors.some((cursor) =>
    cursor.remainderDomain === "string" && cursor.unbounded === true), true);

  const broadCoverage = Object.freeze({ string: Object.freeze({
    finiteTypes: Object.freeze([]), typeIds: Object.freeze([]), unbounded: true,
  }), symbol: emptyDomain });
  const broadMemory = { ownDescriptorsFromFact: () => [{ descriptors: new Map(),
    ownerFact: exact([ts.factory.createIdentifier("broad-owner")]),
    propertyRemainder: Object.freeze({ coverage: emptyCoverage(),
      entries: Object.freeze([Object.freeze({ coverage: broadCoverage,
        descriptor: descriptor(1, 1), id: "broad-key", order: 1 })]),
      string: absent, symbol: absent }),
  }] };
  const [broad] = createToolcraftOwnPropertyKeys({
    memory: broadMemory, propertyKeys,
  }).snapshot(exact([ts.factory.createIdentifier("broad-source")]), emptyState());
  assert.deepEqual(broad.cursors.map((cursor) =>
    cursor.dynamicId ?? cursor.remainderDomain), ["broad-key"]);

  const rewrittenMemory = { ownDescriptorsFromFact: () => [{
    descriptors: new Map([
      ["alpha", descriptor(3)], ["beta", descriptor(2)],
    ]), ownerFact: exact([ts.factory.createIdentifier("rewritten-owner")]),
    propertyRemainder: Object.freeze({ coverage: emptyCoverage(),
      entries: Object.freeze([]), string: absent, symbol: absent }),
  }] };
  const [rewritten] = createToolcraftOwnPropertyKeys({
    memory: rewrittenMemory, propertyKeys,
  }).snapshot(exact([ts.factory.createIdentifier("rewritten-source")]), emptyState());
  assert.deepEqual(rewritten.cursors, ["alpha", "beta"]);
});

const copyCases = [
  ["deletion", `get first() { delete source.later; return 1; },
    get later() { props.className = "border"; return 2; }`, false, ""],
  ["current value", `get first() { Object.defineProperty(source, "later", {
    enumerable: true, value: () => { props.className = "border"; } }); return 1; },
    later: () => {}`, true, ""],
  ["enumerable lift", `get first() { Object.defineProperty(source, "later", {
    enumerable: true }); return 1; }, get later() { props.className = "border"; return 2; }`,
    true, `Object.defineProperty(source, "later", { enumerable: false });`],
  ["enumerable drop", `get first() { Object.defineProperty(source, "later", {
    enumerable: false }); return 1; }, get later() { props.className = "border"; return 2; }`, false, ""],
  ["abrupt current getter", `get first() { Object.defineProperty(source, "later", {
    enumerable: true, get() { throw new Error(); } }); return 1; },
    get later() { props.className = "border"; return 2; }`, false, ""],
];

for (const [label, members, dangerous, setup] of copyCases) {
  test(`Object.assign re-queries ${label} at the frozen cursor`, async (context) => {
    const path = `src/features/round37-copy-${label.replaceAll(" ", "-")}.tsx`;
    const spreadPath = `src/features/round37-spread-${label.replaceAll(" ", "-")}.tsx`;
    const source = (copy) => `import { Button } from "@/toolcraft/ui";
      const props = { className: "flex" }; const source = { ${members} }; ${setup}
      try { const target = ${copy};
        (target.later as (() => void) | undefined)?.(); } catch {}
      export const Case = <Button {...props} />;`;
    const result = await boundary(context, {
      [path]: source("Object.assign({}, source)"),
      [spreadPath]: source("{ ...source }"),
    });
    assert.equal(violations(result, path).length, dangerous ? 1 : 0,
      JSON.stringify(result.violations));
    assert.equal(violations(result, spreadPath).length, dangerous ? 1 : 0,
      JSON.stringify(result.violations));
  });
}

test("distinct typed string remainder getters keep sequential cursors", async () => {
  const { createToolcraftOwnPropertyKeys } = await import(
    "./toolcraft-flow-own-property-keys.mjs"
  );
  const { joinToolcraftFlowPropertyRemainders } = await import(
    "./toolcraft-flow-state-joining.mjs"
  );
  const emptyDomain = Object.freeze({ finiteTypes: Object.freeze([]),
    typeIds: Object.freeze([]), unbounded: false });
  const coverage = Object.freeze({ string: Object.freeze({
    finiteTypes: Object.freeze([{}]), typeIds: Object.freeze(["entry"]),
    unbounded: false }), symbol: emptyDomain });
  const descriptor = toolcraftDataDescriptor(exact([
    ts.factory.createIdentifier("present"),
  ]));
  const entry = Object.freeze({ coverage, descriptor, id: "entry", order: 1 });
  const empty = Object.freeze({ coverage: Object.freeze({ string: emptyDomain,
    symbol: emptyDomain }), entries: Object.freeze([]),
    string: Object.freeze({ alternatives: Object.freeze([
      Object.freeze({ kind: "absent" }),
    ]), factKind: "PropertyDescriptorFact" }),
    symbol: Object.freeze({ alternatives: Object.freeze([
      Object.freeze({ kind: "absent" }),
    ]), factKind: "PropertyDescriptorFact" }) });
  const joined = joinToolcraftFlowPropertyRemainders([
    Object.freeze({ ...empty, entries: Object.freeze([entry]) }), empty,
  ]);
  assert.equal(joined.entries[0].descriptor.alternatives.some(
    ({ kind }) => kind === "absent"), true);
  const memory = { ownDescriptorsFromFact: () => [{ descriptors: new Map(),
    ownerFact: exact([ts.factory.createIdentifier("owner")]),
    propertyRemainder: Object.freeze({ ...empty,
      entries: Object.freeze([
        entry, Object.freeze({ ...entry, id: "second", order: 2 }),
      ]) }),
  }] };
  const propertyKeys = { emptyCoverage: () => empty.coverage };
  const [snapshot] = createToolcraftOwnPropertyKeys({ memory, propertyKeys })
    .snapshot(exact([ts.factory.createIdentifier("source")]), emptyState());
  assert.deepEqual(snapshot.cursors.map(({ dynamicId }) => dynamicId),
    ["entry", "second"]);
});

test("distinct typed symbol remainder getters execute sequentially", async (context) => {
  const repoPath = "src/neutral/symbol-remainder-order.tsx";
  const result = await boundary(context, { [repoPath]: `
    import { Button } from "@/toolcraft/ui";
    const props = { className: "flex" }; let armed = false;
    const first: unique symbol = Symbol(); const second: unique symbol = Symbol();
    const source = {
      get [first]() { armed = true; return 1; },
      get [second]() { if (armed) props.className = "border"; return 2; },
    };
    Object.assign({}, source);
    export const Case = <Button {...props} />;
  ` });
  assert.equal(violations(result, repoPath).length, 1,
    JSON.stringify(result.violations));
});

test("fresh symbols produce distinct state identities while registry symbols remain stable", () => {
  const sourceFile = ts.createSourceFile(
    "symbols.ts", "", ts.ScriptTarget.Latest, true, ts.ScriptKind.TS,
  );
  const checker = createToolcraftTypeScriptChecker(sourceFile, ts);
  const index = { unwrap: (node) => node };
  const keys = createToolcraftFlowPropertyKeys({ checker, index, ts });
  const first = keys.fromFact(keys.freshSymbol()).alternatives[0];
  const second = keys.fromFact(keys.freshSymbol()).alternatives[0];
  const owner = ts.factory.createIdentifier("owner");
  const stateFor = (key) => withObject(emptyState(), owner, objectFactFromDescriptors(
    new Map([[key, toolcraftDataDescriptor(exact([
      ts.factory.createStringLiteral("value"),
    ]))]]),
  ));
  assert.notEqual(toolcraftFlowStateKey(stateFor(first)),
    toolcraftFlowStateKey(stateFor(second)));
  assert.notEqual(toolcraftFlowStateKey(Object.freeze({ ...emptyState(),
    returnFact: keys.freshSymbol() })), toolcraftFlowStateKey(Object.freeze({
    ...emptyState(), returnFact: keys.freshSymbol(),
  })));
});

test("operation worlds require explicit owner cursor mode presence and completion", async () => {
  const { createOperationExhaustionWorld, createOperationWorld, operationWorldMetadataKey,
    operationWorldSemanticKey } = await import(
    "./toolcraft-flow-operation-world-types.mjs"
  );
  const world = createOperationWorld({ completion: "normal", cursor: "key:0",
    descriptorMode: "current", kind: "property-copy", owner: "owner:0",
    patchPresence: "none", payload: {}, state: emptyState() });
  for (const name of ["kind", "owner", "cursor", "descriptorMode",
    "patchPresence", "completion", "state", "payload"]) {
    assert.equal(Object.hasOwn(world, name), true, name);
  }
  assert.throws(() => createOperationWorld({ payload: {}, state: emptyState() }),
    TypeError);
  assert.throws(() => createOperationWorld({ completion: "normal",
    cursor: "neutral-cursor", descriptorMode: "current",
    kind: "neutral-unknown-kind", owner: "neutral-owner",
    patchPresence: "none", payload: {}, state: emptyState() }), TypeError);
  assert.throws(() => createOperationWorld({ completion: "normal",
    cursor: "neutral-cursor", descriptorMode: "current", kind: "property-copy",
    owner: "neutral-owner", patchPresence: "none", payload: { extra: true },
    state: emptyState() }), TypeError);
  assert.throws(() => createOperationWorld({ completion: "normal",
    cursor: "neutral-cursor", descriptorMode: "current", kind: "property-copy",
    owner: "neutral-owner", patchPresence: "none",
    payload: { [Symbol("extra")]: true }, state: emptyState() }), TypeError);
  assert.throws(() => createOperationExhaustionWorld({ completion: "normal",
    cursors: ["neutral-cursor"], descriptorModes: ["current"],
    kind: "property-copy", originalCardinality: 1, owners: ["neutral-owner"],
    patchPresences: ["none"], payload: { [Symbol("extra")]: true },
    state: emptyState() }), TypeError);

  const emptyDomain = Object.freeze({ finiteTypes: Object.freeze([]),
    typeIds: Object.freeze([]), unbounded: false });
  const coverage = Object.freeze({ string: Object.freeze({
    finiteTypes: Object.freeze([]), typeIds: Object.freeze([]), unbounded: true,
  }), symbol: emptyDomain });
  const cursor = (dynamicId) => Object.freeze({ alternatives: Object.freeze([]),
    coverage, dynamicId, kind: "PropertyKeyFact", unbounded: true });
  const cursorWorld = (dynamicId) => createOperationWorld({ completion: "normal",
    cursor: cursor(dynamicId), descriptorMode: "current", kind: "property-copy",
    owner: "neutral-owner", patchPresence: "none", payload: {},
    state: emptyState() });
  const first = cursorWorld("dynamic:a"), second = cursorWorld("dynamic:b");
  assert.notEqual(operationWorldMetadataKey(first), operationWorldMetadataKey(second));
  assert.notEqual(operationWorldSemanticKey(first), operationWorldSemanticKey(second));
});
