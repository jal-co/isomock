import ts from "typescript";

export const SAFE = 0;
export const AUTHORITY = 1;
export const UNKNOWN = 2;

export const provenanceValue = (
  state = SAFE, call = SAFE, members = new Map(), closed = false,
  target, forwardArgs = false, instance, returnValue, parameterIndex, parameterPath = [], parameterRest = false,
) => ({ state, call, members, closed, target, forwardArgs, instance, returnValue, parameterIndex, parameterPath, parameterRest });
export const safeProvenance = () => provenanceValue(SAFE, SAFE, new Map(), true);
export const unknownProvenance = () => provenanceValue(UNKNOWN, UNKNOWN);
export const authorityProvenance = () => provenanceValue(AUTHORITY, AUTHORITY);
const MAX_GRAPH_STEPS = 50_000;
const graphStep = (context) => ++context.steps <= MAX_GRAPH_STEPS;
export function rankProvenance(item, context = { seen: new Set(), steps: 0 }) {
  if (!graphStep(context)) return UNKNOWN;
  if (context.seen.has(item)) return SAFE;
  context.seen.add(item);
  return Math.max(item.state, item.call, item.executionEffect ?? SAFE,
    item.instance ? rankProvenance(item.instance, context) : SAFE,
    item.returnValue ? rankProvenance(item.returnValue, context) : SAFE,
    ...[...(item.boundArguments ?? [])].map((argument) => rankProvenance(argument, context)),
    ...[...(item.writes ?? [])].map(({ assigned }) => rankProvenance(assigned, context)),
    ...[...(item.invokedCallables ?? [])].flatMap(({ argumentsValues, callable }) =>
      [rankProvenance(callable, context), ...argumentsValues.map((argument) => rankProvenance(argument, context))]),
    ...[...item.members.values()].map((member) => rankProvenance(member, context)));
}
export function joinProvenance(left, right, context = { pairs: new Map(), steps: 0 }) {
  if (!graphStep(context)) return unknownProvenance();
  let rights = context.pairs.get(left);
  if (!rights) { rights = new Map(); context.pairs.set(left, rights); }
  if (rights.has(right)) return rights.get(right);
  const members = new Map();
  const result = provenanceValue(Math.max(left.state, right.state), Math.max(left.call, right.call), members,
    left.closed && right.closed, left.target === right.target ? left.target : undefined,
    left.forwardArgs || right.forwardArgs, undefined, undefined,
    left.parameterIndex === right.parameterIndex ? left.parameterIndex : left.parameterIndex === undefined
      ? right.parameterIndex : right.parameterIndex === undefined ? left.parameterIndex : -1,
    samePath(left.parameterPath, right.parameterPath) && left.parameterIndex === right.parameterIndex
      ? left.parameterPath : [], left.parameterRest || right.parameterRest);
  rights.set(right, result);
  for (const [key, item] of left.members) members.set(key, item);
  for (const [key, item] of right.members) {
    members.set(key, members.has(key) ? joinProvenance(members.get(key), item, context) : item);
  }
  result.instance = left.instance && right.instance ? joinProvenance(left.instance, right.instance, context) : left.instance ?? right.instance;
  result.returnValue = left.returnValue && right.returnValue ? joinProvenance(left.returnValue, right.returnValue, context) : left.returnValue ?? right.returnValue;
  result.executionEffect = Math.max(left.executionEffect ?? SAFE, right.executionEffect ?? SAFE);
  if (left.boundArguments || right.boundArguments) {
    if (!left.boundArguments || !right.boundArguments || left.boundArguments.length !== right.boundArguments.length) {
      result.state = UNKNOWN;
      result.boundArguments = [unknownProvenance()];
    } else result.boundArguments = left.boundArguments.map((argument, index) =>
      joinProvenance(argument, right.boundArguments[index], context));
  }
  result.writes = mergeProvenanceWrites(left.writes, right.writes);
  result.invokedParameters = mergeStructuralItems(left.invokedParameters, right.invokedParameters, (a, b) =>
    a.parameterIndex === b.parameterIndex && samePath(a.parameterPath, b.parameterPath) &&
    equalEffectItems(a.argumentsValues, b.argumentsValues, equalProvenance));
  result.invokedCallables = mergeStructuralItems(left.invokedCallables, right.invokedCallables, (a, b) =>
    equalProvenance(a.callable, b.callable) && equalEffectItems(a.argumentsValues, b.argumentsValues, equalProvenance));
  return result;
}
const samePath = (left = [], right = []) => JSON.stringify(left) === JSON.stringify(right);
function mergeEffectItems(left = [], right = [], identity) {
  return [...new Map([...left, ...right].map((item) => [identity(item), item])).values()];
}
function mergeStructuralItems(left = [], right = [], equal) {
  const result = [...left];
  for (const item of right) if (!result.some((candidate) => equal(candidate, item))) result.push(item);
  return result;
}
function mergeProvenanceWrites(left = [], right = []) {
  const merged = new Map();
  for (const write of [...left, ...right]) {
    const key = JSON.stringify([write.targetKey ?? null, write.parameterIndex ?? null,
      write.wildcard ?? false, write.keys]);
    const previous = merged.get(key);
    merged.set(key, previous ? { ...write, assigned: joinProvenance(previous.assigned, write.assigned) } : write);
  }
  return [...merged.values()];
}
export function equalProvenance(left, right, context = { pairs: new Map(), steps: 0 }) {
  if (!graphStep(context)) return false;
  let rights = context.pairs.get(left);
  if (!rights) { rights = new Set(); context.pairs.set(left, rights); }
  if (rights.has(right)) return true;
  rights.add(right);
  return left.state === right.state && left.call === right.call &&
  left.closed === right.closed && left.target === right.target &&
  left.forwardArgs === right.forwardArgs &&
  left.parameterIndex === right.parameterIndex &&
  samePath(left.parameterPath, right.parameterPath) &&
  left.parameterRest === right.parameterRest &&
  left.executionEffect === right.executionEffect &&
  equalEffectItems(left.boundArguments, right.boundArguments, (a, b) => equalProvenance(a, b, context)) &&
  equalEffectItems(left.invokedParameters, right.invokedParameters, (a, b) =>
    a.parameterIndex === b.parameterIndex && samePath(a.parameterPath, b.parameterPath) &&
    equalEffectItems(a.argumentsValues, b.argumentsValues, (x, y) => equalProvenance(x, y, context))) &&
  equalEffectItems(left.invokedCallables, right.invokedCallables, (a, b) =>
    equalProvenance(a.callable, b.callable, context) && equalEffectItems(a.argumentsValues, b.argumentsValues,
      (x, y) => equalProvenance(x, y, context))) &&
  (left.writes?.length ?? 0) === (right.writes?.length ?? 0) &&
  (left.writes ?? []).every((write, index) => {
    const other = right.writes[index];
    return write.targetKey === other.targetKey && write.parameterIndex === other.parameterIndex &&
      write.wildcard === other.wildcard && samePath(write.keys, other.keys) &&
      equalProvenance(write.assigned, other.assigned, context);
  }) &&
  ((!left.instance && !right.instance) ||
    (left.instance && right.instance && equalProvenance(left.instance, right.instance, context))) &&
  ((!left.returnValue && !right.returnValue) ||
    (left.returnValue && right.returnValue && equalProvenance(left.returnValue, right.returnValue, context))) &&
  left.members.size === right.members.size && [...left.members].every(
    ([key, item]) => right.members.has(key) && equalProvenance(item, right.members.get(key), context),
  );
}
function equalEffectItems(left = [], right = [], equal) {
  return left.length === right.length && left.every((item, index) => equal(item, right[index]));
}
export const propertyKey = (node) =>
  ts.isIdentifier(node) || ts.isStringLiteralLike(node) || ts.isNumericLiteral(node)
    ? node.text : undefined;
