import { isToolcraftDangerousDomCapabilityName } from
  "./toolcraft-dom-host-capabilities.mjs";
import { createToolcraftTypeGraphEvidence } from
  "./toolcraft-type-graph-evidence.mjs";
import { createToolcraftDomTypeChildren } from
  "./toolcraft-dom-type-children.mjs";
import { createToolcraftDomSummaryWalker } from
  "./toolcraft-dom-summary-walker.mjs";
import { createToolcraftDomBoundedTypeReader } from
  "./toolcraft-dom-bounded-type-reader.mjs";
import { toolcraftDeclarationIsExternal } from
  "./toolcraft-typescript-declaration-origin.mjs";
import {
  isToolcraftDomTypeEvidence,
  toolcraftDomEvidenceRisk,
} from "./toolcraft-dom-type-evidence.mjs";

const MAX_GRAPH_DEPTH = 48;
const MAX_PAIR_VISITS = 256;
const MAX_TYPE_VARIANTS = 16;

const DANGEROUS = "dangerous";
const SAFE = "safe";
const UNKNOWN = "unknown";

export function createToolcraftDomStructuralTypeErasure({
  checker,
  reader,
  ts,
  typeEvidence,
  typeHasLibDomOrigin,
}) {
  const boundedReader = reader ?? createToolcraftDomBoundedTypeReader({
    checker, ts,
  });
  const childPolicy = createToolcraftDomTypeChildren({
    checker, reader: boundedReader, ts,
  });
  const summary = createToolcraftDomSummaryWalker({
    checker, reader: boundedReader, ts,
  });
  const variants = (type) => childPolicy.variants(type).filter((member) =>
    (member.flags & (
      ts.TypeFlags.Never | ts.TypeFlags.Null | ts.TypeFlags.Undefined
    )) === 0
  );

  function preservesDom(type, visited = new Set()) {
    if (!type || visited.has(type)) return false;
    const nextVisited = new Set(visited).add(type);
    if (typeHasLibDomOrigin(type)) return true;
    return (type.flags & ts.TypeFlags.TypeParameter) !== 0 &&
      preservesDom(checker.getBaseConstraintOfType(type), nextVisited);
  }

  const targetDangerEvidence = createToolcraftTypeGraphEvidence({
    childrenOf: childPolicy.childrenOf,
    classify: (type) => {
      const evidence = toolcraftDomEvidenceRisk(type);
      if (evidence) return evidence;
      if ((type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) !== 0) {
        return UNKNOWN;
      }
      if (preservesDom(type)) return SAFE;
      return variants(type).some((member) => {
        const matches = boundedReader.propertyMatches(member, (property) =>
          isToolcraftDangerousDomCapabilityName(property.getName()), "target");
        return matches.kind === "exhausted" || matches.value;
      }) ? DANGEROUS : undefined;
    },
    dangerous: DANGEROUS,
    maxDepth: MAX_GRAPH_DEPTH,
    safe: SAFE,
    unknown: UNKNOWN,
  });

  function targetContainsDangerous(type) {
    return targetDangerEvidence(type) !== SAFE;
  }

  function sourceDangerEvidence(type) {
    const evidence = typeEvidence(type);
    return evidence === "dom" ? DANGEROUS : evidence === "plain" ? SAFE
      : summary.summarize([type], "source").risk;
  }

  function equivalentTypes(sourceType, targetType) {
    return sourceType === targetType ||
      checker.isTypeAssignableTo(sourceType, targetType) &&
      checker.isTypeAssignableTo(targetType, sourceType);
  }

  function namedExternalWrapper(type) {
    const alias = type?.aliasSymbol;
    if (alias && !alias.getName().startsWith("__") &&
      (alias.declarations ?? []).some(toolcraftDeclarationIsExternal)) {
      return true;
    }
    const members = variants(type);
    return members.length > 0 && members.every((member) => {
      const symbol = member.aliasSymbol ?? member.symbol;
      return symbol && !symbol.getName().startsWith("__") &&
        (symbol.declarations ?? []).some(toolcraftDeclarationIsExternal);
    });
  }

  function externalWrapperSymbols(type) {
    return new Set([type?.aliasSymbol, ...variants(type).map((member) =>
      member.aliasSymbol ?? member.symbol
    )].filter((symbol) => symbol && !symbol.getName().startsWith("__") &&
      (symbol.declarations ?? []).some(toolcraftDeclarationIsExternal)));
  }

  function sharesExternalWrapper(sourceType, targetType) {
    const sources = externalWrapperSymbols(sourceType);
    return [...externalWrapperSymbols(targetType)].some((symbol) =>
      sources.has(symbol)
    );
  }

  function comparableVariants(sourceType, targetType) {
    const sourceShape = boundedReader.callableShape(sourceType, "source");
    const targetShape = boundedReader.callableShape(targetType, "target");
    if (sourceShape.kind === "exhausted" ||
      targetShape.kind === "exhausted") return false;
    const sourceCallable = sourceShape.value;
    const targetCallable = targetShape.value;
    if (sourceCallable !== targetCallable) return false;
    return Boolean(sourceType.flags & ts.TypeFlags.Object) ===
      Boolean(targetType.flags & ts.TypeFlags.Object);
  }

  function hasCallableShape(type) {
    const shape = boundedReader.callableShape(type);
    return shape.kind === "exhausted" || shape.value;
  }

  const symbolIds = new WeakMap();
  let nextSymbolId = 1;
  function symbolId(symbol) {
    if (!symbolIds.has(symbol)) symbolIds.set(symbol, nextSymbolId++);
    return symbolIds.get(symbol);
  }

  function recursivePairKey(sourceType, targetType) {
    const sourceSymbol = sourceType.aliasSymbol ?? sourceType.symbol;
    const targetSymbol = targetType.aliasSymbol ?? targetType.symbol;
    if (!sourceSymbol || !targetSymbol ||
      sourceSymbol.getName().startsWith("__") ||
      targetSymbol.getName().startsWith("__")) return undefined;
    return `${symbolId(sourceSymbol)}:${checker.typeToString(
      sourceType, undefined,
      ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseFullyQualifiedType,
    )}>${symbolId(targetSymbol)}:${checker.typeToString(
      targetType, undefined,
      ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseFullyQualifiedType,
    )}`;
  }

  function pairedTypeErasure(sourceType, targetType, depth = 0) {
    const memo = new Map();
    const state = { visits: 0 };
    const initialRemaining = Math.max(0, MAX_GRAPH_DEPTH - depth);
    function inspect(sourceType, targetType, remaining, visiting, structural) {
      if (!sourceType || !targetType) return false;
      if (isToolcraftDomTypeEvidence(sourceType) ||
        isToolcraftDomTypeEvidence(targetType)) {
        const sourceRisk = toolcraftDomEvidenceRisk(sourceType) ??
          sourceDangerEvidence(sourceType);
        const targetRisk = toolcraftDomEvidenceRisk(targetType) ??
          targetDangerEvidence(targetType);
        return sourceRisk !== SAFE && targetRisk !== SAFE;
      }
      const source = typeEvidence(sourceType);
      if ((targetType.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) !== 0) {
        return source === "dom";
      }
      if (equivalentTypes(sourceType, targetType) &&
        !childPolicy.hasDuplicateSignatures(sourceType) &&
        !childPolicy.hasDuplicateSignatures(targetType)) {
        return false;
      }
      const sourceMembers = variants(sourceType);
      const targetMembers = variants(targetType);
      if (sourceMembers.every((sourceMember) => targetMembers.some(
        (targetMember) => equivalentTypes(sourceMember, targetMember) &&
          !childPolicy.hasDuplicateSignatures(sourceMember) &&
          !childPolicy.hasDuplicateSignatures(targetMember),
      ))) return false;
      if (source === "dom" && namedExternalWrapper(targetType) &&
        typeEvidence(targetType) === "dom" &&
        checker.isTypeAssignableTo(sourceType, targetType)) {
        const sourceArguments = childPolicy.typeArguments(sourceType);
        const targetArguments = childPolicy.typeArguments(targetType);
        const preservesArguments = sharesExternalWrapper(
          sourceType, targetType,
        ) && sourceArguments.length === targetArguments.length &&
          !sourceArguments.some((argument, position) => inspect(
            argument, targetArguments[position], remaining - 1, visiting,
          ));
        if (targetDangerEvidence(targetType) !== DANGEROUS ||
          preservesArguments) return false;
      }
      const callablePair = hasCallableShape(sourceType) &&
        hasCallableShape(targetType);
      if (
        (source === "plain" && !callablePair) ||
        variants(targetType).every((member) => preservesDom(member))
      ) {
        return false;
      }
      const target = targetDangerEvidence(targetType);
      if (target === SAFE) return false;
      if (variants(sourceType).some((member) => preservesDom(member))) return true;
      if (remaining <= 0 || state.visits >= MAX_PAIR_VISITS) {
        return source !== "plain";
      }
      const cached = memo.get(sourceType)?.get(targetType)?.get(remaining);
      if (cached !== undefined) return cached;
      const seen = visiting.get(sourceType) ?? new Set();
      if (seen.has(targetType)) return false;
      const pairKey = recursivePairKey(sourceType, targetType);
      if (pairKey && structural.has(pairKey)) return false;
      const nextVisiting = new Map([...visiting].map(([type, targets]) => [
        type, new Set(targets),
      ]));
      const nextStructural = pairKey
        ? new Set(structural).add(pairKey) : structural;
      const targets = nextVisiting.get(sourceType) ?? new Set();
      targets.add(targetType);
      nextVisiting.set(sourceType, targets);
      state.visits += 1;
      if (sourceMembers.length > MAX_TYPE_VARIANTS ||
        targetMembers.length > MAX_TYPE_VARIANTS) return source !== "plain";
      const alignUnionMembers = sourceMembers.length > 1 ||
        targetMembers.length > 1;
      const result = sourceMembers.some((sourceMember) => {
        const compatibleTargets = alignUnionMembers
          ? targetMembers.filter((targetMember) =>
            comparableVariants(sourceMember, targetMember)
          )
          : targetMembers;
        return compatibleTargets.some((targetMember) =>
          childPolicy.correspondingPairs(
            sourceMember,
            targetMember,
            depth === 0 && remaining === initialRemaining &&
              hasCallableShape(sourceMember) && hasCallableShape(targetMember),
          ).some(
            ([sourceNested, targetNested]) => inspect(
              sourceNested,
              targetNested,
              remaining - 1,
              nextVisiting,
              nextStructural,
            ),
          )
        );
      });
      const byTarget = memo.get(sourceType) ?? new Map();
      const byBudget = byTarget.get(targetType) ?? new Map();
      byBudget.set(remaining, result);
      byTarget.set(targetType, byBudget);
      memo.set(sourceType, byTarget);
      return result;
    }
    return inspect(sourceType, targetType, initialRemaining, new Map(), new Set());
  }

  return Object.freeze({
    pairedTypeErasure,
    preservesDom,
    sourceDangerEvidence,
    targetContainsDangerous,
    targetDangerEvidence,
    variants,
  });
}
