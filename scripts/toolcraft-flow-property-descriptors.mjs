const ABSENT_OUTCOME = Object.freeze({ kind: "absent" });
const MAX_DESCRIPTOR_ALTERNATIVES_PER_MODE = 4;

function freezeAlternative(alternative) {
  return alternative.kind === "absent" ? ABSENT_OUTCOME
    : Object.freeze({ ...alternative });
}

function nodeKey(node) {
  if (!node) return "missing";
  const source = node.getSourceFile?.()?.fileName ?? "synthetic";
  const text = typeof node.text === "string" ? node.text
    : typeof node.escapedText === "string" ? node.escapedText : "";
  return `${source}:${node.pos ?? -1}:${node.end ?? -1}:${node.kind}:${text}`;
}

function factKey(fact) {
  if (!fact) return "missing-fact";
  const values = fact.kind === "exact" ? fact.values
    : fact.possibleValues ?? [];
  return `${fact.kind}:${values.map(nodeKey).sort().join("|")}`;
}

function alternativeKey(alternative) {
  if (alternative.kind === "absent") return "0:absent";
  const flags = [alternative.enumerable, alternative.configurable]
    .map(String).join(":");
  return alternative.kind === "data"
    ? `1:data:${flags}:${String(alternative.writable)}:${factKey(alternative.valueFact)}`
    : `2:accessor:${flags}:${factKey(alternative.getFact)}:${factKey(alternative.setFact)}`;
}

function booleanSummary(values) {
  const unique = new Set(values);
  return unique.size === 1 ? values[0] : "unknown";
}

function modeSummary(mode, alternatives, mergeFacts, absentFact) {
  const base = {
    configurable: booleanSummary(alternatives.map(({ configurable }) =>
      configurable)),
    enumerable: booleanSummary(alternatives.map(({ enumerable }) => enumerable)),
    kind: mode,
  };
  if (mode === "data") return {
    ...base,
    valueFact: mergeFacts(alternatives.map(({ valueFact }) =>
      valueFact ?? absentFact)),
    writable: booleanSummary(alternatives.map(({ writable }) => writable)),
  };
  return {
    ...base,
    getFact: mergeFacts(alternatives.map(({ getFact }) => getFact ?? absentFact)),
    setFact: mergeFacts(alternatives.map(({ setFact }) => setFact ?? absentFact)),
  };
}

function normalizeMode(mode, alternatives, mergeFacts, absentFact) {
  const unique = new Map();
  for (const alternative of alternatives) {
    unique.set(alternativeKey(alternative), alternative);
  }
  const sorted = [...unique.entries()].sort(([left], [right]) =>
    left.localeCompare(right)).map(([, value]) => value);
  if (sorted.length <= MAX_DESCRIPTOR_ALTERNATIVES_PER_MODE) return sorted;
  return [modeSummary(mode, sorted, mergeFacts, absentFact)];
}

function descriptor(alternatives, mergeFacts, absentFact) {
  const frozen = alternatives.map(freezeAlternative);
  const absent = frozen.some(({ kind }) => kind === "absent")
    ? [ABSENT_OUTCOME] : [];
  const data = frozen.filter(({ kind }) => kind === "data");
  const accessor = frozen.filter(({ kind }) => kind === "accessor");
  const normalize = (mode, values) => mergeFacts
    ? normalizeMode(mode, values, mergeFacts, absentFact)
    : [...new Map(values.map((value) => [alternativeKey(value), value]))]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([, value]) => value)
      .slice(0, MAX_DESCRIPTOR_ALTERNATIVES_PER_MODE);
  return Object.freeze({ alternatives: Object.freeze(
    [...absent, ...normalize("data", data), ...normalize("accessor", accessor)]
  ), factKind: "PropertyDescriptorFact" });
}

function presenceAlternatives(alternative, presence) {
  return presence === "unknown" ? [ABSENT_OUTCOME, alternative] : [alternative];
}

export function toolcraftAbsentDescriptor() {
  return descriptor([ABSENT_OUTCOME]);
}

export function toolcraftDataDescriptor(
  valueFact,
  { configurable = true, enumerable = true, presence = "present",
    writable = true } = {},
) {
  return descriptor(presenceAlternatives({ configurable, enumerable,
    kind: "data", valueFact, writable }, presence));
}

export function toolcraftAccessorDescriptor({
  configurable = true, enumerable = true, getFact,
  presence = "present", setFact,
} = {}) {
  return descriptor(presenceAlternatives({ configurable, enumerable,
    getFact, kind: "accessor", setFact }, presence));
}

export function toolcraftUnknownDescriptor({
  configurable = false, enumerable = false, getFact,
  presence = "unknown", setFact, valueFact, writable = false,
} = {}) {
  const alternatives = [];
  if (presence !== "present") alternatives.push(ABSENT_OUTCOME);
  if (valueFact) alternatives.push({ configurable, enumerable, kind: "data",
    valueFact, writable });
  if (getFact || setFact) alternatives.push({ configurable, enumerable,
    getFact, kind: "accessor", setFact });
  if (alternatives.length === 0 || alternatives.every(
    ({ kind }) => kind === "absent"
  )) alternatives.push(
    { configurable, enumerable, kind: "data", valueFact, writable },
    { configurable, enumerable, getFact, kind: "accessor", setFact },
  );
  return descriptor(alternatives);
}

