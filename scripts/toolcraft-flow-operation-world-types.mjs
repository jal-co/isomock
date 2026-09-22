import { toolcraftFlowDescriptorKey, toolcraftFlowFactKey,
  toolcraftFlowPropertyRemainderKey, toolcraftFlowStateKey } from
  "./toolcraft-flow-state-keys.mjs";
import { toolcraftFlowPropertyKeyFactKey } from
  "./toolcraft-flow-property-key-facts.mjs";
import { assertClosedToolcraftOperationWorld,
  assertToolcraftOperationExhaustionFields, assertToolcraftOperationWorldFields } from
  "./toolcraft-flow-operation-world-validation.mjs";
function stableValue(value, seen = new Set()) {
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return "[cycle]";
  if (value.environment instanceof Map && value.objects instanceof Map) {
    return `state:${toolcraftFlowStateKey(value)}`;
  }
  if (["absent", "exact", "hole", "overflow", "unknown"].includes(value.kind)) {
    return `fact:${toolcraftFlowFactKey(value)}`;
  }
  if (value.factKind === "PropertyDescriptorFact") {
    return `descriptor:${toolcraftFlowDescriptorKey(value)}`;
  }
  if (value.kind === "PropertyKeyFact") {
    return toolcraftFlowPropertyKeyFactKey(value);
  }
  if (value.coverage?.string && value.coverage?.symbol) {
    return `remainder:${toolcraftFlowPropertyRemainderKey(value)}`;
  }
  seen.add(value);
  const result = value instanceof Map
    ? [...value].map(([key, item]) => [stableValue(key, seen),
        stableValue(item, seen)]).sort(([left], [right]) =>
        JSON.stringify(left).localeCompare(JSON.stringify(right)))
    : Array.isArray(value) ? value.map((item) => stableValue(item, seen))
      : Object.fromEntries(Object.keys(value).sort().map((key) =>
          [key, stableValue(value[key], seen)]));
  seen.delete(value);
  return result;
}
function frozenCoverage(values) {
  return Object.freeze([...new Set(values.flatMap((value) =>
    Array.isArray(value) ? value : [value]).filter((value) => value !== undefined))]
    .sort((left, right) => String(left).localeCompare(String(right))));
}
export function createOperationWorld({ completion, cursor, descriptorMode,
  kind, owner, patchPresence, payload, state }) {
  assertToolcraftOperationWorldFields({ completion, cursor, descriptorMode, kind, owner,
    patchPresence, payload, state });
  return Object.freeze({ completion, cursor, descriptorMode,
    factKind: "OperationWorld", kind, owner, patchPresence,
    payload: Object.freeze({ ...payload }), state });
}
export function assertOperationWorld(world) {
  if (world?.factKind !== "OperationWorld" || world.exhausted === true) {
    throw new TypeError("normalizeOperationWorlds requires typed operation worlds");
  }
  assertClosedToolcraftOperationWorld(world);
  return world;
}

export function createOperationExhaustionWorld({ completion, cursors,
  descriptorModes, exitLabels = [], kind, originalCardinality, owners,
  patchPresences, payload, state }) {
  assertToolcraftOperationExhaustionFields({ completion, cursors, descriptorModes,
    exitLabels, kind, originalCardinality, owners, patchPresences, payload, state });
  const cursor = Object.freeze(frozenCoverage(cursors));
  const descriptorMode = Object.freeze(frozenCoverage(descriptorModes));
  const owner = Object.freeze(frozenCoverage(owners));
  const patchPresence = Object.freeze(frozenCoverage(patchPresences));
  const exhaustionEvent = Object.freeze({ completion,
    cursor, descriptorMode, exitLabels: Object.freeze(frozenCoverage(exitLabels)),
    kind: "ExhaustionEvent", operationKind: kind, originalCardinality,
    owner, patchPresence });
  return Object.freeze({ completion, cursor, descriptorMode, exhausted: true,
    exhaustionEvent,
    factKind: "OperationWorld", kind, owner, patchPresence,
    payload: Object.freeze({ ...payload }), state });
}

export function operationWorldMetadataKey(world) {
  return JSON.stringify(stableValue({ completion: world.completion,
    cursor: world.cursor, descriptorMode: world.descriptorMode,
    kind: world.kind, owner: world.owner, patchPresence: world.patchPresence }));
}

export function operationWorldSemanticKey(world) {
  return JSON.stringify(stableValue({ completion: world.completion,
    cursor: world.cursor, descriptorMode: world.descriptorMode,
    exhausted: world.exhausted === true, exhaustionEvent: world.exhaustionEvent,
    kind: world.kind, owner: world.owner,
    patchPresence: world.patchPresence, payload: world.payload,
    state: world.state }));
}