export const computedKey = (node) =>
  ts.isStringLiteralLike(node) || ts.isNumericLiteral(node) ? node.text : undefined;
export const unwrapExpression = (node) =>
  ts.isAsExpression(node) || ts.isTypeAssertionExpression(node) ||
  ts.isParenthesizedExpression(node) || ts.isNonNullExpression(node) ||
  ts.isSatisfiesExpression(node) ? unwrapExpression(node.expression) : node;

export const tagProvenance = (item, target) =>
  target ? { ...item, target: item.target ?? target } : item;
export function readProvenanceMember(owner, key) {
  if (key === undefined) return tagProvenance(unknownProvenance(), owner.target);
  if (owner.parameterIndex !== undefined) {
    return provenanceValue(SAFE, SAFE, new Map(), true, owner.target, false, undefined, undefined,
      owner.parameterIndex, [...owner.parameterPath, key], owner.parameterRest);
  }
  const exact = owner.members.get(key);
  const uncertainty = owner.members.get("*") ??
    (owner.state === UNKNOWN ? unknownProvenance() : undefined);
  const resolved = exact && uncertainty ? joinProvenance(exact, uncertainty) :
    exact ?? uncertainty ??
    (owner.state === AUTHORITY && ["info", "length", "name"].includes(key)
      ? safeProvenance() : undefined) ??
    (owner.state === AUTHORITY
      ? authorityProvenance() : owner.closed ? safeProvenance() : unknownProvenance());
  return tagProvenance(resolved, owner.target);
}

