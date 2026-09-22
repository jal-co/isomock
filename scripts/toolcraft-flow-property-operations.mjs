import { ABSENT, UNKNOWN, exact, withCompletion } from
  "./toolcraft-flow-facts.mjs";
import { createDescriptorPatch, descriptorPatchFields,
  validateAndApplyDescriptor } from "./toolcraft-flow-descriptor-patches.mjs";
import { createToolcraftFlowOperators } from "./toolcraft-flow-operators.mjs";
import { createToolcraftFlowValueIdentities } from
  "./toolcraft-flow-value-identities.mjs";
import { createToolcraftFlowDescriptorConversion } from
  "./toolcraft-flow-descriptor-conversion.mjs";
import { createOperationWorld } from
  "./toolcraft-flow-operation-world-types.mjs";
import { normalizeOperationWorlds } from "./toolcraft-flow-operation-worlds.mjs";
import { dispatchDescriptorOutcomes, toolcraftAbsentDescriptor,
  toolcraftAccessorDescriptor, toolcraftDataDescriptor } from
  "./toolcraft-flow-property-descriptors.mjs";
import { createToolcraftStrictContext } from "./toolcraft-flow-strict-context.mjs";
export function copyPropertyDescriptor(descriptor, context) {
  const copy = (alternative) => (alternative.enumerable === "unknown"
    ? [false, true] : [Boolean(alternative.enumerable)]).flatMap((enumerable) =>
    !enumerable ? [context.state] : context.read({ alternative,
      receiverFact: context.ownerFact }, context.state, context.effects)
      .flatMap(({ fact, state }) => state.exit !== "normal" ? [state]
        : context.assign(context.reference, fact ?? UNKNOWN, state, context.effects)));
  return dispatchDescriptorOutcomes(descriptor, {
    absent: () => [context.state], accessor: copy, data: copy,
  });
}
export function createToolcraftFlowPropertyOperations({ checker, index, memory,
  propertyKeys, ts }) {
  const undefinedFact = exact([ts.factory.createIdentifier("undefined")]);
  const strictContext = createToolcraftStrictContext({ index, ts });
  const { truthAlternatives } = createToolcraftFlowOperators({
    checker, index, ts,
  });
  const valueIdentities = createToolcraftFlowValueIdentities({
    checker, index, isReferenceIdentity: memory.isReferenceIdentity,
    propertyKeys, ts,
  });
  const compareValues = (left, right) =>
    valueIdentities.sameValueRelation(left, right);
  const abrupt = (state) => withCompletion(state, "throw", UNKNOWN);
  const failedWrite = (state, strict) => strict ? abrupt(state) : state;
  function read(outcome, state, effects) {
    if (outcome.alternative.kind === "data") return [{
      fact: outcome.alternative.valueFact ?? UNKNOWN, state }];
    if (outcome.alternative.kind === "absent") return [{ fact: ABSENT, state }];
    const getters = memory.candidatesForOutcome(outcome, "get", state);
    return getters.length > 0 ? getters.flatMap((candidate) =>
      effects.applyCandidate(candidate, [], state).map(({ fact, state: next }) =>
        ({ fact, state: next }))) : [{ fact: undefinedFact, state }];
  }
  function slotMayBeMissing(fact) {
    if (!fact || fact.kind !== "exact") return true;
    return fact.values.some((value) => {
      const node = index.unwrap(value);
      return ts.isIdentifier(node) && node.text === "undefined";
    });
  }

  function storeAssigned(reference, fact, state) {
    return reference.member?.kind === "PropertyKeyFact" &&
      propertyKeys.hasCoverage(reference.member)
      ? memory.storeRemainder(reference.baseFact, reference.member,
          toolcraftDataDescriptor(fact ?? UNKNOWN), state)
      : memory.storeProperty(reference.baseFact, reference.member, fact, state);
  }

  function assign(reference, fact, state, effects) {
    const strict = reference.strict ?? strictContext(reference.node);
    const worlds = memory.descriptorOutcomesFromFact(
      reference.baseFact, reference.member, state,
    ).flatMap((outcome) => {
      if (outcome.alternative.kind === "accessor") {
        const setters = memory.candidatesForOutcome(outcome, "set", state);
        const called = setters.flatMap((candidate) => effects.applyCandidate(
          candidate, [fact], state,
        ).map(({ state: next }) => ({ descriptorMode: "setter-call", state: next })));
        return slotMayBeMissing(outcome.alternative.setFact)
          ? [...called, { descriptorMode: "setter-missing",
              state: failedWrite(state, strict) }] : called;
      }
      if (outcome.alternative.kind === "absent") return [
        { descriptorMode: "create", state: storeAssigned(reference, fact, state) },
      ];
      const writable = outcome.alternative.writable === "unknown"
        ? [false, true] : [Boolean(outcome.alternative.writable)];
      return writable.map((allowed) => ({ descriptorMode: allowed
        ? "data-write" : "data-reject", state: allowed ? storeAssigned({
          ...reference, baseFact: outcome.receiverFact ?? reference.baseFact,
        }, fact, state) : failedWrite(state, strict) }));
    });
    return normalizeOperationWorlds(worlds.map((world) => createOperationWorld({
      completion: world.state.exit, cursor: reference.member,
      descriptorMode: world.descriptorMode,
      kind: "property-assign", owner: reference.baseFact, patchPresence: "none",
      payload: {}, state: world.state }))).map(({ state: ready }) => ready);
  }

  function deleteProperty(reference, state) {
    const strict = reference.strict ?? strictContext(reference.node);
    const results = memory.ownDescriptorOutcomesFromFact(
      reference.baseFact, reference.member, state,
    ).flatMap((outcome) => outcome.alternative.kind === "absent"
      ? [{ fact: exact([ts.factory.createTrue()]), state }]
      : (outcome.alternative.configurable === "unknown" ? [false, true]
        : [Boolean(outcome.alternative.configurable)]).map((configurable) =>
          configurable ? { fact: exact([ts.factory.createTrue()]), state:
              memory.eraseDescriptor(reference.baseFact, reference.member, state) }
            : { fact: exact([ts.factory.createFalse()]),
              state: strict ? abrupt(state) : state }));
    return normalizeOperationWorlds(results.map((result) => createOperationWorld({
      completion: result.state.exit, cursor: reference.member,
      descriptorMode: "delete", kind: "property-delete", owner: reference.baseFact,
      patchPresence: "none", payload: { fact: result.fact }, state: result.state })))
      .map(({ payload, state: ready }) => ({ fact: payload.fact, state: ready }));
  }

  function callableField(fact, state) {
    const values = fact?.kind === "exact" ? fact.values : fact?.possibleValues ?? [];
    const valid = [], invalid = [];
    for (const value of values) {
      const allowedUndefined = valueIdentities.identityOf(value) === "undefined";
      if (allowedUndefined || memory.callablesForFact(exact([value]), state).length > 0) {
        valid.push(value);
      } else invalid.push(value);
    }
    if (values.length === 0 && fact?.kind !== "absent") return { invalid: true,
      valid: fact };
    return { invalid: invalid.length > 0,
      valid: valid.length > 0 ? exact(valid) : undefined };
  }

  function alternativeFact(alternative) {
    if (alternative.kind === "accessor") return toolcraftAccessorDescriptor({
      configurable: alternative.configurable, enumerable: alternative.enumerable,
      getFact: alternative.getFact, setFact: alternative.setFact });
    return toolcraftDataDescriptor(alternative.valueFact, {
      configurable: alternative.configurable, enumerable: alternative.enumerable,
      writable: alternative.writable });
  }

  const { toPropertyDescriptors } = createToolcraftFlowDescriptorConversion({
    abrupt, callableField, memory, read, truthAlternatives,
    undefinedFact, valueCategory: valueIdentities.valueCategory,
  });

  function fullPatches(descriptor) {
    if (descriptor?.factKind === "DescriptorPatchFact") return [descriptor];
    return (descriptor?.alternatives ?? []).flatMap((item) => item.kind === "absent"
      ? [] : [createDescriptorPatch(item.kind === "data" ? {
          configurable: item.configurable, enumerable: item.enumerable,
          value: item.valueFact, writable: item.writable,
        } : { configurable: item.configurable, enumerable: item.enumerable,
          get: item.getFact ?? undefinedFact, set: item.setFact ?? undefinedFact })]);
  }
  function patchPresence(patch) {
    return patch ? descriptorPatchFields().map((name) =>
      patch[name]?.present ? "1" : "0").join("") : "absent";
  }

  function storeDefinedResult(result, targetFact, key, state) {
    if (result.kind === "throw") return abrupt(state);
    if (result.kind === "unchanged") return state;
    return memory.storeDescriptor(targetFact, key,
      alternativeFact(result.alternative), state);
  }

  function define(targetFact, keyFact, incoming, state) {
    const patches = fullPatches(incoming);
    const writes = keyFact.alternatives.flatMap((key) => {
      const outcomes = memory.ownDescriptorOutcomesFromFact(targetFact, key, state);
      return outcomes.flatMap(({ alternative }) => patches.flatMap((patch) =>
        validateAndApplyDescriptor(alternative, patch, {
            compare: compareValues, undefinedFact,
        }).map((result) => ({ cursor: key, fact: targetFact, patch,
          state: storeDefinedResult(result, targetFact, key, state) }))));
    });
    const remainder = propertyKeys.hasCoverage(keyFact)
      ? memory.ownDescriptorOutcomesFromFact(targetFact, keyFact, state)
        .flatMap(({ alternative, state: current = state }) =>
          patches.flatMap((patch) => validateAndApplyDescriptor(
            alternative, patch, { compare: compareValues, undefinedFact },
          ).map((result) => ({ cursor: keyFact, fact: targetFact, patch,
            state: result.kind === "throw" ? abrupt(current)
              : result.kind === "unchanged" ? current
                : memory.storeRemainder(targetFact, keyFact,
                    alternativeFact(result.alternative), current) })))) : [];
    return normalizeOperationWorlds([...writes, ...remainder].map((result) =>
      createOperationWorld({ completion: result.state.exit, cursor: result.cursor,
        descriptorMode: "define", kind: "property-define", owner: targetFact,
        patchPresence: patchPresence(result.patch), payload: { fact: result.fact,
          patch: result.patch },
        state: result.state }))).map((world) => ({ cursor: world.cursor,
      fact: world.payload.fact, patch: world.payload.patch, state: world.state }));
  }

  function defineProperty(plan, state, effects) {
    const targetFact = plan.actual[0] ?? UNKNOWN;
    const keyFact = plan.evaluated[1]?.keyFact ?? propertyKeys.fromFact(
      plan.actual[1], plan.evaluated[1]?.source);
    const results = toPropertyDescriptors(
      plan.actual[2] ?? UNKNOWN, state, effects,
    ).flatMap(({ patch, state: ready }) => patch
      ? define(targetFact, keyFact, patch, ready)
      : [{ fact: UNKNOWN, state: ready }]);
    return normalizeOperationWorlds(results.map((result) => createOperationWorld({
      completion: result.state.exit, cursor: result.cursor ?? keyFact,
      descriptorMode: "define-result",
      kind: "property-define", owner: targetFact,
      patchPresence: patchPresence(result.patch),
      payload: { fact: result.fact, patch: result.patch }, state: result.state })))
      .map(({ cursor, payload, state: ready }) => ({ cursor, fact: payload.fact,
        patch: payload.patch, state: ready }));
  }

  return Object.freeze({ assign, define, defineProperty,
    deleteProperty, read, strictContext, toPropertyDescriptors });
}
