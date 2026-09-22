import { validateToolcraftDeliveryCatalog } from "./toolcraft-delivery-catalog-validation.mjs";
import {
  createToolcraftCanonicalJsonHash,
  serializeToolcraftCanonicalJson,
} from "./toolcraft-functional-proof-primitives.mjs";

export {
  createToolcraftAcceptanceContractHash,
  deriveToolcraftAcceptanceDomainId,
} from "./toolcraft-functional-proof-primitives.mjs";

export const TOOLCRAFT_FUNCTIONAL_PROOF_MODEL_VERSION = 2;

const compareCodeUnits = (left, right) =>
  left < right ? -1 : left > right ? 1 : 0;

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeysError(value, expected, label) {
  if (!isRecord(value)) return `${label} must be an object.`;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    return `${label} must be a plain object.`;
  }
  const expectedSet = new Set(expected);
  const unknown = Reflect.ownKeys(value)
    .filter((key) => typeof key !== "string" || !expectedSet.has(key))
    .map(String)
    .sort(compareCodeUnits);
  const missing = expected.filter(
    (key) => !Object.prototype.hasOwnProperty.call(value, key),
  );
  if (unknown.length > 0) {
    return `${label} contains unknown fields: ${unknown.join(", ")}.`;
  }
  if (missing.length > 0) {
    return `${label} is missing required fields: ${missing.join(", ")}.`;
  }
  return undefined;
}

function deeplyFrozen(value, ancestors = new Set()) {
  if (!(value && typeof value === "object")) return true;
  if (!Object.isFrozen(value) || ancestors.has(value)) return false;
  ancestors.add(value);
  const frozen = Object.values(value).every((entry) =>
    deeplyFrozen(entry, ancestors),
  );
  ancestors.delete(value);
  return frozen;
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

export function getToolcraftFunctionalProofModelError(value) {
  const shapeError = exactKeysError(
    value,
    ["acceptance", "version"],
    "Toolcraft functional proof model",
  );
  if (shapeError) return shapeError;
  if (!deeplyFrozen(value)) {
    return "Toolcraft functional proof model must be deeply frozen.";
  }
  try {
    serializeToolcraftCanonicalJson(value);
  } catch (error) {
    return error.message;
  }
  if (value.version !== TOOLCRAFT_FUNCTIONAL_PROOF_MODEL_VERSION) {
    return `Toolcraft functional proof model.version must be ${TOOLCRAFT_FUNCTIONAL_PROOF_MODEL_VERSION}.`;
  }
  if (!Array.isArray(value.acceptance)) {
    return "Toolcraft functional proof model acceptance must be an array.";
  }
  const validation = validateToolcraftDeliveryCatalog({
    acceptance: value.acceptance,
    performance: [],
    version: 2,
  });
  return validation.errors[0];
}

export function createToolcraftFunctionalProofModel({ catalog }) {
  const validation = validateToolcraftDeliveryCatalog(catalog);
  if (validation.errors.length > 0) {
    throw new Error(`Invalid delivery catalog: ${validation.errors.join("\n")}`);
  }
  const model = deepFreeze({
    acceptance: validation.catalog.acceptance,
    version: TOOLCRAFT_FUNCTIONAL_PROOF_MODEL_VERSION,
  });
  const error = getToolcraftFunctionalProofModelError(model);
  if (error) throw new Error(error);
  return model;
}

export function createToolcraftFunctionalProofModelHash(model) {
  const error = getToolcraftFunctionalProofModelError(model);
  if (error) throw new Error(`Invalid Toolcraft functional proof model: ${error}`);
  return createToolcraftCanonicalJsonHash(model);
}