export function poisonProvenance(item) {
  item.state = UNKNOWN;
  item.call = UNKNOWN;
  item.closed = false;
  item.members.set("*", unknownProvenance());
}

export function writeProvenancePath(target, keys, assigned) {
  if (!target || keys.some((key) => key === undefined)) {
    if (target) poisonProvenance(target);
    return false;
  }
  if (keys.length === 0) {
    target.state = assigned.state;
    target.call = assigned.call;
    target.closed = assigned.closed;
    target.members = new Map(assigned.members);
    target.target = assigned.target;
    target.forwardArgs = assigned.forwardArgs;
    target.executionEffect = assigned.executionEffect;
    target.invokedCallables = assigned.invokedCallables;
    target.invokedParameters = assigned.invokedParameters;
    target.instance = assigned.instance;
    target.returnValue = assigned.returnValue;
    target.parameterIndex = assigned.parameterIndex;
    target.parameterPath = assigned.parameterPath;
    target.parameterRest = assigned.parameterRest;
    target.writes = assigned.writes;
    target.boundArguments = assigned.boundArguments;
    return true;
  }
  let destination = target;
  for (const key of keys.slice(0, -1)) {
    const next = destination.members.get(key);
    if (!next) {
      poisonProvenance(destination);
      return false;
    }
    destination = next;
  }
  destination.members.set(keys.at(-1), assigned);
  return true;
}

export function substituteProvenanceParameters(item, argumentsValues, context = { seen: new Map(), steps: 0 }) {
  if (!graphStep(context)) return unknownProvenance();
  if (item.parameterIndex !== undefined) {
    let resolved = item.parameterRest
      ? provenanceValue(SAFE, SAFE, new Map(argumentsValues.slice(item.parameterIndex).map((argument, index) => [String(index), argument])), true)
      : item.parameterIndex === -1
      ? argumentsValues.reduce(joinProvenance, safeProvenance())
      : argumentsValues[item.parameterIndex] ?? unknownProvenance();
    for (const key of item.parameterPath) {
      if (key === "$call") {
        resolved = resolved.returnValue ??
          (resolved.call === AUTHORITY ? authorityProvenance() : resolved.call === SAFE ? safeProvenance() : unknownProvenance());
      } else resolved = readProvenanceMember(resolved, key);
    }
    return resolved;
  }
  if (context.seen.has(item)) return context.seen.get(item);
  const result = provenanceValue(item.state, item.call, new Map(), item.closed, item.target, item.forwardArgs);
  context.seen.set(item, result);
  for (const [key, member] of item.members) result.members.set(key,
    substituteProvenanceParameters(member, argumentsValues, context));
  if (item.instance) result.instance = substituteProvenanceParameters(item.instance, argumentsValues, context);
  if (item.returnValue) result.returnValue = substituteProvenanceParameters(item.returnValue, argumentsValues, context);
  if (item.boundArguments) result.boundArguments = item.boundArguments.map((argument) => substituteProvenanceParameters(argument, argumentsValues, context));
  result.executionEffect = item.executionEffect;
  result.writes = (item.writes ?? []).map((write) => ({
    ...write,
    assigned: substituteProvenanceParameters(write.assigned, argumentsValues, context),
    parameterIndex: undefined,
    target: write.parameterIndex === undefined ? write.target : argumentsValues[write.parameterIndex] ?? unknownProvenance(),
  }));
  result.invokedCallables = [
    ...(item.invokedCallables ?? []).map((invocation) => ({
      argumentsValues: invocation.argumentsValues.map((argument) => substituteProvenanceParameters(argument, argumentsValues, context)),
      callable: substituteProvenanceParameters(invocation.callable, argumentsValues, context),
    })),
    ...(item.invokedParameters ?? []).map((invocation) => ({
      argumentsValues: (invocation.argumentsValues ?? []).map((argument) => substituteProvenanceParameters(argument, argumentsValues, context)),
      callable: resolveParameterReference(invocation, argumentsValues),
    })),
  ];
  return result;
}
function resolveParameterReference(reference, argumentsValues) {
  let resolved = argumentsValues[reference.parameterIndex] ?? unknownProvenance();
  for (const key of reference.parameterPath) resolved = readProvenanceMember(resolved, key);
  return resolved;
}
export function hasProvenanceParameter(item, context = { seen: new Set(), steps: 0 }) {
  if (!graphStep(context)) return true;
  if (context.seen.has(item)) return false;
  context.seen.add(item);
  return item.parameterIndex !== undefined ||
    Boolean(item.instance && hasProvenanceParameter(item.instance, context)) ||
    Boolean(item.returnValue && hasProvenanceParameter(item.returnValue, context)) ||
    [...item.members.values()].some((member) => hasProvenanceParameter(member, context)) ||
    (item.writes ?? []).some(({ assigned }) => hasProvenanceParameter(assigned, context)) ||
    (item.invokedCallables ?? []).some(({ argumentsValues, callable }) =>
      hasProvenanceParameter(callable, context) || argumentsValues.some((argument) => hasProvenanceParameter(argument, context))) ||
    (item.invokedParameters ?? []).some(({ argumentsValues = [] }) =>
      argumentsValues.some((argument) => hasProvenanceParameter(argument, context)));
}

