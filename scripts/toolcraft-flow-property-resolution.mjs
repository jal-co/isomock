import { toolcraftEmptyPropertyRemainder } from "./toolcraft-flow-facts.mjs";
import { withToolcraftDescriptorPresence } from
  "./toolcraft-flow-property-descriptors.mjs";

export function createToolcraftFlowPropertyResolution({ propertyKeys }) {
  function mapKey(key) {
    return key?.kind === "string" ? key.value : key;
  }

  function remainderDescriptors(object, key) {
    const remainders = object.propertyRemainder ??
      toolcraftEmptyPropertyRemainder();
    const entryId = key?.remainderEntry ?? key?.dynamicId;
    const entry = entryId && (remainders.entries ?? [])
      .find(({ id }) => id === entryId);
    if (entry) return [entry.descriptor];
    const possible = (remainders.entries ?? []).filter(({ coverage }) =>
      ["string", "symbol"].some((domain) =>
        propertyKeys.coverageIntersects(key.coverage, coverage, domain)))
      .map(({ descriptor }) => withToolcraftDescriptorPresence(
        descriptor, "unknown",
      ));
    const residual = ["string", "symbol"].flatMap((domain) =>
      propertyKeys.coverageIntersects(
        key.coverage, remainders.coverage, domain,
      ) ? [remainders[domain]] : []);
    return [...possible, ...residual];
  }

  function cursorDescriptors(object, key) {
    const exactDescriptor = object.propertyDescriptors.get(mapKey(key));
    const entries = (object.propertyRemainder?.entries ?? []).filter((entry) =>
      propertyKeys.coverageContains(entry.coverage, key));
    const possible = (entry) => withToolcraftDescriptorPresence(
      entry.descriptor, "unknown",
    );
    if (exactDescriptor) {
      const later = entries.filter(({ order }) =>
        order > (exactDescriptor.writeOrder ?? 0));
      return [exactDescriptor, ...later.map(possible)];
    }
    if (entries.length > 0) return entries.map(possible);
    return remainderDescriptors(object, key);
  }

  return Object.freeze({ cursorDescriptors, mapKey, remainderDescriptors });
}