export function dispatchDescriptorOutcomes(descriptorFact, handlers) {
  const alternatives = descriptorFact?.alternatives ?? [ABSENT_OUTCOME];
  return alternatives.flatMap((alternative) => {
    const handler = handlers[alternative.kind] ?? handlers.unknown;
    return handler ? handler(alternative) : [];
  });
}

export function joinToolcraftDescriptors(
  descriptorFacts, mergeFacts, absentFact,
) {
  const alternatives = descriptorFacts.flatMap((item) =>
    item?.alternatives ?? [ABSENT_OUTCOME]
  );
  const result = alternatives.filter(({ kind }) => kind === "absent");
  const groups = Map.groupBy(alternatives.filter(({ kind }) =>
    kind !== "absent"
  ), (item) => item.kind === "data"
    ? `data:${item.enumerable}:${item.writable}:${item.configurable}`
    : `accessor:${item.enumerable}:${item.configurable}`);
  for (const group of groups.values()) {
    const [first] = group;
    result.push(first.kind === "data" ? { ...first,
      valueFact: mergeFacts(group.map(({ valueFact }) =>
        valueFact ?? absentFact
      )) } : { ...first,
      getFact: mergeFacts(group.map(({ getFact }) => getFact ?? absentFact)),
      setFact: mergeFacts(group.map(({ setFact }) => setFact ?? absentFact)) });
  }
  const writeOrder = Math.max(...descriptorFacts.map(({ writeOrder = 0 } = {}) => writeOrder));
  const insertionOrder = Math.min(...descriptorFacts.map((item = {}) =>
    item.insertionOrder ?? item.writeOrder ?? Number.MAX_SAFE_INTEGER));
  return withToolcraftDescriptorWriteOrder(descriptor(result, mergeFacts,
    absentFact), writeOrder, insertionOrder);
}
export function withToolcraftDescriptorWriteOrder(descriptorFact, writeOrder, insertionOrder = descriptorFact.insertionOrder ?? writeOrder) {
  const inserted = Number.isSafeInteger(insertionOrder) &&
    insertionOrder !== Number.MAX_SAFE_INTEGER ? insertionOrder : writeOrder;
  return writeOrder > 0 ? Object.freeze({ ...descriptorFact, insertionOrder:
    inserted, writeOrder }) : descriptorFact;
}
export function overlayToolcraftDescriptor(
  previous, incoming, mergeFacts, absentFact,
) {
  if (!incoming.alternatives.some(({ kind }) => kind === "absent")) return incoming;
  const present = descriptor(incoming.alternatives.filter(({ kind }) =>
    kind !== "absent"), mergeFacts, absentFact);
  return joinToolcraftDescriptors([
    previous ?? toolcraftAbsentDescriptor(), present,
  ], mergeFacts, absentFact);
}

export function mergeToolcraftAccessorDescriptor(previous, next) {
  const prior = previous?.alternatives?.find(({ kind }) => kind === "accessor");
  const incoming = next?.alternatives?.find(({ kind }) => kind === "accessor");
  if (!incoming) return next;
  return toolcraftAccessorDescriptor({
    configurable: incoming.configurable,
    enumerable: incoming.enumerable,
    getFact: incoming.getFact ?? prior?.getFact,
    setFact: incoming.setFact ?? prior?.setFact,
  });
}

export function withToolcraftDescriptorPresence(descriptorFact, presence) {
  if (presence === "present") return descriptor(descriptorFact.alternatives.filter(
    ({ kind }) => kind !== "absent"
  ));
  return descriptor([ABSENT_OUTCOME, ...descriptorFact.alternatives]);
}

export function toolcraftUncertainDescriptor(descriptorFact) {
  return descriptor([ABSENT_OUTCOME, ...(descriptorFact?.alternatives ?? [])]);
}

export function toolcraftOwnPropertyProof(descriptorFact, propertyRemainder) {
  const alternatives = descriptorFact?.alternatives ?? [];
  const present = alternatives.some(({ kind }) => kind !== "absent");
  const absent = alternatives.some(({ kind }) => kind === "absent") ||
    !descriptorFact && propertyRemainder?.alternatives?.some(
      ({ kind }) => kind !== "absent"
    );
  if (present && !absent) return "present";
  if (!present && !absent) return "absent";
  return "unknown";
}

export function toolcraftDescriptorAlternatives(descriptorFact) {
  return descriptorFact?.alternatives ?? Object.freeze([ABSENT_OUTCOME]);
}

export function mapToolcraftDescriptorFacts(descriptorFact, mapFact) {
  return descriptor((descriptorFact?.alternatives ?? [ABSENT_OUTCOME]).map(
    (alternative) => alternative.kind === "data" ? {
      ...alternative, valueFact: alternative.valueFact &&
        mapFact(alternative.valueFact),
    } : alternative.kind === "accessor" ? {
      ...alternative,
      getFact: alternative.getFact && mapFact(alternative.getFact),
      setFact: alternative.setFact && mapFact(alternative.setFact),
    } : alternative,
  ));
}

export function descriptorValueFacts(descriptorFact) {
  return dispatchDescriptorOutcomes(descriptorFact, {
    absent: () => [], accessor: () => [],
    data: ({ valueFact }) => valueFact ? [valueFact] : [],
  });
}
