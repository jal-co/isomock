import { toolcraftFlowStateKey } from "./toolcraft-flow-state-keys.mjs";
import {
  mapToolcraftDescriptorFacts, toolcraftAbsentDescriptor,
  toolcraftDataDescriptor, toolcraftUncertainDescriptor,
  toolcraftUnknownDescriptor,
} from "./toolcraft-flow-property-descriptors.mjs";

export const MAX_FLOW_EXITS = 32;
export const MAX_FLOW_ALTERNATIVES = 16;
export const MAX_POSITIONAL_SLOTS = 128;

export const ABSENT = Object.freeze({ kind: "absent" });
export const HOLE = Object.freeze({ kind: "hole" });
export const UNKNOWN = Object.freeze({ kind: "unknown" });
export const OVERFLOW = Object.freeze({ kind: "overflow" });

function overflow(values = []) {
  const possibleValues = [...new Set(values)];
  return possibleValues.length === 0 ? OVERFLOW : Object.freeze({
    kind: "overflow", possibleValues: Object.freeze(possibleValues),
  });
}

export function exact(values) {
  const unique = [...new Set(values)];
  return unique.length > MAX_FLOW_ALTERNATIVES
    ? overflow(unique)
    : Object.freeze({ kind: "exact", values: Object.freeze(unique) });
}

export function uncertain(fact) {
  const possibleValues = fact?.kind === "exact" ? fact.values
    : fact?.possibleValues ?? [];
  return possibleValues.length === 0 ? UNKNOWN : Object.freeze({
    kind: "unknown",
    possibleValues: Object.freeze([...new Set(possibleValues)]),
  });
}

export function mergeFacts(facts) {
  if (facts.length === 0 || facts.every(({ kind }) => kind === "absent")) {
    return ABSENT;
  }
  if (facts.some(({ kind }) => kind === "overflow")) return overflow(
    facts.flatMap((fact) => fact.kind === "exact" ? fact.values
      : fact.possibleValues ?? []),
  );
  if (facts.some(({ kind }) => kind === "unknown") ||
    facts.some(({ kind }) => kind === "absent")) {
    const candidates = facts.flatMap((fact) => fact.kind === "exact"
      ? fact.values : fact.possibleValues ?? []);
    return uncertain(exact(candidates));
  }
  return exact(facts.flatMap(({ values }) => values));
}

export function positional(variants, tails = [], evidence = []) {
  const items = variants.flat();
  if (variants.length > MAX_FLOW_ALTERNATIVES ||
    items.length > MAX_POSITIONAL_SLOTS || tails.length > MAX_POSITIONAL_SLOTS) {
    return Object.freeze({
      evidence: Object.freeze([...evidence, "overflow-span"]),
      kind: "array",
      tails: Object.freeze([...new Set(tails)].slice(0, MAX_POSITIONAL_SLOTS)),
      variants: Object.freeze(variants.slice(0, MAX_FLOW_ALTERNATIVES).map(
        (variant) => Object.freeze(variant.slice(0, MAX_POSITIONAL_SLOTS)),
      )),
    });
  }
  return Object.freeze({
    evidence: Object.freeze([...new Set(evidence)]),
    kind: "array",
    tails: Object.freeze([...new Set(tails)]),
    variants: Object.freeze(variants.map((variant) => Object.freeze(variant))),
  });
}

export function emptyState() {
  return Object.freeze({
    callables: new Map(),
    cells: new Map(),
    constructionFrame: undefined,
    environment: new Map(),
    exit: "normal",
    exitLabel: undefined,
    objects: new Map(),
    overflow: false,
    returnFact: ABSENT,
    thisFact: ABSENT,
  });
}

export function updateState(state, changes) {
  return Object.freeze({ ...state, ...changes });
}

export function withCallable(state, identity, candidates) {
  const callables = new Map(state.callables);
  callables.set(identity, Object.freeze(candidates.map((candidate) =>
    Object.freeze({
      ...candidate,
      bound: Object.freeze([...candidate.bound]),
      boundSources: Object.freeze([...(candidate.boundSources ?? [])]),
      capturedEnvironment: candidate.capturedEnvironment &&
        new Map(candidate.capturedEnvironment),
    })
  )));
  return updateState(state, { callables });
}

