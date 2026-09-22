import { createToolcraftDomSummaryWalker } from
  "./toolcraft-dom-summary-walker.mjs";
import { createToolcraftDomBoundedTypeReader } from
  "./toolcraft-dom-bounded-type-reader.mjs";
import { toolcraftDeclarationIsExternal } from
  "./toolcraft-typescript-declaration-origin.mjs";

const unconstrainedTypeNodeCache = new WeakMap();
const MAX_CALL_TARGETS = 64;
const MAX_CALL_PAIR_VISITS = 256;
const MAX_CALL_SOURCE_SUMMARIES = 512;
const OVERFLOW_TARGET = Object.freeze({ overflow: true });

function createPairCollector(pairIsDangerous, overflowIsDangerous) {
  const pairs = [];
  const pairedRisk = new Map();
  let dangerousOverflow = false;
  let exhaustedOverflow = false;
  let overflow = false;
  let sourceSummaries = 0;
  let visits = 0;
  return Object.freeze({
    add(source, target) {
      if (target?.overflow) {
        overflow = true;
        sourceSummaries += 1;
        if (sourceSummaries > MAX_CALL_SOURCE_SUMMARIES) {
          exhaustedOverflow = true;
          return false;
        }
        dangerousOverflow ||= overflowIsDangerous([source]);
        return true;
      }
      visits += 1;
      if (visits > MAX_CALL_PAIR_VISITS) {
        overflow = true;
        exhaustedOverflow = true;
        return false;
      }
      const pair = { source, target };
      const dangerous = pairIsDangerous?.(pair) === true;
      const knownRisk = pairedRisk.get(source);
      pairedRisk.set(source, {
        dangerous: dangerous || knownRisk?.dangerous === true,
      });
      if (pairs.length < MAX_CALL_TARGETS) pairs.push(pair);
      else {
        overflow = true;
        dangerousOverflow ||= dangerous;
      }
      return true;
    },
    assess(source) {
      if (!pairedRisk.has(source)) pairedRisk.set(source, { dangerous: false });
    },
    exhaust(source, assessSource = false) {
      overflow = true;
      const dangerous = overflowIsDangerous([source]);
      exhaustedOverflow ||= !assessSource || dangerous;
      dangerousOverflow ||= dangerous;
    },
    revisit(source) {
      overflow = true;
      const knownRisk = pairedRisk.get(source);
      if (!knownRisk || !pairIsDangerous) {
        const dangerous = overflowIsDangerous([source]);
        exhaustedOverflow ||= dangerous;
        dangerousOverflow ||= dangerous;
        return;
      }
      exhaustedOverflow ||= knownRisk.dangerous;
      dangerousOverflow ||= knownRisk.dangerous;
    },
    result() {
      return Object.freeze({
        dangerousOverflow,
        evidence: Object.freeze(overflow ? ["overflow"] : []),
        pairs: Object.freeze(pairs),
        unknownOverflow: exhaustedOverflow,
      });
    },
  });
}

