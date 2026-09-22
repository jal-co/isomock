function freezeArray(values = []) {
  return Object.freeze(values.map((value) => Array.isArray(value)
    ? freezeArray(value) : value));
}

export function toolcraftInvocationFact({
  actual = [],
  adapter = "direct",
  arguments: arguments_,
  call,
  callable,
  candidates = [],
  construct = false,
  evidence = [],
  evaluated = [],
  intrinsic,
  thisArgument,
}) {
  const positional = arguments_?.kind === "array" ? Object.freeze({
    ...arguments_,
    evidence: freezeArray(arguments_.evidence),
    tails: freezeArray(arguments_.tails),
    variants: freezeArray(arguments_.variants),
  }) : arguments_;
  return Object.freeze({
    actual: freezeArray(actual),
    adapter,
    arguments: positional,
    call,
    callable,
    candidates: freezeArray(candidates),
    construct,
    evidence: freezeArray(evidence),
    evaluated: freezeArray(evaluated),
    intrinsic,
    kind: "invocation",
    thisArgument,
  });
}

export function toolcraftInvocationAlternatives(kind, values = [], evidence = []) {
  const exhaustedPaths = kind === "exact" ? [] : evidence;
  return Object.freeze({
    evidence: freezeArray(evidence),
    exhaustedPaths: freezeArray(exhaustedPaths),
    kind,
    values: freezeArray(values),
  });
}

export function toolcraftInvocationSources(first, second) {
  if (!first) return second;
  if (!second) return first;
  return Object.freeze({
    evidence: freezeArray([...(first.evidence ?? []), ...(second.evidence ?? [])]),
    kind: "array",
    tails: freezeArray([...(first.tails ?? []), ...(second.tails ?? [])]),
    variants: freezeArray([[
      ...(first.variants?.[0] ?? []), ...(second.variants?.[0] ?? []),
    ]]),
  });
}