export function cloneProvenance(item, seen = new Map()) {
  seen.graphSteps = (seen.graphSteps ?? 0) + 1;
  if (seen.graphSteps > MAX_GRAPH_STEPS) return unknownProvenance();
  if (seen.has(item)) return seen.get(item);
  const cloned = provenanceValue(
    item.state, item.call, new Map(), item.closed, item.target,
    item.forwardArgs, undefined, undefined, item.parameterIndex, item.parameterPath, item.parameterRest,
  );
  seen.set(item, cloned);
  for (const [key, member] of item.members) cloned.members.set(key, cloneProvenance(member, seen));
  if (item.instance) cloned.instance = cloneProvenance(item.instance, seen);
  if (item.returnValue) cloned.returnValue = cloneProvenance(item.returnValue, seen);
  if (item.boundArguments) cloned.boundArguments = item.boundArguments.map((argument) => cloneProvenance(argument, seen));
  if (item.writes) cloned.writes = item.writes.map((write) => ({
    ...write, assigned: cloneProvenance(write.assigned, seen), target: seen.get(write.target) ?? write.target,
  }));
  cloned.executionEffect = item.executionEffect;
  cloned.invokedParameters = item.invokedParameters?.map((item) => ({ ...item,
    argumentsValues: item.argumentsValues?.map((argument) => cloneProvenance(argument, seen)),
    parameterPath: [...item.parameterPath] }));
  cloned.invokedCallables = item.invokedCallables?.map((invocation) => ({
    argumentsValues: invocation.argumentsValues.map((argument) => cloneProvenance(argument, seen)),
    callable: cloneProvenance(invocation.callable, seen),
  }));
  return cloned;
}

export function retargetClonedProvenanceWrites(item, clones, seen = new Set()) {
  seen.graphSteps = (seen.graphSteps ?? 0) + 1;
  if (seen.graphSteps > MAX_GRAPH_STEPS) { poisonProvenance(item); return; }
  if (seen.has(item)) return;
  seen.add(item);
  if (item.writes) for (const write of item.writes) write.target = clones.get(write.target) ?? write.target;
  if (item.writes) for (const write of item.writes) retargetClonedProvenanceWrites(write.assigned, clones, seen);
  if (item.invokedCallables) for (const invocation of item.invokedCallables) {
    retargetClonedProvenanceWrites(invocation.callable, clones, seen);
    for (const argument of invocation.argumentsValues) retargetClonedProvenanceWrites(argument, clones, seen);
  }
  if (item.invokedParameters) for (const invocation of item.invokedParameters) {
    for (const argument of invocation.argumentsValues ?? []) retargetClonedProvenanceWrites(argument, clones, seen);
  }
  for (const member of item.members.values()) retargetClonedProvenanceWrites(member, clones, seen);
  if (item.instance) retargetClonedProvenanceWrites(item.instance, clones, seen);
  if (item.returnValue) retargetClonedProvenanceWrites(item.returnValue, clones, seen);
}

export function getProvenanceAccessPath(input) {
  const node = unwrapExpression(input);
  if (ts.isIdentifier(node)) return { keys: [], root: node.text };
  if (node.kind === ts.SyntaxKind.ThisKeyword) return { keys: [], root: "$this" };
  if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
    const parent = getProvenanceAccessPath(node.expression);
    const key = ts.isPropertyAccessExpression(node)
      ? node.name.text : computedKey(node.argumentExpression);
    return parent ? { keys: [...parent.keys, key], root: parent.root } : undefined;
  }
  return undefined;
}
