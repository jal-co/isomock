const SHA256 = /^[a-f0-9]{64}$/u;
const STUDY_ID = /^motion-v1-[a-f0-9]{64}$/u;
const GROUP_ID = /^motion-group-v1-[a-f0-9]{64}$/u;

export function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null);
}

export function hasExactKeys(
  value,
  required,
  optional,
  label,
  errors,
) {
  if (!isRecord(value)) {
    errors.push(`${label} must be an object.`);
    return false;
  }
  const allowed = new Set([...required, ...optional]);
  let exact = true;
  for (const key of required) {
    if (!Object.hasOwn(value, key)) {
      errors.push(`${label} is missing ${key}.`);
      exact = false;
    }
  }
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      errors.push(`${label} has unknown property ${key}.`);
      exact = false;
    }
  }
  return exact;
}

export function finite(value) {
  return typeof value === "number" && Number.isFinite(value);
}
export function positive(value) {
  return finite(value) && value > 0;
}
export function positiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}
export function nonnegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}
export function nonemptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}
export function isSha256(value) {
  return typeof value === "string" && SHA256.test(value);
}
export function isStudyId(value) {
  return typeof value === "string" && STUDY_ID.test(value);
}
export function isGroupId(value) {
  return typeof value === "string" && GROUP_ID.test(value);
}
export function requireValue(condition, message, errors) {
  if (!condition) errors.push(message);
}
