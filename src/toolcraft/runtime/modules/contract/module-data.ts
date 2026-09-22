/** Declarations are data. Reject accessors and executable/resource instances before reading them. */
function snapshot<Value>(value: Value, ancestors: Set<object>): Value {
  if (value === null || typeof value === "string" || typeof value === "boolean" || value === undefined) return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "object") throw new Error("Module declarations must contain only serializable data.");
  if (ancestors.has(value)) throw new Error("Module declarations must be acyclic.");
  const array = Array.isArray(value);
  if (!array && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
    throw new Error("Module declarations must contain plain data records.");
  }
  if (array && (Reflect.ownKeys(value).length !== value.length + 1 ||
    Array.from({ length: value.length }, (_, index) => index).some(index => !Object.hasOwn(value, index)))) {
    throw new Error("Module declaration arrays must be dense and have no named properties.");
  }
  ancestors.add(value);
  const entries = Reflect.ownKeys(value).filter(key => !(array && key === "length")).map(key => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
    if (typeof key !== "string" || !("value" in descriptor)) throw new Error("Module declarations must not contain symbols or accessors.");
    return [key, snapshot(descriptor.value, ancestors)] as const;
  });
  ancestors.delete(value);
  return Object.freeze(array ? entries.map(([, item]) => item) : Object.fromEntries(entries)) as Value;
}

export function snapshotToolcraftModuleData<Value>(value: Value): Value {
  return snapshot(value, new Set());
}
