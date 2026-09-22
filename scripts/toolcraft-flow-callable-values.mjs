import { UNKNOWN, exact } from "./toolcraft-flow-facts.mjs";
import { toolcraftEvaluatedValue } from
  "./toolcraft-flow-evaluated-values.mjs";
import { readToolcraftBinding } from "./toolcraft-flow-environments.mjs";
import { toolcraftHostBindingInitializer, toolcraftHostBindingPath } from "./toolcraft-host-origin-values.mjs";

const MAX_CALLABLE_DEPTH = 12;
const ADAPTERS = new Set(["apply", "bind", "call"]);

export function createToolcraftFlowCallableValues({
  checker, index, memory, objectProvenance, ts,
}) {
  const externalCandidates = [new WeakMap(), new WeakMap()];

  function isDefinitelyNonCallable(node) {
    return ts.isLiteralExpression(node) ||
      ts.isObjectLiteralExpression(node) ||
      ts.isArrayLiteralExpression(node) ||
      ts.isTemplateExpression(node) || [
        ts.SyntaxKind.FalseKeyword,
        ts.SyntaxKind.NullKeyword,
        ts.SyntaxKind.TrueKeyword,
      ].includes(node.kind);
  }

  function candidatesAt(fact, fallback, state, depth = 0, construct = false) {
    const values = fact?.kind === "exact" ? fact.values
      : fact?.possibleValues ?? [];
    const candidates = values.flatMap((value) => {
      const local = candidatesForNode(
        value, state, depth + 1, new Set(), construct,
      );
      return local.length > 0 ? local
        : [externalCandidate(index.unwrap(value), construct)].filter(Boolean);
    });
    if (candidates.length > 0) return candidates;
    const fallbackCandidates = fallback ? candidatesForNode(
      fallback, state, depth + 1, new Set(), construct,
    ) : [];
    return fallbackCandidates.length > 0 ? fallbackCandidates
      : fallback ? [externalCandidate(fallback, construct)].filter(Boolean) : [];
  }

  function candidatesForNode(expression, state, depth = 0, visited = new Set(),
    construct = false) {
    if (!expression) return [];
    const node = index.unwrap(expression);
    const captured = memory.callableAt(node, state);
    if (captured !== undefined) return captured;
    if (depth >= MAX_CALLABLE_DEPTH) return [];
    if (ts.isFunctionLike(node) && node.body &&
      !ts.isFunctionDeclaration(node)) return [{ bound: [], fn: node }];
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node))
      return propertyCandidates(node, state, depth + 1, visited, construct);
    if (!ts.isIdentifier(node)) return [];
    const symbol = checker.getSymbolAtLocation(node);
    if (!symbol || visited.has(symbol)) return [];
    const nextVisited = new Set(visited).add(symbol);
    const flowed = readToolcraftBinding(state, symbol);
    if (flowed?.kind === "exact" &&
      !(flowed.values.length === 1 && flowed.values[0] === node)) {
      const candidates = flowed.values.flatMap((value) => candidatesForNode(
        value, state, depth + 1, nextVisited, construct,
      ));
      if (candidates.length > 0) return candidates;
    }
    return (symbol.declarations ?? []).flatMap((declaration) => {
      if (ts.isBindingElement(declaration)) {
        const initializer = toolcraftHostBindingInitializer(declaration, ts);
        const path = toolcraftHostBindingPath(declaration, () => undefined, ts);
        if (initializer && path?.length === 1 && ADAPTERS.has(path[0])) {
          const base = memory.materialize(initializer, state, depth + 1);
          return adapterCandidates({
            baseFact: base.fact, member: path[0], node: declaration,
            propertySymbol: checker.getSymbolAtLocation(declaration.propertyName ??
              declaration.name), receiverSource: initializer,
          }, base.state, depth + 1, nextVisited);
        }
      }
      if (ts.isFunctionLike(declaration) && declaration.body &&
        !ts.isFunctionDeclaration(declaration)) return [{ bound: [], fn: declaration }];
      return ts.isVariableDeclaration(declaration) && declaration.initializer
        ? candidatesForNode(
            declaration.initializer, state, depth + 1, nextVisited, construct,
          ) : [];
    });
  }

  function adapterCandidates(reference, state, depth, visited) {
    if (!ADAPTERS.has(reference.member)) return [];
    const candidates = referenceCandidates(reference, state, depth);
    const adapter = objectProvenance.canonicalAdapter(
      reference, state, candidates,
    );
    return adapter && adapter.proof !== "present"
      ? candidates.map((candidate) => Object.freeze({
      ...candidate, adapterKind: adapter.kind,
      callableSource: candidate.callableSource ?? reference.receiverSource,
    })) : [];
  }
  function referenceCandidates(reference, state, depth) {
    const local = candidatesAt(reference.baseFact, reference.receiverSource,
      state, depth + 1);
    const external = local.length === 0 &&
      externalCandidate(reference.receiverSource);
    return external ? [external] : local;
  }

  function propertyCandidates(node, state, depth, visited, construct = false) {
    const base = memory.materialize(node.expression, state, depth + 1);
    const reference = { baseFact: base.fact, member: index.staticMember(node),
      node, receiverSource: node.expression };
    const property = memory.propertyValue(node, base.state, depth + 1).fact;
    const ordinary = candidatesAt(
      property, undefined, base.state, depth + 1, construct,
    )
      .map((candidate) => ({ ...candidate, thisFact: base.fact }));
    const adapters = construct ? []
      : adapterCandidates(reference, base.state, depth, visited);
    return [...ordinary, ...adapters];
  }

  function externalCandidate(source, construct = false) {
    if (!source) return;
    const node = index.unwrap(source);
    if (isDefinitelyNonCallable(node)) return;
    const cache = externalCandidates[construct ? 1 : 0];
    if (cache.has(node)) return cache.get(node);
    const type = checker.getTypeAtLocation(node);
    const variants = type?.isUnionOrIntersection?.() ? type.types
      : type ? [type] : [];
    const candidate = variants.length === 0 || variants.some((variant) =>
      (variant.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) !== 0
    ) || !variants.every((variant) => checker.getSignaturesOfType(
      variant, construct ? ts.SignatureKind.Construct : ts.SignatureKind.Call,
    ).length > 0) ? undefined : Object.freeze({
      bound: [], callableSource: node, external: true,
    });
    cache.set(node, candidate);
    return candidate;
  }

  function factForReference(reference, state, depth = 0) {
    if (!ADAPTERS.has(reference.member)) return;
    const candidates = referenceCandidates(reference, state, depth);
    const adapter = objectProvenance.canonicalAdapter(reference, state, candidates);
    return adapter && adapter.proof !== "present"
      ? exact([reference.node]) : undefined;
  }
  function captureValue(source, fact, state, depth = 0) {
    const callable = fact?.kind === "exact" && fact.values.length === 1
      ? fact.values[0] : source;
    const keyFact = memory.propertyKeys.fromFact(fact, source);
    const keyCandidates = keyFact.alternatives.filter(
      ({ kind }) => kind === "string"
    ).map(({ value }) => value);
    return toolcraftEvaluatedValue({ callable,
      candidates: Object.freeze(candidatesAt(fact, source, state, depth)),
      fact: fact ?? UNKNOWN, keyCandidates, keyFact, objectRef: callable,
      source: index.unwrap(source) });
  }

  function captureCallee(call, outcome, depth = 0) {
    const reference = outcome.reference;
    const baseCandidates = reference && ADAPTERS.has(reference.member)
      ? referenceCandidates(reference, outcome.state, depth + 1) : [];
    const adapter = objectProvenance.canonicalAdapter(
      reference, outcome.state, baseCandidates,
    );
    const adapterValue = adapter
      ? Object.freeze({
          callable: reference.baseFact?.kind === "exact" &&
            reference.baseFact.values.length === 1
            ? reference.baseFact.values[0] : reference.receiverSource,
          candidates: Object.freeze(baseCandidates),
          fact: reference.baseFact ?? UNKNOWN,
          source: reference.receiverSource,
        })
      : undefined;
    const ordinaryValue = captureValue(
      call.expression, outcome.fact, outcome.state, depth + 1,
    );
    let value = adapter?.proof === "absent" ? adapterValue : ordinaryValue;
    const aliasKinds = new Set(value.candidates.map(({ adapterKind }) =>
      adapterKind
    ).filter(Boolean));
    let effectiveAdapter = adapter?.proof === "present" ? undefined : adapter;
    if (!effectiveAdapter && aliasKinds.size === 1 && value.candidates.every(
      ({ adapterKind }) => adapterKind,
    )) {
      effectiveAdapter = Object.freeze({ kind: [...aliasKinds][0] });
      value = Object.freeze({ ...value, candidates: Object.freeze(
        value.candidates.map(({ adapterKind: omitted, ...candidate }) =>
          Object.freeze(candidate)
        ),
      ) });
    }
    const prepared = Object.freeze({
      ...value,
      adapter: effectiveAdapter,
      construct: ts.isNewExpression(call),
      intrinsic: objectProvenance.intrinsicKind(reference),
      receiverFact: effectiveAdapter ? undefined : outcome.receiverFact,
      receiverSource: effectiveAdapter ? undefined : reference?.receiverSource,
      site: call,
    });
    if (adapter?.proof !== "unknown") return prepared;
    const canonical = Object.freeze({ ...prepared, ...adapterValue,
      adapter: Object.freeze({ kind: adapter.kind }) });
    return Object.freeze({ ...prepared,
      alternatives: Object.freeze([prepared, canonical]) });
  }

  return Object.freeze({ candidatesAt, captureCallee, captureValue, factForReference });
}
