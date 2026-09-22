import {
  ABSENT, MAX_POSITIONAL_SLOTS, UNKNOWN, mergeFacts,
  objectFactFromDescriptors, toolcraftEmptyPropertyRemainder, withObject,
} from "./toolcraft-flow-facts.mjs";
import { createToolcraftExternalPropertyFacts } from
  "./toolcraft-flow-external-properties.mjs";
import {
  descriptorValueFacts, toolcraftAbsentDescriptor, toolcraftDataDescriptor,
  withToolcraftDescriptorWriteOrder,
} from "./toolcraft-flow-property-descriptors.mjs";
import { createToolcraftFlowPropertyQueries } from
  "./toolcraft-flow-property-queries.mjs";

export function createToolcraftFlowPropertyMemory({
  checker, index, materialize, propertyKeys, ts,
}) {
  let nextPropertyWrite = 0;
  const external = createToolcraftExternalPropertyFacts({
    checker, index, propertyKeys, ts,
  });
  const queries = createToolcraftFlowPropertyQueries({
    external, index, materialize, propertyKeys, ts,
  });

  function nextInsertionOrder(object, writeOrder) {
    const exact = [...object.propertyDescriptors.values()].map(
      ({ insertionOrder = 0 }) => insertionOrder,
    );
    const remainder = (object.propertyRemainder?.entries ?? [])
      .map(({ order = 0 }) => order);
    return Math.max(writeOrder, 1 + Math.max(0, ...exact, ...remainder));
  }

  function storeDescriptor(baseFact, member, descriptor, state) {
    if (baseFact?.kind !== "exact") return state;
    const keys = queries.keyAlternatives(member);
    if (keys.length !== 1) return baseFact.values.reduce((current, value) =>
      external.markOpaque(value, current), state);
    const key = queries.mapKey(keys[0]);
    const writeOrder = nextPropertyWrite += 1;
    return baseFact.values.reduce((current, value) => {
      const identity = index.unwrap(value);
      const object = current.objects.get(identity);
      if (!object) return current;
      const propertyDescriptors = new Map(object.propertyDescriptors);
      const previous = propertyDescriptors.get(key);
      const previousPresent = previous?.alternatives?.some(
        ({ kind }) => kind !== "absent",
      );
      const incomingPresent = descriptor?.alternatives?.some(
        ({ kind }) => kind !== "absent",
      );
      const insertionOrder = previous && (previousPresent || !incomingPresent)
        ? previous.insertionOrder ?? writeOrder
        : nextInsertionOrder(object, writeOrder);
      const stored = withToolcraftDescriptorWriteOrder(
        descriptor, writeOrder, insertionOrder,
      );
      propertyDescriptors.set(key, stored);
      let array = object.array;
      if (array && typeof key === "string" && /^\d+$/u.test(key)) {
        const slots = [...array.slots];
        const position = Number(key);
        while (slots.length <= position && slots.length < MAX_POSITIONAL_SLOTS) {
          slots.push(ABSENT);
        }
        if (position < MAX_POSITIONAL_SLOTS) {
          slots[position] = mergeFacts(descriptorValueFacts(stored));
        }
        array = Object.freeze({ ...array,
          evidence: Object.freeze(position < MAX_POSITIONAL_SLOTS
            ? array.evidence : [...array.evidence, "overflow-span"]),
          slots: Object.freeze(slots) });
      }
      return withObject(current, identity, objectFactFromDescriptors(
        propertyDescriptors, { array,
          propertyRemainder: object.propertyRemainder,
          prototypeFact: object.prototypeFact },
      ));
    }, state);
  }

  function storeRemainder(baseFact, keyFact, descriptor, state) {
    if (baseFact?.kind !== "exact" || !propertyKeys.hasCoverage(keyFact)) {
      return state;
    }
    return baseFact.values.reduce((current, value) => {
      const identity = index.unwrap(value);
      const object = current.objects.get(identity);
      if (!object) return current;
      const previous = object.propertyRemainder ??
        toolcraftEmptyPropertyRemainder();
      const writeOrder = nextPropertyWrite += 1;
      const entryId = keyFact.dynamicId ?? `remainder-entry:${writeOrder}`;
      const entries = [...(previous.entries ?? [])];
      const known = entries.findIndex(({ id }) => id === entryId);
      const knownPresent = known >= 0 && entries[known].descriptor.alternatives
        .some(({ kind }) => kind !== "absent");
      const incomingPresent = descriptor.alternatives.some(
        ({ kind }) => kind !== "absent",
      );
      const order = known < 0 || !knownPresent && incomingPresent
        ? nextInsertionOrder(object, writeOrder) : entries[known].order;
      const orderedDescriptor = withToolcraftDescriptorWriteOrder(
        descriptor, writeOrder, order,
      );
      const entry = Object.freeze({ coverage: keyFact.coverage,
        descriptor: orderedDescriptor, id: entryId, order });
      if (known < 0) entries.push(entry); else entries[known] = entry;
      const next = { coverage: previous.coverage, entries: Object.freeze(entries),
        string: previous.string, symbol: previous.symbol };
      return withObject(current, identity, objectFactFromDescriptors(
        object.propertyDescriptors, { array: object.array,
          propertyRemainder: Object.freeze(next),
          prototypeFact: object.prototypeFact },
      ));
    }, state);
  }

  function storeProperty(baseFact, member, fact, state, options) {
    return storeDescriptor(baseFact, member,
      toolcraftDataDescriptor(fact ?? UNKNOWN, options), state);
  }

  function eraseDescriptor(baseFact, member, state) {
    const exactKeys = queries.keyAlternatives(member);
    if (member?.dynamicId && exactKeys.length === 0 &&
      baseFact?.kind === "exact") {
      return baseFact.values.reduce((current, value) => {
        const identity = index.unwrap(value);
        const object = current.objects.get(identity);
        if (!object) return current;
        const remainder = object.propertyRemainder ??
          toolcraftEmptyPropertyRemainder();
        const entries = (remainder.entries ?? []).map((entry) =>
          entry.id === member.dynamicId ? Object.freeze({ ...entry,
            descriptor: toolcraftAbsentDescriptor() }) : entry);
        return withObject(current, identity, objectFactFromDescriptors(
          object.propertyDescriptors, { array: object.array,
            propertyRemainder: Object.freeze({ ...remainder,
              entries: Object.freeze(entries) }),
            prototypeFact: object.prototypeFact },
        ));
      }, state);
    }
    return storeDescriptor(baseFact, member, toolcraftAbsentDescriptor(), state);
  }

  return Object.freeze({ ...queries, eraseDescriptor,
    markOpaque: external.markOpaque, propertyKeys, storeDescriptor,
    storeProperty, storeRemainder });
}