export function withObject(state, identity, object) {
  const objects = new Map(state.objects);
  objects.set(identity, Object.freeze(object));
  return updateState(state, { objects });
}

export function withOpaqueObject(state, identity, opaqueRemainder) {
  const object = state.objects.get(identity);
  if (!object) return state;
  const propertyDescriptors = new Map([...object.propertyDescriptors]
    .map(([name, descriptor]) => [name, toolcraftUncertainDescriptor(
      mapToolcraftDescriptorFacts(descriptor, uncertain),
    )]));
  const array = object.array && Object.freeze({
    ...object.array,
    evidence: Object.freeze([...new Set([
      ...object.array.evidence, "opaque-mutation",
    ])]),
    slots: Object.freeze(object.array.slots.map(() => UNKNOWN)),
  });
  return withObject(state, identity, {
    ...object,
    array,
    propertyDescriptors,
    propertyRemainder: opaqueRemainder ?? toolcraftUnboundedPropertyRemainder(
      toolcraftUnknownDescriptor({ valueFact: UNKNOWN }),
    ),
  });
}

export function withExit(state, exit, exitLabel) {
  return updateState(state, { exit, exitLabel });
}

export function withCompletion(state, exit, returnFact = ABSENT, exitLabel) {
  return updateState(state, { exit, exitLabel, returnFact });
}

export function completionOf(state) {
  return Object.freeze({
    exit: state.exit,
    exitLabel: state.exitLabel,
    returnFact: state.returnFact,
  });
}

export function suspendCompletion(state) {
  return withCompletion(state, "normal", ABSENT);
}

export function boundStates(states) {
  if (states.length <= 1) return states;
  const unique = new Map();
  for (const state of states) unique.set(toolcraftFlowStateKey(state), state);
  if (unique.size <= MAX_FLOW_EXITS) return [...unique.values()];
  const first = unique.values().next().value ?? emptyState();
  return [updateState(first, { overflow: true })];
}

export function normalStates(states) {
  return states.filter(({ exit }) => exit === "normal");
}

export function resumeCompletion(finallyState, completion) {
  return finallyState.exit === "normal"
    ? withCompletion(finallyState, completion.exit,
        completion.returnFact, completion.exitLabel)
    : finallyState;
}

function emptyCoverageDomain() {
  return Object.freeze({ finiteTypes: Object.freeze([]), typeIds: Object.freeze([]),
    unbounded: false });
}

export function toolcraftEmptyPropertyRemainder() {
  return Object.freeze({ coverage: Object.freeze({
    string: emptyCoverageDomain(), symbol: emptyCoverageDomain(),
  }), entries: Object.freeze([]), string: toolcraftAbsentDescriptor(),
  symbol: toolcraftAbsentDescriptor() });
}

export function toolcraftUnboundedPropertyRemainder(descriptor) {
  const domain = () => Object.freeze({ finiteTypes: Object.freeze([]),
    typeIds: Object.freeze([]), unbounded: true });
  return Object.freeze({ coverage: Object.freeze({
    string: domain(), symbol: domain(),
  }), entries: Object.freeze([]), string: descriptor, symbol: descriptor });
}

export function objectFact(properties = new Map(), options = {}) {
  const array = options.array;
  const uncertain = options.uncertain ?? new Set();
  const prototypeFact = options.prototypeFact ?? ABSENT;
  const propertyDescriptors = new Map([...properties].map(([name, fact]) => [
    name,
    uncertain.has(name)
      ? toolcraftUnknownDescriptor({ valueFact: fact })
      : toolcraftDataDescriptor(fact),
  ]));
  return Object.freeze({ array, propertyDescriptors,
    propertyRemainder: options.propertyRemainder ??
      toolcraftEmptyPropertyRemainder(),
    prototypeFact });
}

export function objectFactFromDescriptors(
  propertyDescriptors = new Map(),
  options = {},
) {
  return Object.freeze({ propertyDescriptors: new Map(
    propertyDescriptors,
  ), propertyRemainder: options.propertyRemainder ??
      toolcraftEmptyPropertyRemainder(),
    prototypeFact: options.prototypeFact ?? ABSENT,
    array: options.array });
}
