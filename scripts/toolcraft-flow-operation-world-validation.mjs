import { assertToolcraftFlowPropertyKeyFact } from
  "./toolcraft-flow-property-key-facts.mjs";

const COMPLETIONS = new Set(["break", "continue", "normal", "return", "throw"]);
const MODES = Object.freeze({
  "descriptor-conversion": new Set(["conversion"]),
  "property-assign": new Set([
    "create", "data-reject", "data-write", "setter-call", "setter-missing",
  ]),
  "property-copy": new Set(["current", "spread-copy", "spread-skip"]),
  "property-define": new Set(["define", "define-result"]),
  "property-delete": new Set(["delete"]),
});
const PRESENCE = Object.freeze({
  "descriptor-conversion": (value) => value === "patch" || /^[01]{6}$/u.test(value),
  "property-assign": (value) => value === "none",
  "property-copy": (value) => value === "none",
  "property-define": (value) => value === "absent" || /^[01]{6}$/u.test(value),
  "property-delete": (value) => value === "none",
});
const WORLD_KEYS = new Set([
  "completion", "cursor", "descriptorMode", "factKind", "kind", "owner",
  "patchPresence", "payload", "state",
]);
if (Object.keys(MODES).length * COMPLETIONS.size >= 128) {
  throw new Error("Operation kind/completion space must stay below 128 worlds");
}

function onlyKeys(value, expected) {
  return Reflect.ownKeys(value).every((key) => expected.includes(key));
}
function exactKeys(value, expected) {
  const keys = Reflect.ownKeys(value ?? {});
  return keys.length === expected.size && keys.every((key) =>
    typeof key === "string" && expected.has(key));
}
function payloadMatches(kind, descriptorMode, payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  if (kind === "descriptor-conversion") return onlyKeys(payload, ["fields"]) &&
    payload.fields instanceof Map;
  if (kind === "property-delete") return onlyKeys(payload, ["fact"]) &&
    payload.fact !== undefined;
  if (kind === "property-define") return payload.fact !== undefined &&
    onlyKeys(payload, ["fact", "patch"]) &&
    (payload.patch === undefined || payload.patch?.factKind === "DescriptorPatchFact");
  if (kind === "property-copy" && descriptorMode !== "current") {
    return onlyKeys(payload, ["descriptors", "propertyRemainder"]) &&
      payload.descriptors instanceof Map && Boolean(payload.propertyRemainder?.coverage);
  }
  return Reflect.ownKeys(payload).length === 0;
}
function validState(state, completion) {
  return state?.environment instanceof Map && state?.objects instanceof Map &&
    state.exit === completion;
}
function validateCursor(cursor) {
  if (cursor?.kind === "PropertyKeyFact") assertToolcraftFlowPropertyKeyFact(cursor);
}

export function assertToolcraftOperationWorldFields(input) {
  const { completion, cursor, descriptorMode, kind, owner, patchPresence,
    payload, state } = input;
  validateCursor(cursor);
  if (!Object.hasOwn(MODES, kind) || !MODES[kind].has(descriptorMode) ||
    !COMPLETIONS.has(completion) || cursor === undefined || owner === undefined ||
    !PRESENCE[kind](patchPresence) || !payloadMatches(kind, descriptorMode, payload) ||
    !validState(state, completion)) throw new TypeError("Invalid typed operation world");
}

export function assertClosedToolcraftOperationWorld(world) {
  if (!exactKeys(world, WORLD_KEYS) || world.factKind !== "OperationWorld") {
    throw new TypeError("Invalid typed operation world shape");
  }
  assertToolcraftOperationWorldFields(world);
}

export function assertToolcraftOperationExhaustionFields(input) {
  const { completion, cursors, descriptorModes, exitLabels = [], kind,
    originalCardinality, owners, patchPresences, payload, state } = input;
  const lists = [cursors, descriptorModes, owners, patchPresences];
  const mode = kind === "property-copy" && descriptorModes?.some(
    (value) => value !== "current") ? "spread-copy" : descriptorModes?.[0];
  cursors?.forEach(validateCursor);
  if (!Object.hasOwn(MODES, kind) || !COMPLETIONS.has(completion) ||
    lists.some((values) => !Array.isArray(values) || values.length === 0 ||
      values.length !== cursors.length) || !Array.isArray(exitLabels) ||
    descriptorModes.some((value) => !MODES[kind].has(value)) ||
    patchPresences.some((value) => !PRESENCE[kind](value)) ||
    cursors.some((value) => value === undefined) ||
    owners.some((value) => value === undefined) ||
    !Number.isInteger(originalCardinality) || originalCardinality < 1 ||
    !payloadMatches(kind, mode, payload) || !validState(state, completion)) {
    throw new TypeError("Invalid typed operation exhaustion world");
  }
}
