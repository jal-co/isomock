const callableKeys = new WeakMap();
const candidateKeys = new WeakMap();
const cellStoreKeys = new WeakMap();
const constructionFrameKeys = new WeakMap();
const constructionPlanKeys = new WeakMap();
const environmentKeys = new WeakMap();
const factKeys = new WeakMap();
const nodeKeys = new WeakMap();
const objectKeys = new WeakMap();
const objectStoreKeys = new WeakMap();
const positionalKeys = new WeakMap();
const stateKeys = new WeakMap();
const symbolKeys = new WeakMap();
const semanticKeys = new Map();
const MAX_SEMANTIC_KEY_BYTES = 1_048_576;
let nextIdentity = 0;
let semanticKeyBytes = 0;
function cached(cache, value, create) {
  const known = cache.get(value);
  if (known !== undefined) return known;
  const key = create();
  cache.set(value, key);
  return key;
}
function identity(cache, value, kind) {
  return cached(cache, value, () => `${kind}:${nextIdentity += 1}`);
}
function encoded(value) {
  return JSON.stringify(value);
}
function semantic(kind, value) {
  const structured = encoded([kind, value]);
  const known = semanticKeys.get(structured);
  if (known !== undefined) return known;
  if (semanticKeyBytes + structured.length > MAX_SEMANTIC_KEY_BYTES) {
    return structured;
  }
  const key = `${kind}:${nextIdentity += 1}`;
  semanticKeys.set(structured, key);
  semanticKeyBytes += structured.length;
  return key;
}
function sorted(values) {
  return [...values].sort();
}
function syntheticNodeKey(node) {
  const text = typeof node.text === "string" ? node.text
    : typeof node.escapedText === "string" ? node.escapedText : undefined;
  return text === undefined ? undefined : semantic("synthetic", [node.kind, text]);
}
function nodeKey(node) {
  if (!node) return "missing-node";
  const freshSymbol = symbolKeys.get(node);
  if (freshSymbol !== undefined) return freshSymbol;
  if (!Number.isInteger(node.pos) || node.pos < 0) {
    const synthetic = syntheticNodeKey(node);
    if (synthetic) return synthetic;
  }
  return identity(nodeKeys, node, "node");
}
function symbolKey(symbol) {
  return symbol ? identity(symbolKeys, symbol, "symbol") : "missing-symbol";
}

export function registerToolcraftFlowSymbolNode(node) {
  return symbolKey(node);
}

function factKey(fact) {
  if (!fact) return "missing-fact";
  return cached(factKeys, fact, () => {
    if (["unknown", "overflow"].includes(fact.kind) &&
      fact.possibleValues?.length) {
      return semantic("fact", [fact.kind,
        sorted(fact.possibleValues.map(nodeKey))]);
    }
    if (fact.kind !== "exact") return semantic("fact", [fact.kind]);
    return semantic("fact", ["exact", sorted(fact.values.map(nodeKey))]);
  });
}

function environmentKey(environment) {
  return cached(environmentKeys, environment, () => semantic("environment", sorted(
    [...environment].map(([symbol, cell]) => encoded([symbolKey(symbol), cell.id])),
  )));
}

function cellsKey(cells) {
  return cached(cellStoreKeys, cells, () => semantic("cells", sorted(
    [...cells].map(([cell, fact]) => encoded([cell.id, factKey(fact)])),
  )));
}

function positionalKey(value) {
  if (!value) return "no-positional";
  return cached(positionalKeys, value, () => semantic("positional", [
    value.variants.map((variant) => variant.map(nodeKey)),
    value.tails.map(nodeKey),
    sorted(value.evidence),
  ]));
}

function propertyKey(key) {
  if (typeof key === "string") return semantic("property-key", ["string", key]);
  if (key?.kind === "symbol") return semantic("property-key", [
    "symbol", key.id,
  ]);
  return semantic("property-key", [key?.kind ?? "unknown", key?.id ?? null]);
}

function descriptorKey(descriptor) {
  return [descriptor?.insertionOrder ?? 0, descriptor?.writeOrder ?? 0, ...sorted(
    (descriptor?.alternatives ?? []).map((alternative) => encoded(
    alternative.kind === "absent" ? ["absent"]
      : alternative.kind === "data" ? ["data", alternative.enumerable,
          alternative.writable, alternative.configurable,
          factKey(alternative.valueFact)]
        : ["accessor", alternative.enumerable, alternative.configurable,
          factKey(alternative.getFact), factKey(alternative.setFact)]
  )))];
}

