import {
  ABSENT, UNKNOWN, mergeFacts, objectFactFromDescriptors,
  toolcraftEmptyPropertyRemainder, updateState,
} from "./toolcraft-flow-facts.mjs";
import { createToolcraftFlowCell } from "./toolcraft-flow-environments.mjs";
import {
  joinToolcraftDescriptors, toolcraftAbsentDescriptor,
  toolcraftUnknownDescriptor,
} from "./toolcraft-flow-property-descriptors.mjs";

function joinDescriptorOutcomes(descriptors) {
  return joinToolcraftDescriptors(descriptors, mergeFacts, ABSENT);
}

function joinCoverage(domains) {
  const types = new Map(domains.flatMap((domain) =>
    (domain?.finiteTypes ?? []).map((type, position) => [
      domain.typeIds?.[position] ?? `type:${type.id}`, type,
    ])
  ));
  const retained = [...types.entries()].sort(([left], [right]) =>
    left.localeCompare(right)).slice(0, 8);
  return Object.freeze({ finiteTypes: Object.freeze(retained.map(([, type]) =>
    type)), typeIds: Object.freeze(retained.map(([id]) => id)),
    unbounded: domains.some(({ unbounded } = {}) => unbounded) || types.size > 8 });
}

export function joinToolcraftFlowPropertyRemainders(values) {
  const remainders = values.map((value) => value ??
    toolcraftEmptyPropertyRemainder());
  const entryIds = new Set(remainders.flatMap(({ entries = [] }) =>
    entries.map(({ id }) => id)));
  const entries = [...entryIds].sort().map((id) => {
    const matches = remainders.map((remainder) =>
      (remainder.entries ?? []).find((entry) => entry.id === id));
    const present = matches.filter(Boolean);
    return Object.freeze({ coverage: Object.freeze({
      string: joinCoverage(present.map(({ coverage }) => coverage.string)),
      symbol: joinCoverage(present.map(({ coverage }) => coverage.symbol)),
    }), descriptor: joinDescriptorOutcomes(matches.map((entry) =>
      entry?.descriptor ?? toolcraftAbsentDescriptor())), id, order: Math.min(
        ...present.map(({ order }) => order)) });
  }).sort((left, right) => left.order - right.order || left.id.localeCompare(right.id));
  return Object.freeze({ coverage: Object.freeze({
    string: joinCoverage(remainders.map(({ coverage }) => coverage.string)),
    symbol: joinCoverage(remainders.map(({ coverage }) => coverage.symbol)),
  }), entries: Object.freeze(entries),
  string: joinDescriptorOutcomes(remainders.map(({ string }) => string)),
  symbol: joinDescriptorOutcomes(remainders.map(({ symbol }) => symbol)) });
}

function joinedObject(objects) {
  const propertyDescriptors = new Map();
  const names = new Set(objects.flatMap((object) =>
    object ? [...object.propertyDescriptors.keys()] : []
  ));
  for (const name of names) {
    propertyDescriptors.set(name, joinDescriptorOutcomes(objects.map((object) =>
      object?.propertyDescriptors.get(name)
    )));
  }
  const arrays = objects.map(({ array } = {}) => array);
  const array = arrays.every(Boolean) ? Object.freeze({
    evidence: Object.freeze([...new Set(arrays.flatMap(({ evidence }) => evidence))]),
    slots: Object.freeze(Array.from({
      length: Math.max(...arrays.map(({ slots }) => slots.length)),
    }, (_, position) => mergeFacts(arrays.map(({ slots }) =>
      slots[position] ?? ABSENT
    )))),
    tails: Object.freeze([...new Set(arrays.flatMap(({ tails }) => tails))]),
  }) : undefined;
  const propertyRemainder = joinToolcraftFlowPropertyRemainders(objects.map(
    (object) => object?.propertyRemainder,
  ));
  return objectFactFromDescriptors(propertyDescriptors, { array,
    propertyRemainder, prototypeFact: mergeFacts(objects.map((object) =>
      object?.prototypeFact ?? ABSENT
    )) });
}

function joinExitStates(states) {
  const allCells = new Set(states.flatMap(({ cells }) => [...cells.keys()]));
  const cells = new Map([...allCells].map((cell) => [cell, mergeFacts(
    states.flatMap((state) => state.cells.has(cell) ? [state.cells.get(cell)] : []),
  )]));
  const symbols = new Set(states.flatMap(({ environment }) =>
    [...environment.keys()]
  ));
  const environment = new Map();
  for (const symbol of symbols) {
    const sourceCells = states.map((state) => state.environment.get(symbol));
    const present = [...new Set(sourceCells.filter(Boolean))];
    const cell = present.length === 1 ? present[0] : createToolcraftFlowCell();
    environment.set(symbol, cell);
    cells.set(cell, mergeFacts(states.map((state, index) => {
      const source = sourceCells[index];
      return source ? state.cells.get(source) ?? UNKNOWN : ABSENT;
    })));
  }
  const identities = new Set(states.flatMap(({ objects }) => [...objects.keys()]));
  const objects = new Map([...identities].map((identity) => [identity,
    joinedObject(states.map((state) => state.objects.get(identity)).filter(Boolean)),
  ]));
  const callableIdentities = new Set(states.flatMap(({ callables }) =>
    [...callables.keys()]
  ));
  const callables = new Map([...callableIdentities].map((identity) => [identity,
    Object.freeze([...new Set(states.flatMap((state) =>
      state.callables.get(identity) ?? []
    ))]),
  ]));
  const frames = new Set(states.map(({ constructionFrame }) => constructionFrame));
  const exits = new Set(states.map(({ exit }) => exit));
  const exitLabels = new Set(states.map(({ exitLabel }) => exitLabel));
  if (exits.size !== 1 || exitLabels.size !== 1) {
    throw new Error("joinExitStates requires one completion partition");
  }
  return Object.freeze({
    callables,
    cells,
    constructionFrame: frames.size === 1 ? frames.values().next().value : undefined,
    environment,
    exit: exits.values().next().value,
    exitLabel: exitLabels.values().next().value,
    objects,
    overflow: states.some(({ overflow }) => overflow),
    returnFact: mergeFacts(states.map(({ returnFact }) => returnFact ?? ABSENT)),
    thisFact: mergeFacts(states.map(({ thisFact }) => thisFact ?? ABSENT)),
  });
}

export function joinLoopPostStates(states) {
  return joinToolcraftFlowStates(states);
}

export function joinToolcraftFlowStates(states) {
  if (states.length === 0) return [];
  return [...Map.groupBy(states, ({ exit, exitLabel, overflow }) =>
    `${exit}:${exitLabel ?? ""}:${overflow}`
  ).values()].map(joinExitStates);
}

export function joinToolcraftOperationStates(states) {
  if (states.length === 0) return undefined;
  const exitLabels = Object.freeze([...new Set(states.map(({ exitLabel }) =>
    exitLabel).filter((value) => value !== undefined))].sort());
  const normalized = states.map((state) => updateState(state, {
    exitLabel: undefined, overflow: false,
  }));
  const joined = joinToolcraftFlowStates(normalized);
  if (joined.length !== 1) throw new Error(
    "Operation states must share one completion before joining",
  );
  return Object.freeze({ exitLabels, state: updateState(joined[0], {
    exitLabel: exitLabels.length === 1 ? exitLabels[0] : undefined,
    overflow: states.some(({ overflow }) => overflow),
  }) });
}

export function compactToolcraftFlowStates(states, threshold = 8) {
  if (states.length <= threshold) return states;
  return joinToolcraftFlowStates(states);
}