function hasUnconstrainedTypeParameter(typeNode, checker, ts) {
  if (unconstrainedTypeNodeCache.has(typeNode)) {
    return unconstrainedTypeNodeCache.get(typeNode);
  }
  let unconstrained = false;
  function visit(node) {
    if (unconstrained) return;
    const type = checker.getTypeAtLocation(node);
    if ((type.flags & ts.TypeFlags.TypeParameter) !== 0) {
      const constraint = checker.getBaseConstraintOfType(type);
      if (!constraint || (constraint.flags & (
        ts.TypeFlags.Any | ts.TypeFlags.Unknown
      )) !== 0) {
        unconstrained = true;
        return;
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(typeNode);
  unconstrainedTypeNodeCache.set(typeNode, unconstrained);
  return unconstrained;
}

function parameterTargets({
  allowUnconstrained = false,
  checker,
  index,
  location,
  reader,
  signature,
  ts,
}) {
  const predicate = signature && checker.getTypePredicateOfSignature(signature);
  if (predicate?.parameterIndex === index) return [];
  const parametersResult = signature
    ? reader.parametersOf(signature, "target") : { kind: "exact", values: [] };
  if (parametersResult.kind === "exhausted") return [OVERFLOW_TARGET];
  const parameters = parametersResult.values;
  const parameter = parameters[Math.min(index, parameters.length - 1)];
  const declaration = parameter?.valueDeclaration ??
    parameter?.declarations?.[0];
  if (!parameter || !declaration) return [];
  const unconstrained = declaration.type &&
    hasUnconstrainedTypeParameter(declaration.type, checker, ts);
  function restElement(type) {
    const restIndex = index - parameters.length + 1;
    const member = checker.getPropertyOfType(type, String(restIndex));
    return member
      ? checker.getTypeOfSymbolAtLocation(member, location)
      : checker.getIndexTypeOfType(type, ts.IndexKind.Number) ?? type;
  }
  let type = checker.getTypeOfSymbolAtLocation(parameter, location);
  if (declaration.dotDotDotToken && index >= parameters.length - 1) {
    type = restElement(type);
  }
  let declaredType = declaration.type && !unconstrained
    ? checker.getTypeFromTypeNode(declaration.type)
    : undefined;
  if (declaredType && declaration.dotDotDotToken &&
    index >= parameters.length - 1) declaredType = restElement(declaredType);
  return [
    allowUnconstrained || !unconstrained ? type : undefined,
    declaredType,
  ].filter((candidate, candidateIndex, candidates) =>
    candidate && candidates.indexOf(candidate) === candidateIndex
  ).map((candidate, candidateIndex) => ({
    external: toolcraftDeclarationIsExternal(declaration),
    node: declaration.type,
    preservesIdentity: candidateIndex === 0 && !location.typeArguments?.length &&
      Boolean(signature.getDeclaration?.()?.typeParameters?.length),
    type: candidate,
  }));
}

export function toolcraftDomCallParameterTargets({
  call,
  checker,
  flowValues,
  index,
  reader,
  ts,
}) {
  const boundedReader = reader ?? createToolcraftDomBoundedTypeReader({
    checker, ts,
  });
  const resolved = checker.getResolvedSignature(call);
  const signatures = resolved ? [{ allowUnconstrained: true, signature: resolved }] : [];
  const declaration = resolved?.getDeclaration?.();
  const declared = declaration && checker.getSignatureFromDeclaration(declaration);
  if (declared && declared !== resolved) signatures.push({ signature: declared });
  return signatures.flatMap(({ allowUnconstrained, signature }) => parameterTargets({
    allowUnconstrained,
    checker,
    index,
    location: call,
    reader: boundedReader,
    signature,
    ts,
  }));
}

export function toolcraftDomCallArgumentTargets({
  call,
  checker,
  flowValues,
  pairIsDangerous,
  reader,
  ts,
}) {
  const boundedReader = reader ?? createToolcraftDomBoundedTypeReader({
    checker, ts,
  });
  const summary = createToolcraftDomSummaryWalker({
    checker, reader: boundedReader, ts,
  });
  const collector = createPairCollector(pairIsDangerous, (sources) =>
    summary.summarize(sources.map((source) =>
      checker.getTypeAtLocation(source)
    ), "source").risk !== "safe"
  );
  function addTargets(source, targets) {
    for (const target of targets) {
      if (!collector.add(source, target)) return false;
    }
    return true;
  }
  const fact = flowValues?.invocationsAt?.(call) ?? { kind: "unknown" };
  if (fact.kind === "exhausted") {
    for (const source of [call, ...(call.arguments ?? [])]) collector.exhaust(source, true);
    return collector.result();
  }
  if (fact.kind === "exact" || fact.kind === "partial") {
    invocationLoop: for (const invocation of fact.values) {
      const signaturesResult = boundedReader.signaturesOfKind(
        checker.getTypeAtLocation(invocation.callable), invocation.construct
          ? ts.SignatureKind.Construct : ts.SignatureKind.Call, "target",
      );
      if (signaturesResult.kind === "exhausted") {
        collector.add(call, OVERFLOW_TARGET);
        continue;
      }
      const resolved = invocation.adapter === "direct"
        ? checker.getResolvedSignature(invocation.call) : undefined;
      const signatures = signaturesResult.values.map((signature) => ({
        allowUnconstrained: signature === resolved, signature,
      }));
      if (resolved && !signaturesResult.values.includes(resolved)) {
        signatures.push({ allowUnconstrained: true, signature: resolved });
      }
      if (invocation.thisArgument) {
        for (const { signature } of signatures) {
          const parameter = signature.thisParameter;
          const declaration = parameter?.valueDeclaration ??
            parameter?.declarations?.[0];
          if (!parameter || !declaration) continue;
          const type = checker.getTypeOfSymbolAtLocation(parameter, call);
          if (!collector.add(invocation.thisArgument, {
            external: toolcraftDeclarationIsExternal(declaration),
            node: declaration.type,
            preservesIdentity: false,
            type,
          })) break invocationLoop;
        }
      }
      const slots = invocation.arguments;
      if (slots?.kind !== "array") {
        collector.add(call, OVERFLOW_TARGET);
        continue;
      }
      for (const items of slots.variants) {
        for (const [index, source] of items.entries()) {
          if (source?.kind === "hole") continue;
          let targeted = false;
          for (const { allowUnconstrained, signature } of signatures) {
            const targets = parameterTargets({
              allowUnconstrained, checker, index, location: call,
              reader: boundedReader, signature, ts,
            });
            targeted ||= targets.length > 0;
            if (!addTargets(source, targets)) break invocationLoop;
          }
          if (!targeted) collector.assess(source);
        }
      }
      for (const source of slots.tails) {
        const sourceType = checker.getTypeAtLocation(source);
        const elementType = checker.getIndexTypeOfType(
          sourceType, ts.IndexKind.Number,
        );
        if (elementType && summary.summarize(
          [elementType], "source",
        ).risk === "safe") continue;
        for (const { allowUnconstrained, signature } of signatures) {
          const parameters = boundedReader.parametersOf(signature, "target");
          if (parameters.kind === "exhausted") {
            collector.add(source, OVERFLOW_TARGET);
            continue;
          }
          const count = Math.max(parameters.values.length, 1);
          for (let index = 0; index < count; index += 1) {
            if (!addTargets(source, parameterTargets({
              allowUnconstrained, checker, index, location: call,
              reader: boundedReader, signature, ts,
            }))) break invocationLoop;
          }
        }
      }
    }
    if (fact.kind === "partial") {
      for (const path of fact.exhaustedPaths ?? fact.evidence ?? []) {
        if (path.sources?.length > 0) {
          for (const source of path.sources) collector.revisit(source);
        } else if (path.coverage === "may-revisit") {
          const sources = [...new Set(fact.values.flatMap((invocation) => [
            ...(invocation.arguments?.variants ?? []).flat(),
            ...(invocation.arguments?.tails ?? []),
          ]).filter((source) => source?.kind !== "hole"))];
          for (const source of sources) collector.revisit(source);
        } else {
          for (const source of [call, ...(call.arguments ?? [])]) collector.exhaust(source, true);
        }
      }
    }
    return collector.result();
  }
  collector.add(call, OVERFLOW_TARGET);
  return collector.result();
}
