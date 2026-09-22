import { sameValueRelation } from "./toolcraft-flow-value-identities.mjs";

const FIELD_NAMES = Object.freeze([
  "configurable", "enumerable", "value", "writable", "get", "set",
]);
const BOOLEAN_FIELDS = new Set(["configurable", "enumerable", "writable"]);

const ABSENT_FIELD = Object.freeze({ present: false });

function presentField(value) {
  return Object.freeze({ present: true, value });
}

function field(fields, name) {
  return Object.hasOwn(fields, name) ? presentField(fields[name]) : ABSENT_FIELD;
}

export function createDescriptorPatch(fields = {}) {
  return Object.freeze({
    configurable: field(fields, "configurable"),
    enumerable: field(fields, "enumerable"),
    value: field(fields, "value"),
    writable: field(fields, "writable"),
    get: field(fields, "get"),
    set: field(fields, "set"),
    factKind: "DescriptorPatchFact",
  });
}

function has(patch, name) {
  return patch[name]?.present === true;
}

function value(patch, name, fallback) {
  return has(patch, name) ? patch[name].value : fallback;
}

function patchKind(patch) {
  const data = has(patch, "value") || has(patch, "writable");
  const accessor = has(patch, "get") || has(patch, "set");
  if (data && accessor) return "invalid";
  return accessor ? "accessor" : data ? "data" : "generic";
}

function booleanWorlds(value) {
  return value === "unknown" ? [false, true] : [Boolean(value)];
}

function expandPatch(patch) {
  let worlds = [{}];
  for (const name of FIELD_NAMES) {
    if (!has(patch, name)) continue;
    const values = BOOLEAN_FIELDS.has(name)
      ? booleanWorlds(value(patch, name)) : [value(patch, name)];
    worlds = worlds.flatMap((fields) => values.map((fieldValue) => ({
      ...fields, [name]: fieldValue,
    })));
  }
  return worlds.map(createDescriptorPatch);
}

function expandCurrent(current) {
  if (current.kind === "absent") return [current];
  const worlds = [];
  for (const configurable of booleanWorlds(current.configurable)) {
    for (const enumerable of booleanWorlds(current.enumerable)) {
      if (current.kind === "accessor") worlds.push({ ...current,
        configurable, enumerable });
      else for (const writable of booleanWorlds(current.writable)) {
        worlds.push({ ...current, configurable, enumerable, writable });
      }
    }
  }
  return worlds;
}

function sameWorlds(left, right, compare) {
  const result = compare(left, right);
  if (!result || !Array.isArray(result.equal)) return (result === "unknown"
    ? [false, true] : [Boolean(result)]).map((valid) => ({
      evidence: Object.freeze([]), valid,
    }));
  const worlds = [];
  if (result.equal.length > 0) worlds.push({ evidence: Object.freeze([
    Object.freeze({ groups: result.equal, kind: "equal" }),
  ]), narrowed: Object.freeze({ kind: "exact", values: Object.freeze([
    ...new Set(result.equal.flatMap(({ rightFact }) => rightFact.values)),
  ]) }), valid: true });
  if (result.unequal.length > 0) worlds.push({ evidence: Object.freeze([
    Object.freeze({ groups: result.unequal, kind: "unequal" }),
  ]), valid: false });
  if (result.uncertain.length > 0) for (const valid of [false, true]) worlds.push({
    evidence: Object.freeze([Object.freeze({ groups: result.uncertain,
      kind: "uncertain" })]), valid,
  });
  return worlds;
}

function withPatchField(patch, name, fieldValue) {
  return createDescriptorPatch(Object.fromEntries(FIELD_NAMES.flatMap((fieldName) =>
    fieldName === name ? [[fieldName, fieldValue]]
      : has(patch, fieldName) ? [[fieldName, patch[fieldName].value]] : []
  )));
}

export function sameValue(left, right, valueKey = (item) => item) {
  const relation = sameValueRelation(left, right, { identityOf: valueKey });
  if (relation.uncertain.length > 0) return "unknown";
  if (relation.equal.length === 0) return false;
  return relation.unequal.length === 0 ? true : "unknown";
}

