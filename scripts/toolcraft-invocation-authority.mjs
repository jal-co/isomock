import { HOLE, UNKNOWN, exact } from "./toolcraft-flow-facts.mjs";
import { toolcraftInvocationFact, toolcraftInvocationSources } from
  "./toolcraft-invocation-facts.mjs";

const MAX_INVOCATION_SOURCES = 128;

function normalizeFacts(evaluated) {
  return evaluated.flatMap(({ fact, positionalShape, spread, unresolved }) => unresolved
    ? [] : !spread
      ? [fact ?? UNKNOWN]
      : positionalShape && positionalShape.evidence.length === 0 &&
        positionalShape.tails.length === 0
        ? positionalShape.slots : [UNKNOWN]);
}

function sourceShape(evaluated) {
  const items = [];
  const tails = [];
  const evidence = [];
  for (const argument of evaluated) {
    if (!argument.spread) {
      items.push(argument.source);
      continue;
    }
    if (!argument.positionalShape) {
      tails.push(argument.source);
      evidence.push("typed-or-unknown-length");
      continue;
    }
    for (const fact of argument.positionalShape.slots) {
      if (fact.kind === "absent") items.push(HOLE);
      else if (fact.kind === "exact") items.push(...fact.values);
      else {
        tails.push(argument.source);
        evidence.push("unknown-slot");
      }
    }
    tails.push(...argument.positionalShape.tails);
    evidence.push(...argument.positionalShape.evidence);
  }
  if (items.length > MAX_INVOCATION_SOURCES ||
    tails.length > MAX_INVOCATION_SOURCES) evidence.push("overflow-span");
  return Object.freeze({ evidence: Object.freeze(evidence), kind: "array",
    tails: Object.freeze(tails), variants: Object.freeze([
      Object.freeze(items),
    ]) });
}

export function createToolcraftInvocationAuthority() {
  function bind(prepared, evaluated, normalized) {
    const boundSources = sourceShape(evaluated.slice(1));
    return Object.freeze({
      candidates: Object.freeze(prepared.candidates.map((candidate) =>
        Object.freeze({
          ...candidate,
          bound: Object.freeze([
            ...(candidate.bound ?? []), ...normalized.slice(1),
          ]),
          boundSources: Object.freeze([
            ...(candidate.boundSources ?? []),
            ...(boundSources.variants[0] ?? []), ...boundSources.tails,
          ]),
          boundSourceShape: toolcraftInvocationSources(
            candidate.boundSourceShape, boundSources,
          ),
          callableSource: candidate.callableSource ?? prepared.callable,
          thisBound: true,
          thisFact: candidate.thisBound
            ? candidate.thisFact : evaluated[0]?.fact,
          thisSource: candidate.thisBound
            ? candidate.thisSource : evaluated[0]?.source,
        }))),
      kind: "deferred",
    });
  }

  function invocation(prepared, evaluated, normalized) {
    const adapter = prepared.adapter?.kind;
    let actual = adapter === "call" ? normalized.slice(1) : normalized;
    let sourceArguments = adapter === "call"
      ? evaluated.slice(1) : evaluated;
    if (adapter === "apply") {
      const shape = evaluated[1]?.positionalShape;
      actual = shape && shape.evidence.length === 0
        ? shape.slots : [evaluated[1]?.fact ?? UNKNOWN];
      sourceArguments = evaluated[1]
        ? [{ ...evaluated[1], spread: true }] : [];
    }
    const candidates = prepared.candidates.map((candidate) => Object.freeze({
      ...candidate,
      thisFact: candidate.thisBound ? candidate.thisFact
        : prepared.construct ? exact([prepared.site])
          : adapter ? evaluated[0]?.fact
            : prepared.receiverFact ?? candidate.thisFact,
    }));
    const bound = candidates.length === 1 ? candidates[0] : undefined;
    return toolcraftInvocationFact({
      actual,
      adapter: bound?.thisBound ? "bound" : adapter ?? "direct",
      arguments: toolcraftInvocationSources(
        bound?.boundSourceShape, sourceShape(sourceArguments),
      ),
      call: prepared.site,
      callable: bound?.callableSource ?? prepared.callable,
      candidates,
      construct: prepared.construct,
      evaluated,
      intrinsic: prepared.intrinsic,
      thisArgument: bound?.thisSource ?? (adapter
        ? evaluated[0]?.source : prepared.receiverSource),
    });
  }

  function normalize(prepared, evaluated) {
    return (prepared.alternatives ?? [prepared]).map((alternative) => {
      const normalized = normalizeFacts(evaluated);
      return alternative.adapter?.kind === "bind"
        ? bind(alternative, evaluated, normalized)
        : invocation(alternative, evaluated, normalized);
    });
  }

  return Object.freeze({ normalize });
}
