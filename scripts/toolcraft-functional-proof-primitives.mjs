import { createHash } from "node:crypto";

const compareCodeUnits = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const isTrimmedString = (value) =>
  typeof value === "string" && value.length > 0 && value.trim() === value;

export function hasToolcraftExactRecordKeys(value, keys) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const ownKeys = Reflect.ownKeys(value);
  return ownKeys.length === keys.length && ownKeys.every((key) =>
    typeof key === "string" &&
    keys.includes(key) &&
    Object.prototype.propertyIsEnumerable.call(value, key)
  );
}

export function isToolcraftCanonicalTargetArray(
  value,
  { empty = false, paths = false } = {},
) {
  const dense = isToolcraftDenseExactArray(value);
  const valid = (item) =>
    typeof item === "string" &&
    item.length > 0 &&
    item.trim() === item &&
    (!paths || (
      !item.includes("\\") &&
      !item.startsWith("/") &&
      !/^[A-Za-z]:\//u.test(item) &&
      item.split("/").every((part) => part && part !== "." && part !== "..")
    ));
  return dense && (empty || value.length > 0) && value.every(valid) &&
    value.every((item, index) =>
      index === 0 || compareCodeUnits(value[index - 1], item) < 0
    );
}

export function isToolcraftDenseExactArray(value) {
  return (
    Array.isArray(value) &&
    Reflect.ownKeys(value).length === value.length + 1 &&
    Array.from(
      { length: value.length },
      (_, index) => Object.hasOwn(value, index),
    ).every(Boolean)
  );
}

export function deepFreezeToolcraftValue(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreezeToolcraftValue);
    Object.freeze(value);
  }
  return value;
}

export function isToolcraftDeeplyFrozen(value) {
  return !(value && typeof value === "object") || (
    Object.isFrozen(value) &&
    Object.values(value).every(isToolcraftDeeplyFrozen)
  );
}

export function serializeToolcraftCanonicalJson(value, ancestors = new Set()) {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Toolcraft canonical JSON rejects non-finite numbers.");
    }
    return JSON.stringify(value);
  }
  if (typeof value !== "object") {
    throw new Error(`Toolcraft canonical JSON rejects ${typeof value} values.`);
  }
  if (ancestors.has(value)) {
    throw new Error("Toolcraft canonical JSON rejects cyclic values.");
  }
  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
    throw new Error("Toolcraft canonical JSON rejects non-plain objects.");
  }
  if (Array.isArray(value)) {
    const ownKeys = Reflect.ownKeys(value);
    if (Object.getOwnPropertySymbols(value).length > 0) {
      throw new Error("Toolcraft canonical JSON rejects symbol keys.");
    }
    const dense =
      ownKeys.length === value.length + 1 &&
      ownKeys.every((key) =>
        key === "length" ||
        (typeof key === "string" &&
          Number.isSafeInteger(Number(key)) &&
          String(Number(key)) === key &&
          Number(key) >= 0 &&
          Number(key) < value.length)
      ) &&
      Array.from(
        { length: value.length },
        (_, index) => Object.prototype.hasOwnProperty.call(value, index),
      ).every(Boolean);
    if (!dense) {
      throw new Error(
        "Toolcraft canonical JSON rejects sparse or augmented arrays.",
      );
    }
  }
  if (Object.getOwnPropertySymbols(value).length > 0) {
    throw new Error("Toolcraft canonical JSON rejects symbol keys.");
  }
  if (
    !Array.isArray(value) &&
    Object.getOwnPropertyNames(value).length !== Object.keys(value).length
  ) {
    throw new Error(
      "Toolcraft canonical JSON rejects non-enumerable properties.",
    );
  }
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const items = value.map((item) =>
        serializeToolcraftCanonicalJson(item, ancestors)
      );
      return `[${items.join(",")}]`;
    }
    return `{${Object.keys(value).sort(compareCodeUnits).map((key) =>
      `${JSON.stringify(key)}:${serializeToolcraftCanonicalJson(value[key], ancestors)}`
    ).join(",")}}`;
  } finally {
    ancestors.delete(value);
  }
}

export function createToolcraftCanonicalJsonHash(value) {
  return createHash("sha256")
    .update(serializeToolcraftCanonicalJson(value))
    .digest("hex");
}

export function deriveToolcraftAcceptanceDomainId(acceptanceId) {
  if (!isTrimmedString(acceptanceId)) {
    throw new Error("Toolcraft acceptance id must be a trimmed string.");
  }
  const domainId = acceptanceId.split(".")[0];
  if (!isTrimmedString(domainId)) {
    throw new Error("Toolcraft acceptance id must start with a non-empty namespace segment.");
  }
  return domainId;
}

export function createToolcraftAcceptanceContractHash(acceptanceEntry) {
  return createToolcraftCanonicalJsonHash(acceptanceEntry);
}
