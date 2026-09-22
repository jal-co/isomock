import { ABSENT, UNKNOWN, mergeFacts, toolcraftEmptyPropertyRemainder } from
  "./toolcraft-flow-facts.mjs";
import { createOperationWorld } from
  "./toolcraft-flow-operation-world-types.mjs";
import { normalizeOperationWorlds } from "./toolcraft-flow-operation-worlds.mjs";
import { createToolcraftOwnPropertyKeys } from
  "./toolcraft-flow-own-property-keys.mjs";
import { toolcraftAbsentDescriptor, toolcraftAccessorDescriptor,
  dispatchDescriptorOutcomes, joinToolcraftDescriptors,
  toolcraftDataDescriptor } from
  "./toolcraft-flow-property-descriptors.mjs";
import { copyPropertyDescriptor } from
  "./toolcraft-flow-property-operations.mjs";

function descriptorFor(alternative) {
  if (alternative.kind === "absent") return toolcraftAbsentDescriptor();
  if (alternative.kind === "accessor") return toolcraftAccessorDescriptor({
    configurable: alternative.configurable, enumerable: alternative.enumerable,
    getFact: alternative.getFact, setFact: alternative.setFact,
  });
  return toolcraftDataDescriptor(alternative.valueFact, {
    configurable: alternative.configurable, enumerable: alternative.enumerable,
    writable: alternative.writable,
  });
}
export function createToolcraftFlowPropertyCopy({ memory, propertyOperations }) {
  const ownKeys = createToolcraftOwnPropertyKeys({ memory,
    propertyKeys: memory.propertyKeys });
  function assignedReference(targetFact, member, site) {
    return Object.freeze({ baseFact: targetFact, kind: "property", member,
      node: site, receiverFact: targetFact, strict: true });
  }
  function cursorId(cursor) {
    return typeof cursor === "string" ? `string:${cursor}`
      : cursor?.id ?? cursor?.dynamicId ?? cursor?.remainderDomain ?? "remainder";
  }
  function bounded(states, owner, cursor) {
    return normalizeOperationWorlds(states.map((state) => createOperationWorld({
      completion: state.exit, cursor, descriptorMode: "current",
      kind: "property-copy", owner, patchPresence: "none",
      payload: {}, state,
    }))).map(({ state }) => state);
  }
  function copyCursor(targetFact, source, cursor, state, effects, site) {
    if (state.exit !== "normal") return [state];
    const outcomes = memory.ownDescriptorOutcomesFromFact(
      source.ownerFact, cursor, state,
    );
    const results = outcomes.flatMap(({ alternative, state: current = state }) =>
      copyPropertyDescriptor(descriptorFor(alternative), {
        assign: (...args) => propertyOperations.assign(...args), effects,
        ownerFact: source.ownerFact,
        read: (...args) => propertyOperations.read(...args),
        reference: assignedReference(targetFact, cursor, site), state: current,
      }));
    return results;
  }
  function copySource(targetFact, source, effects, site) {
    let states = [source.state];
    for (const cursor of source.cursors) states = bounded(states.flatMap((state) =>
      copyCursor(targetFact, source, cursor, state, effects, site)
    ), source.ownerFact, cursor);
    return states;
  }
  function assign(plan, state, effects) {
    const targetFact = plan.actual[0] ?? UNKNOWN;
    let states = [state];
    for (const sourceFact of plan.actual.slice(1)) {
      const owned = states.flatMap((current) => current.exit !== "normal"
        ? [{ owner: sourceFact, state: current }]
        : ownKeys.snapshot(sourceFact, current).flatMap((source) =>
            copySource(targetFact, source, effects, plan.call).map((next) =>
              ({ owner: source.ownerFact, state: next }))));
      states = normalizeOperationWorlds(owned.map(({ owner, state: ready }) =>
        createOperationWorld({ completion: ready.exit, cursor: "source",
          descriptorMode: "current", kind: "property-copy", owner,
          patchPresence: "none", payload: {}, state: ready })))
        .map(({ state: ready }) => ready);
    }
    return states.map((ready) => ({ fact: targetFact, state: ready }));
  }
  function spreadValue(ownerFact, cursor, state, effects) {
    if (state.exit !== "normal") return [{ state }];
    return memory.ownDescriptorOutcomesFromFact(ownerFact, cursor, state)
      .flatMap((outcome) => {
        const current = outcome.state ?? state;
        const read = (alternative) => (alternative.enumerable === "unknown"
          ? [false, true] : [Boolean(alternative.enumerable)])
          .flatMap((enumerable) => enumerable ? propertyOperations.read({
            alternative, receiverFact: ownerFact,
          }, current, effects).map(({ fact, state: next }) => ({ fact, state: next }))
            : [{ state: current }]);
        return dispatchDescriptorOutcomes(descriptorFor(outcome.alternative), {
          absent: () => [{ state: outcome.state ?? state }],
          accessor: read,
          data: read,
        });
      });
  }
  function addSpreadValue(world, cursor, fact, state) {
    if (!fact) return { ...world, copied: false, state };
    const descriptor = toolcraftDataDescriptor(fact);
    if (typeof cursor === "string" || cursor?.kind === "symbol") {
      return { ...world, descriptors: new Map(world.descriptors).set(cursor,
        descriptor), copied: true, state };
    }
    const propertyRemainder = world.propertyRemainder;
    const residual = Boolean(cursor.remainderDomain);
    const entries = residual ? [...(propertyRemainder.entries ?? [])]
      : [...(propertyRemainder.entries ?? []), Object.freeze({
          coverage: cursor.coverage, descriptor, id: cursor.dynamicId ??
            cursor.remainderEntry ?? `spread:${cursorId(cursor)}`,
          order: (propertyRemainder.entries?.length ?? 0) + 1,
        })];
    const next = { ...propertyRemainder, coverage: residual
      ? memory.propertyKeys.mergeCoverage(
          propertyRemainder.coverage, cursor.coverage,
        ) : propertyRemainder.coverage,
    entries: Object.freeze(entries) };
    for (const domain of ["string", "symbol"]) if (residual &&
      (cursor.coverage?.[domain]?.unbounded ||
        cursor.coverage?.[domain]?.finiteTypes?.length > 0)
    ) next[domain] = joinToolcraftDescriptors([
      propertyRemainder[domain], descriptor,
    ], mergeFacts, ABSENT);
    return { ...world, copied: true,
      propertyRemainder: Object.freeze(next), state };
  }
  function boundedSpread(worlds, owner, cursor) {
    return normalizeOperationWorlds(worlds.map((world) => createOperationWorld({
      completion: world.state.exit, cursor, descriptorMode: world.copied
        ? "spread-copy" : "spread-skip",
      kind: "property-copy", owner, patchPresence: "none", payload: {
        descriptors: world.descriptors, propertyRemainder: world.propertyRemainder,
      }, state: world.state }))).map(({ payload, state }) => ({ ...payload, state }));
  }
  function evaluatedOwnDescriptors(sourceFact, state, effects) {
    const snapshots = ownKeys.snapshot(sourceFact, state);
    return snapshots.flatMap((source) => {
      let worlds = [{ descriptors: new Map(), propertyRemainder:
        toolcraftEmptyPropertyRemainder(), state: source.state }];
      for (const cursor of source.cursors) worlds = boundedSpread(worlds.flatMap((world) =>
        spreadValue(source.ownerFact, cursor, world.state, effects).map(
          ({ fact, state: next }) => addSpreadValue(world, cursor, fact, next),
        )), source.ownerFact, cursor);
      return worlds.map((world) => ({ ...world, ownerFact: source.ownerFact }));
    });
  }
  function defineProperty(plan, state, effects) {
    return propertyOperations.defineProperty(plan, state, effects);
  }
  return Object.freeze({ assign, defineProperty, evaluatedOwnDescriptors });
}
