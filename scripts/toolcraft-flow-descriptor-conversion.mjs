import { ABSENT, UNKNOWN, exact } from "./toolcraft-flow-facts.mjs";
import { createDescriptorPatch, validateAndApplyDescriptor } from
  "./toolcraft-flow-descriptor-patches.mjs";
import { createOperationWorld } from
  "./toolcraft-flow-operation-world-types.mjs";
import { normalizeOperationWorlds } from "./toolcraft-flow-operation-worlds.mjs";
import { toolcraftAccessorDescriptor, toolcraftDataDescriptor } from
  "./toolcraft-flow-property-descriptors.mjs";
const FIELDS = ["enumerable", "configurable", "value", "writable", "get", "set"];
function descriptorFromAlternative(alternative) {
  return alternative.kind === "accessor" ? toolcraftAccessorDescriptor({
    configurable: alternative.configurable, enumerable: alternative.enumerable,
    getFact: alternative.getFact, setFact: alternative.setFact,
  }) : toolcraftDataDescriptor(alternative.valueFact, {
    configurable: alternative.configurable, enumerable: alternative.enumerable,
    writable: alternative.writable,
  });
}
export function createToolcraftFlowDescriptorConversion({ abrupt,
  callableField, memory, read, truthAlternatives, undefinedFact,
  valueCategory }) {
  function patchesFromFields(fields) {
    let patches = [{}];
    for (const name of FIELDS) {
      const fact = fields.get(name) ?? ABSENT;
      if (fact.kind === "absent") continue;
      const values = ["enumerable", "configurable", "writable"].includes(name)
        ? truthAlternatives(fact) : [fact];
      patches = patches.flatMap((patch) => values.map((value) =>
        ({ ...patch, [name]: value })));
    }
    return patches.map(createDescriptorPatch);
  }
  function field(ownerFact, name, state, effects) {
    const outcomes = memory.descriptorOutcomesFromFact(ownerFact, name, state);
    return outcomes.flatMap(
      (outcome) => read(outcome, outcome.state ?? state, effects));
  }
  function world(owner, cursor, state, payload) {
    const patchPresence = payload.patch ? "patch" : FIELDS.map((name) =>
      payload.fields?.has(name) ? "1" : "0").join("");
    return createOperationWorld({ completion: state.exit, cursor,
      descriptorMode: "conversion", kind: "descriptor-conversion", owner,
      patchPresence, payload, state });
  }
  function convertOwner(ownerFact, state, effects) {
    let worlds = [world(ownerFact, "start", state, { fields: new Map() })];
    for (const name of FIELDS) worlds = normalizeOperationWorlds(worlds.flatMap(
      (current) => current.state.exit !== "normal" ? [current]
        : field(ownerFact, name, current.state, effects).flatMap((outcome) => {
            if (outcome.state.exit !== "normal") return [world(ownerFact, name,
              outcome.state, current.payload)];
            if (outcome.fact.kind === "absent") return [world(ownerFact, name,
              outcome.state, current.payload)];
            if (name !== "get" && name !== "set") return [world(ownerFact, name,
              outcome.state, { fields: new Map(current.payload.fields)
                .set(name, outcome.fact) })];
            const checked = callableField(outcome.fact, outcome.state);
            const accepted = checked.valid ? [world(ownerFact, name, outcome.state,
              { fields: new Map(current.payload.fields).set(name, checked.valid) })] : [];
            return checked.invalid ? [...accepted, world(ownerFact, name,
              abrupt(outcome.state), current.payload)] : accepted;
          })));
    return worlds.flatMap(({ payload, state: ready }) => {
      if (ready.exit !== "normal") return [{ state: ready }];
      return patchesFromFields(payload.fields).flatMap((patch) =>
        validateAndApplyDescriptor({ kind: "absent" }, patch, { undefinedFact })
          .map((result) => ({ descriptor: result.alternative &&
            descriptorFromAlternative(result.alternative), patch, state: ready })));
    });
  }
  function toPropertyDescriptors(ownerFact, state, effects) {
    if (ownerFact?.kind !== "exact") return [
      ...convertOwner(ownerFact ?? UNKNOWN, state, effects), { state: abrupt(state) },
    ];
    return ownerFact.values.flatMap((value) => {
      const category = valueCategory(value);
      const converted = category === "primitive" ? []
        : convertOwner(exact([value]), state, effects);
      return category === "reference" ? converted
        : [...converted, { state: abrupt(state) }];
    });
  }
  return Object.freeze({ toPropertyDescriptors });
}
