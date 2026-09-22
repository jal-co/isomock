import {
  UNKNOWN, exact, toolcraftEmptyPropertyRemainder,
  toolcraftUnboundedPropertyRemainder, withOpaqueObject,
} from "./toolcraft-flow-facts.mjs";
import { toolcraftDataDescriptor, toolcraftUnknownDescriptor } from
  "./toolcraft-flow-property-descriptors.mjs";

const MAX_EXTERNAL_PROPERTIES = 32;

export function createToolcraftExternalPropertyFacts({
  checker, index, propertyKeys, ts,
}) {
  function descriptorsFor(value) {
    const identity = index.unwrap(value);
    const type = checker.getTypeAtLocation(identity);
    const properties = checker.getPropertiesOfType(type);
    const descriptor = toolcraftDataDescriptor(UNKNOWN, {
      enumerable: "unknown", presence: "unknown",
    });
    const descriptors = new Map(properties.slice(0, MAX_EXTERNAL_PROPERTIES)
      .map((property) => [property.getName(), descriptor]));
    const broad = (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) !== 0 ||
      properties.length > MAX_EXTERNAL_PROPERTIES ||
      Boolean(checker.getIndexTypeOfType(type, ts.IndexKind.String));
    return Object.freeze({ descriptors, identity,
      ownerFact: exact([identity]), propertyRemainder: broad
        ? toolcraftUnboundedPropertyRemainder(descriptor)
        : toolcraftEmptyPropertyRemainder() });
  }

  function markOpaque(value, state) {
    const descriptor = toolcraftUnknownDescriptor({ valueFact: UNKNOWN });
    const coverage = propertyKeys.coverageForSource(value);
    return withOpaqueObject(state, index.unwrap(value), Object.freeze({
      coverage, string: descriptor, symbol: descriptor,
    }));
  }

  return Object.freeze({ descriptorsFor, markOpaque });
}
