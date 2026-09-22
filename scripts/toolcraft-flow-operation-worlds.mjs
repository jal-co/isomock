import { ABSENT, mergeFacts, toolcraftEmptyPropertyRemainder } from
  "./toolcraft-flow-facts.mjs";
import { createDescriptorPatch } from "./toolcraft-flow-descriptor-patches.mjs";
import { assertOperationWorld, createOperationExhaustionWorld, createOperationWorld,
  operationWorldMetadataKey, operationWorldSemanticKey } from
  "./toolcraft-flow-operation-world-types.mjs";
import { joinToolcraftDescriptors, toolcraftAbsentDescriptor } from
  "./toolcraft-flow-property-descriptors.mjs";
import { joinToolcraftFlowPropertyRemainders, joinToolcraftOperationStates } from
  "./toolcraft-flow-state-joining.mjs";
const DEFAULT_LIMIT = 128;
const PATCH_FIELDS = ["configurable", "enumerable", "value", "writable",
  "get", "set"];
const BOOLEAN_PATCH_FIELDS = new Set(["configurable", "enumerable", "writable"]);
function isFact(value) {
  return value && ["absent", "exact", "hole", "overflow", "unknown"]
    .includes(value.kind);
}
function joinFact(values) {
  return mergeFacts(values.map((value) => value ?? ABSENT));
}
function descriptorMapKey(key) {
  return typeof key === "string" ? `string:${key}` : `symbol:${key?.id}`;
}
function joinDescriptorMaps(maps) {
  const keys = new Set(maps.flatMap((map) => [...map.keys()]));
  return new Map([...keys].sort((left, right) => descriptorMapKey(left)
    .localeCompare(descriptorMapKey(right))).map((key) => [key,
    joinToolcraftDescriptors(maps.map((map) =>
      map.get(key) ?? toolcraftAbsentDescriptor()), mergeFacts, ABSENT)]));
}
function joinFactMaps(maps) {
  const keys = new Set(maps.flatMap((map) => [...map.keys()]));
  return new Map([...keys].sort().map((key) => [key,
    joinFact(maps.map((map) => map.get(key)))]));
}
function joinPatch(patches) {
  if (patches.length === 0) return undefined;
  return createDescriptorPatch(Object.fromEntries(PATCH_FIELDS.flatMap((name) => {
    const values = patches.flatMap((patch) => patch[name]?.present
      ? [patch[name].value] : []);
    if (values.length === 0) return [];
    if (BOOLEAN_PATCH_FIELDS.has(name)) return [[name,
      values.every((value) => value === values[0]) ? values[0] : "unknown"]];
    if (!values.every(isFact)) throw new TypeError("Invalid descriptor patch payload");
    return [[name, joinFact(values)]];
  })));
}
function joinedPayload(worlds, kind, descriptorMode) {
  const payloads = worlds.map(({ payload }) => payload);
  if (kind === "descriptor-conversion") return {
    fields: joinFactMaps(payloads.map(({ fields }) => fields)),
  };
  if (kind === "property-delete") return {
    fact: joinFact(payloads.map(({ fact }) => fact)),
  };
  if (kind === "property-define") return {
    fact: joinFact(payloads.map(({ fact }) => fact)),
    patch: joinPatch(payloads.flatMap(({ patch }) => patch ? [patch] : [])),
  };
  const hasCopyMode = worlds.some(({ descriptorMode: mode }) => mode !== "current");
  const copied = worlds.map(({ descriptorMode: mode, payload }) =>
    kind === "property-copy" && mode === "current" ? {
      descriptors: new Map(),
      propertyRemainder: toolcraftEmptyPropertyRemainder(),
    } : payload).filter(({ descriptors }) => descriptors instanceof Map);
  if (kind === "property-copy" && descriptorMode !== "current" && hasCopyMode &&
    copied.length > 0) return {
    descriptors: joinDescriptorMaps(copied.map(({ descriptors }) => descriptors)),
    propertyRemainder: joinToolcraftFlowPropertyRemainders(copied.map(
      ({ propertyRemainder }) => propertyRemainder,
    )),
  };
  return {};
}
function normalizeTyped(worlds, limit) {
  const unique = new Map(worlds.map((world) => [operationWorldSemanticKey(world), world]));
  const ordered = [...unique.entries()].sort(([left], [right]) =>
    left.localeCompare(right)).map(([, world]) => world);
  const metadataGroups = new Map();
  for (const world of ordered) {
    const key = operationWorldMetadataKey(world);
    const group = metadataGroups.get(key) ?? { metadata: {
      completion: world.completion, cursor: world.cursor,
      descriptorMode: world.descriptorMode, kind: world.kind,
      owner: world.owner, patchPresence: world.patchPresence,
    }, worlds: [] };
    group.worlds.push(world); metadataGroups.set(key, group);
  }
  const records = [...metadataGroups.entries()].sort(([left], [right]) =>
    left.localeCompare(right)).map(([, { metadata, worlds: group }]) => {
      if (group.length === 1) return { cardinality: 1, world: group[0] };
      const joined = joinToolcraftOperationStates(group.map(({ state }) => state));
      return { cardinality: group.length, world: createOperationWorld({ ...metadata,
        payload: joinedPayload(group, metadata.kind, metadata.descriptorMode),
        state: joined.state }) };
    });
  if (records.length <= limit) return records.map(({ world }) => world);
  const buckets = new Map();
  for (const record of records) {
    const { completion, kind } = record.world;
    const key = `${kind}:${completion}`;
    const bucket = buckets.get(key) ?? { completion, kind, records: [] };
    bucket.records.push(record); buckets.set(key, bucket);
  }
  const exhausted = [...buckets.entries()].sort(([left], [right]) =>
    left.localeCompare(right)).map(([, { completion, kind, records: group }]) => {
      const entries = group.map(({ world }) => world);
      const joined = joinToolcraftOperationStates(entries.map(({ state }) => state));
      return createOperationExhaustionWorld({ completion,
        cursors: entries.map(({ cursor }) => cursor),
        descriptorModes: entries.map(({ descriptorMode }) => descriptorMode),
        exitLabels: joined.exitLabels, kind,
        originalCardinality: group.reduce((total, { cardinality }) =>
          total + cardinality, 0), owners: entries.map(({ owner }) => owner),
        patchPresences: entries.map(({ patchPresence }) => patchPresence),
        payload: joinedPayload(entries, kind), state: joined.state });
    });
  if (exhausted.length > limit) throw new Error(
    `Operation kind/completion space exceeded ${limit} worlds`,
  );
  return exhausted;
}
export function normalizeOperationWorlds(worlds, { limit = DEFAULT_LIMIT } = {}) {
  if (worlds.length === 0) return [];
  if (!Number.isInteger(limit) || limit < 1) {
    throw new TypeError("Operation world limit must be a positive integer");
  }
  worlds.forEach(assertOperationWorld);
  return normalizeTyped(worlds, Math.min(limit, DEFAULT_LIMIT));
}
