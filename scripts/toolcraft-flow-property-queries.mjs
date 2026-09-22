import {
  ABSENT, UNKNOWN, exact, mergeFacts,
} from "./toolcraft-flow-facts.mjs";
import {
  dispatchDescriptorOutcomes, toolcraftAbsentDescriptor,
  toolcraftDataDescriptor,
} from "./toolcraft-flow-property-descriptors.mjs";
import { createToolcraftFlowPropertyResolution } from
  "./toolcraft-flow-property-resolution.mjs";
export function createToolcraftFlowPropertyQueries({
  external, index, materialize, propertyKeys, ts,
}) {
  const { cursorDescriptors, mapKey, remainderDescriptors } =
    createToolcraftFlowPropertyResolution({ propertyKeys });
  function keyAlternatives(member) {
    if (member?.kind === "PropertyKeyFact") return member.alternatives;
    if (member?.kind === "string" || member?.kind === "symbol") return [member];
    return member === undefined ? [] : propertyKeys.staticFact(member).alternatives;
  }
  function callableCandidates(fact, state, thisFact) {
    const values = fact?.kind === "exact" ? fact.values
      : fact?.possibleValues ?? [];
    return values.flatMap((candidate) => {
      const node = index.unwrap(candidate);
      const captured = state.callables.get(node) ?? [];
      const local = captured.length > 0 ? captured
        : ts.isFunctionLike(node) ? [{ bound: [], fn: node }] : [];
      return local.map((callable) => ({ ...callable, thisFact }));
    });
  }
  function outcomesForDescriptor(descriptor, ownerFact, receiverFact, state) {
    return dispatchDescriptorOutcomes(descriptor, {
      absent: (alternative) => [{ alternative, ownerFact, receiverFact, state }],
      accessor: (alternative) => [{ alternative, ownerFact, receiverFact, state }],
      data: (alternative) => [{ alternative, ownerFact, receiverFact, state }],
    });
  }
  function coverageOutcomes(fact, member, state, ownOnly) {
    if (fact?.kind !== "exact" || !propertyKeys.hasCoverage(member)) return [];
    return fact.values.flatMap((value) => {
      const item = ownOnly ? { state } : materialize(value, state, 1);
      const identity = index.unwrap(value);
      const object = item.state.objects.get(identity);
      if (!object) return outcomesForDescriptor(
        toolcraftDataDescriptor(UNKNOWN), exact([identity]), fact, item.state,
      );
      if (member.remainderEntry || member.dynamicId) {
        const descriptors = remainderDescriptors(object, member);
        return descriptors.length > 0 ? descriptors.flatMap((descriptor) =>
          outcomesForDescriptor(descriptor, exact([identity]), fact, item.state)
        ) : outcomesForDescriptor(
          toolcraftAbsentDescriptor(), exact([identity]), fact, item.state,
        );
      }
      return ["string", "symbol"].flatMap((kind) =>
        propertyKeys.coverageIntersects(
          member.coverage, object.propertyRemainder?.coverage, kind,
        ) ? outcomesForDescriptor(object.propertyRemainder[kind],
            exact([identity]), fact, item.state) : []);
    });
  }
  function dynamicEntryOutcomes(fact, member, state, ownOnly) {
    if (!member?.dynamicId || fact?.kind !== "exact") return [];
    return fact.values.flatMap((value) => {
      const item = ownOnly ? { state } : materialize(value, state, 1);
      const identity = index.unwrap(value);
      const object = item.state.objects.get(identity);
      if (!object) return [];
      const descriptor = (object.propertyRemainder?.entries ?? [])
        .find(({ id }) => id === member.dynamicId)?.descriptor;
      if (!descriptor) return [];
      return outcomesForDescriptor(
        descriptor, exact([identity]), fact, item.state,
      );
    });
  }
  function outcomesForOwner(identity, key, receiverFact, state, visited) {
    if (visited.has(identity)) return [];
    const object = state.objects.get(identity);
    if (!object) return [];
    const nextVisited = new Set(visited).add(identity);
    const ownerFact = exact([identity]);
    const mappedKey = mapKey(key);
    const arrayFact = object.array && typeof mappedKey === "string" &&
      /^\d+$/u.test(mappedKey) ? object.array.slots[Number(mappedKey)] : undefined;
    const descriptors = arrayFact
      ? [toolcraftDataDescriptor(arrayFact)] : cursorDescriptors(object, key);
    const direct = descriptors.flatMap((descriptor) => outcomesForDescriptor(
      descriptor, ownerFact, receiverFact, state,
    ));
    const present = direct.filter(({ alternative }) =>
      alternative.kind !== "absent");
    const mayBeAbsent = descriptors.length === 0 || direct.some(({ alternative }) =>
      alternative.kind === "absent");
    if (!mayBeAbsent) return direct;
    const inherited = object.prototypeFact?.kind === "exact"
      ? object.prototypeFact.values.flatMap((value) => outcomesForOwner(
          index.unwrap(value), key, receiverFact, state, nextVisited,
        )) : [];
    return inherited.length > 0 ? [...present, ...inherited]
      : [...present, { alternative: Object.freeze({ kind: "absent" }),
          ownerFact, receiverFact, state }];
  }
  function descriptorOutcomesFromFact(
    fact, member, state, depth = 0, typeSource,
  ) {
    const dynamic = dynamicEntryOutcomes(fact, member, state, false);
    if (dynamic.length > 0) return dynamic;
    if (fact?.kind !== "exact") return outcomesForDescriptor(
      toolcraftDataDescriptor(fact ?? UNKNOWN), fact ?? UNKNOWN,
      fact ?? UNKNOWN, state,
    );
    const keys = keyAlternatives(member);
    const covered = coverageOutcomes(fact, member, state, false);
    if (keys.length === 0 && covered.length > 0) return covered;
    if (keys.length === 0) return outcomesForDescriptor(
      toolcraftDataDescriptor(UNKNOWN), fact, fact, state,
    );
    return fact.values.flatMap((value) => {
      const item = materialize(value, state, depth + 1);
      const identity = index.unwrap(value);
      return keys.flatMap((key) => {
        const mapped = mapKey(key);
        const mayContain = typeof mapped === "string" &&
          propertyKeys.typeMayContain(typeSource ?? value, mapped);
        if (!item.state.objects.has(identity)) return outcomesForDescriptor(
          mayContain ? toolcraftDataDescriptor(UNKNOWN)
            : toolcraftAbsentDescriptor(), exact([identity]), fact, item.state,
        );
        const outcomes = outcomesForOwner(
          identity, key, fact, item.state, new Set(),
        );
        const object = item.state.objects.get(identity);
        if (object?.prototypeFact && !object.array) return outcomes;
        const known = outcomes.some(({ alternative }) =>
          alternative.kind !== "absent");
        return known || !mayContain && outcomes.length > 0 ? outcomes
          : outcomesForDescriptor(toolcraftDataDescriptor(UNKNOWN),
              exact([identity]), fact, item.state);
      });
    });
  }
  function ownDescriptorOutcomesFromFact(fact, member, state) {
    const dynamic = dynamicEntryOutcomes(fact, member, state, true);
    if (dynamic.length > 0) return dynamic;
    if (fact?.kind !== "exact") return outcomesForDescriptor(
      toolcraftDataDescriptor(fact ?? UNKNOWN), fact ?? UNKNOWN,
      fact ?? UNKNOWN, state,
    );
    const keys = keyAlternatives(member);
    const covered = coverageOutcomes(fact, member, state, true);
    if (keys.length === 0 && covered.length > 0) return covered;
    if (keys.length === 0) return outcomesForDescriptor(
      toolcraftDataDescriptor(UNKNOWN), fact, fact, state,
    );
    return fact.values.flatMap((value) => {
      const identity = index.unwrap(value);
      const object = state.objects.get(identity);
      if (!object) return outcomesForDescriptor(
        toolcraftDataDescriptor(UNKNOWN), exact([identity]), fact, state,
      );
      return keys.flatMap((key) => {
        const descriptors = cursorDescriptors(object, key);
        return descriptors.length > 0 ? descriptors.flatMap((descriptor) =>
          outcomesForDescriptor(descriptor, exact([identity]), fact, state)
        ) : outcomesForDescriptor(
            toolcraftAbsentDescriptor(), exact([identity]), fact, state,
          );
      });
    });
  }
  function propertyFromFact(fact, member, state, depth = 0, typeSource) {
    return mergeFacts(descriptorOutcomesFromFact(
      fact, member, state, depth + 1, typeSource,
    ).map(({ alternative }) => alternative.kind === "data"
      ? alternative.valueFact ?? UNKNOWN
      : alternative.kind === "accessor" ? UNKNOWN : ABSENT));
  }
  function propertyValue(node, state, depth = 0) {
    const member = index.staticMember(node);
    if (member === undefined) return { fact: UNKNOWN, state };
    const root = materialize(node.expression, state, depth + 1);
    return { fact: propertyFromFact(
        root.fact, member, root.state, depth + 1, node.expression,
      ), state: root.state };
  }
  function candidatesForOutcome(outcome, kind, state) {
    if (outcome.alternative.kind !== "accessor") return [];
    const fact = kind === "get" ? outcome.alternative.getFact
      : outcome.alternative.setFact;
    return callableCandidates(fact, state, outcome.receiverFact);
  }
  function ownDescriptorsFromFact(fact, state) {
    const values = fact?.kind === "exact" ? fact.values
      : fact?.possibleValues ?? [];
    return values.map((value) => {
      const identity = index.unwrap(value);
      const object = state.objects.get(identity);
      return object ? Object.freeze({ descriptors: object.propertyDescriptors,
        identity, ownerFact: exact([identity]),
        propertyRemainder: object.propertyRemainder })
        : external.descriptorsFor(value);
    });
  }
  return Object.freeze({ callablesForFact: callableCandidates,
    candidatesForOutcome, descriptorOutcomesFromFact, keyAlternatives, mapKey,
    ownDescriptorOutcomesFromFact, ownDescriptorsFromFact, propertyFromFact,
    propertyValue }); }
