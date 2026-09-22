import { exact, mergeFacts } from "./toolcraft-flow-facts.mjs";
import { descriptorValueFacts, mapToolcraftDescriptorFacts } from
  "./toolcraft-flow-property-descriptors.mjs";

function readOnlyTable(table) {
  const entries = Object.freeze([...table].map(([key, value]) =>
    Object.freeze([key, value])
  ));
  const snapshot = new Map(entries);
  return Object.freeze({
    [Symbol.iterator]: () => entries[Symbol.iterator](),
    entries: () => entries,
    get: (key) => snapshot.get(key),
    has: (key) => snapshot.has(key),
    keys: () => Object.freeze(entries.map(([key]) => key)),
    values: () => Object.freeze(entries.map(([, value]) => value)),
  });
}

export function publicToolcraftObjectFact(object, state, index) {
  const array = object.array && Object.freeze({
    evidence: Object.freeze([...object.array.evidence]),
    slots: Object.freeze([...object.array.slots]),
    tails: Object.freeze([...object.array.tails]),
  });
  const publicFact = (fact) => fact?.kind === "exact" ? exact(
    fact.values.flatMap((value) => {
      const candidates = state?.callables?.get(index?.unwrap(value)) ?? [];
      return candidates.length > 0
        ? candidates.map(({ callableSource, fn }) => fn ?? callableSource)
          .filter(Boolean) : [value];
    }),
  ) : fact;
  const propertyDescriptors = new Map([...object.propertyDescriptors].map(
    ([name, descriptor]) => [name,
      mapToolcraftDescriptorFacts(descriptor, publicFact)],
  ));
  const properties = new Map([...propertyDescriptors].flatMap(
    ([name, descriptor]) => {
      const values = descriptorValueFacts(descriptor);
      return values.length > 0 ? [[name, mergeFacts(values)]] : [];
    },
  ));
  return Object.freeze({
    array,
    properties: readOnlyTable(properties),
    propertyDescriptors: readOnlyTable(propertyDescriptors),
    propertyRemainder: object.propertyRemainder,
  });
}