function createFromAbsent(patch, kind, undefinedFact) {
  const base = {
    configurable: value(patch, "configurable", false),
    enumerable: value(patch, "enumerable", false),
    kind: kind === "accessor" ? "accessor" : "data",
  };
  return kind === "accessor" ? { ...base,
    getFact: value(patch, "get", undefinedFact),
    setFact: value(patch, "set", undefinedFact),
  } : { ...base,
    valueFact: value(patch, "value", undefinedFact),
    writable: value(patch, "writable", false),
  };
}

function applyCompatible(current, patch, kind, undefinedFact) {
  const nextKind = kind === "generic" ? current.kind : kind;
  let base = current;
  if (nextKind !== current.kind) base = createFromAbsent(
    createDescriptorPatch({ configurable: current.configurable,
      enumerable: current.enumerable }), nextKind, undefinedFact,
  );
  const common = { ...base,
    configurable: value(patch, "configurable", base.configurable),
    enumerable: value(patch, "enumerable", base.enumerable) };
  return nextKind === "accessor" ? { ...common, kind: "accessor",
    getFact: value(patch, "get", base.getFact),
    setFact: value(patch, "set", base.setFact),
  } : { ...common, kind: "data",
    valueFact: value(patch, "value", base.valueFact),
    writable: value(patch, "writable", base.writable),
  };
}

function validateFrozen(current, patch, kind, compare) {
  const rejected = () => [{ evidence: Object.freeze([]), patch, valid: false }];
  if (has(patch, "configurable") && patch.configurable.value) return rejected();
  if (has(patch, "enumerable") &&
    patch.enumerable.value !== current.enumerable) return rejected();
  if (kind !== "generic" && kind !== current.kind) return rejected();
  let worlds = [{ evidence: Object.freeze([]), patch, valid: true }];
  if (current.kind === "data" && current.writable === false) {
    if (has(patch, "writable") && patch.writable.value) return rejected();
    if (has(patch, "value")) worlds = sameWorlds(
      current.valueFact, patch.value.value, compare,
    ).map((world) => ({ ...world, patch: world.narrowed
      ? withPatchField(patch, "value", world.narrowed) : patch }));
  }
  if (current.kind === "accessor") {
    for (const name of ["get", "set"]) if (has(patch, name)) {
      const equality = sameWorlds(
        current[`${name}Fact`], patch[name].value, compare,
      );
      worlds = worlds.flatMap((world) => world.valid ? equality.map((next) => ({
        evidence: Object.freeze([...world.evidence, ...next.evidence]),
        patch: next.narrowed
          ? withPatchField(world.patch, name, next.narrowed) : world.patch,
        valid: next.valid,
      })) : [world]);
    }
  }
  return [...new Set(worlds)];
}

export function validateAndApplyDescriptor(
  current, patch, { compare = sameValue, undefinedFact } = {},
) {
  const emptyPatch = FIELD_NAMES.every((name) => !has(patch, name));
  if (current.kind !== "absent" && emptyPatch) return Object.freeze([
    Object.freeze({ alternative: current, kind: "unchanged" }),
  ]);
  const results = expandCurrent(current).flatMap((alternative) => {
    return expandPatch(patch).flatMap((candidate) => {
      const kind = patchKind(candidate);
      if (kind === "invalid") return [{ kind: "throw" }];
      if (alternative.kind === "absent") return [{ kind: "replace",
        alternative: createFromAbsent(candidate, kind, undefinedFact) }];
      const allowed = alternative.configurable
        ? [{ evidence: Object.freeze([]), valid: true }]
        : validateFrozen(alternative, candidate, kind, compare);
      return allowed.map(({ evidence, patch: accepted = candidate, valid }) => valid
        ? { kind: "replace",
        alternative: applyCompatible(
          alternative, accepted, kind, undefinedFact,
        ), sameValueEvidence: evidence } : { alternative, kind: "throw",
          sameValueEvidence: evidence });
    });
  });
  return Object.freeze(results.map(Object.freeze));
}

export function descriptorPatchFields() {
  return FIELD_NAMES;
}
