import { UNKNOWN } from "./toolcraft-flow-facts.mjs";

function freeze(values = []) {
  return Object.freeze([...values]);
}

export function toolcraftEvaluatedValue({
  callable,
  candidates = [],
  constructionPlan,
  evaluatedMembers = [],
  evidence = [],
  fact = UNKNOWN,
  keyCandidates = [],
  keyFact,
  objectRef,
  positionalShape,
  source,
}) {
  return Object.freeze({
    callable,
    candidates: freeze(candidates),
    constructionPlan,
    evaluatedMembers: freeze(evaluatedMembers),
    evidence: freeze(evidence),
    fact,
    keyCandidates: freeze(keyCandidates),
    keyFact,
    kind: "EvaluatedValue",
    objectRef,
    positionalShape,
    source,
  });
}

export function toolcraftEvaluatedLiteralMember({
  callable,
  completion = "normal",
  descriptor,
  descriptors = [],
  evidence = [],
  key,
  kind,
  order,
  propertyRemainder,
  source,
  value,
}) {
  return Object.freeze({
    callable,
    completion,
    descriptor,
    descriptors: freeze(descriptors),
    evidence: freeze(evidence),
    key,
    kind,
    order,
    propertyRemainder,
    source,
    value,
  });
}

export function toolcraftEvaluatedKey(propertyKey, source, keyFact) {
  return Object.freeze({ keyFact, propertyKey, source,
    value: propertyKey?.kind === "string" ? propertyKey.value : undefined });
}