function coverageKey(coverage) {
  return ["string", "symbol"].map((domain) => [domain,
    coverage?.[domain]?.unbounded === true,
    sorted(coverage?.[domain]?.typeIds ?? [])]);
}

function remainderKey(remainder) {
  return [coverageKey(remainder?.coverage),
    (remainder?.entries ?? []).map(({ coverage, descriptor, id, order }) => [
      id, order, coverageKey(coverage), descriptorKey(descriptor),
    ]),
    descriptorKey(remainder?.string), descriptorKey(remainder?.symbol)];
}

function objectKey(object) {
  return cached(objectKeys, object, () => semantic("object", [
    remainderKey(object?.propertyRemainder),
    factKey(object?.prototypeFact),
    sorted([...(object?.propertyDescriptors ?? [])].map(([name, descriptor]) =>
      encoded([propertyKey(name), descriptorKey(descriptor)]))),
    object?.array ? [
      object.array.slots.map(factKey), object.array.tails.map(nodeKey),
      sorted(object.array.evidence),
    ] : null,
  ]));
}

function constructionPlanKey(plan) {
  if (!plan) return "no-construction-plan";
  return cached(constructionPlanKeys, plan, () => semantic("construction-plan", [
    nodeKey(plan.classNode),
    nodeKey(plan.constructor),
    plan.derived === true,
    plan.unsupported === true,
    (plan.bases ?? []).map(candidateKey),
    (plan.elements ?? []).map(({ callableFact, key, keyFact, member }) => [
      typeof key === "string" ? key : key?.id ?? null,
      factKey(keyFact), factKey(callableFact), nodeKey(member),
    ]),
    (plan.fields ?? []).map(({ capturedEnvironment, initializer, key, keyFact,
      member }) => [
      key ?? null, factKey(keyFact), nodeKey(initializer), nodeKey(member),
      capturedEnvironment ? environmentKey(capturedEnvironment)
        : "no-field-environment",
    ]),
    factKey(plan.prototypeFact),
  ]));
}

function constructionFrameKey(frame) {
  if (!frame) return "no-construction-frame";
  return cached(constructionFrameKeys, frame, () => semantic(
    "construction-frame", [
      constructionPlanKey(frame.plan), frame.phase, factKey(frame.instanceFact),
    ],
  ));
}

function objectsKey(objects) {
  return cached(objectStoreKeys, objects, () => semantic("objects", sorted(
    [...objects].map(([owner, object]) =>
      encoded([nodeKey(owner), objectKey(object)])),
  )));
}

function candidateKey(candidate) {
  return cached(candidateKeys, candidate, () => semantic("candidate", [
    nodeKey(candidate.fn),
    (candidate.bound ?? []).map(factKey),
    (candidate.boundSources ?? []).map(nodeKey),
    positionalKey(candidate.boundSourceShape),
    candidate.external === true,
    nodeKey(candidate.callableSource),
    candidate.thisBound === true,
    factKey(candidate.thisFact),
    nodeKey(candidate.thisSource),
    candidate.capturedEnvironment
      ? environmentKey(candidate.capturedEnvironment) : "no-captured-environment",
    constructionPlanKey(candidate.construction),
  ]));
}

function callablesKey(callables) {
  return cached(callableKeys, callables, () => semantic("callables", sorted(
    [...callables].map(([owner, candidates]) => encoded([
      nodeKey(owner), sorted(candidates.map(candidateKey)),
    ])),
  )));
}

export function toolcraftFlowStateKey(state) {
  return cached(stateKeys, state, () => encoded([
    state.exit,
    state.exitLabel ?? null,
    factKey(state.returnFact),
    factKey(state.thisFact),
    constructionFrameKey(state.constructionFrame),
    state.overflow,
    environmentKey(state.environment),
    cellsKey(state.cells),
    objectsKey(state.objects),
    callablesKey(state.callables),
  ]));
}

export function toolcraftFlowDescriptorKey(value) {
  return encoded(descriptorKey(value));
}
export function toolcraftFlowFactKey(value) {
  return factKey(value);
}
export function toolcraftFlowNodeKey(value) {
  return nodeKey(value);
}
export function toolcraftFlowPropertyRemainderKey(value) {
  return encoded(remainderKey(value));
}
