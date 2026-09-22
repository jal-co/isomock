import { createToolcraftDomBoundedTypeReader, MAX_DOM_PAIRS } from
  "./toolcraft-dom-bounded-type-reader.mjs";
import { isToolcraftDomTypeEvidence, toolcraftDomEvidenceToken } from "./toolcraft-dom-evidence-tokens.mjs";
import { createToolcraftDomSummaryWalker } from
  "./toolcraft-dom-summary-walker.mjs";

const MAX_TYPE_CHILD_DEPTH = 48;

export function createToolcraftDomTypeChildren({ checker, reader, ts }) {
  const cache = Object.freeze({ source: new Map(), target: new Map() });
  const boundedReader = reader ?? createToolcraftDomBoundedTypeReader({
    checker, ts,
  });
  const summary = createToolcraftDomSummaryWalker({
    checker, reader: boundedReader, ts,
  });

  function evidence(role) {
    return toolcraftDomEvidenceToken(
      role === "target" ? "exhaustedTarget" : "exhaustedSource",
    );
  }

  function variants(type, role = "source") {
    if (isToolcraftDomTypeEvidence(type)) return [type];
    const result = boundedReader.variantsOf(type, role);
    return result.kind === "exact" ? result.values : [result.evidence];
  }

  function symbolType(symbol, location) {
    const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0];
    return declaration && checker.getTypeOfSymbolAtLocation(
      symbol, location ?? declaration,
    );
  }

  function typeArguments(type, role = "source") {
    const result = boundedReader.typeArgumentsOf(type, role);
    return result.kind === "exact" ? result.values : [result.evidence];
  }

  function addCollection(entries, key, collection, role) {
    if (collection.kind === "exhausted") {
      entries.push({ key: `overflow:${key}`, targetType: evidence("target"),
        type: evidence(role) });
      return;
    }
    collection.values.forEach((type, index) => entries.push({
      key: `${key}:${index}`, type,
    }));
  }

  function signatureKey(kind, signature, single) {
    if (single) return `${kind}:single`;
    const parameters = boundedReader.parametersOf(signature);
    if (parameters.kind === "exhausted") return `${kind}:exhausted`;
    return `${kind}:${parameters.values.map((parameter) => {
      const declaration = parameter.valueDeclaration ?? parameter.declarations?.[0];
      const type = symbolType(parameter, declaration);
      return type ? checker.typeToString(type, declaration) : "unknown";
    }).join(",")}`;
  }

  function addSignatures(entries, type, role) {
    const signatures = boundedReader.signaturesOf(type, role);
    if (signatures.kind === "exhausted") {
      entries.push({ key: "overflow:signatures", targetType: evidence("target"),
        type: evidence(role) });
      return;
    }
    for (const { kind, signature } of signatures.values) {
      const key = `${kind}:overload`;
      entries.push({ key: `${key}:return`,
        type: checker.getReturnTypeOfSignature(signature) });
      const parameters = boundedReader.parametersOf(signature, role);
      if (parameters.kind === "exhausted") {
        entries.push({ key: `${key}:overflow:parameters`,
          targetType: evidence("target"), type: evidence(role) });
        continue;
      }
      parameters.values.forEach((parameter, index) => {
        const type = symbolType(parameter, parameter.valueDeclaration);
        if (type) entries.push({ key: `${key}:parameter:${index}`, type });
      });
    }
  }

  function childEntries(type, role = "source", depth = 0) {
    if (!type || depth >= MAX_TYPE_CHILD_DEPTH) return [{
      key: "overflow:depth", targetType: evidence("target"),
      type: evidence(role),
    }];
    if (isToolcraftDomTypeEvidence(type)) return [{ key: "evidence", type }];
    if (cache[role].has(type)) return cache[role].get(type);
    const entries = [];
    const constraint = (type.flags & ts.TypeFlags.TypeParameter) !== 0
      ? checker.getBaseConstraintOfType(type) : undefined;
    if (constraint) entries.push({ key: "constraint", type: constraint });
    addCollection(entries, "alias-argument",
      boundedReader.bounded(type.aliasTypeArguments ?? [], role), role);
    addCollection(entries, "reference-argument",
      boundedReader.typeArgumentsOf(type, role), role);
    addCollection(entries, "base", boundedReader.baseTypesOf(type, role), role);
    for (const kind of [ts.IndexKind.String, ts.IndexKind.Number]) {
      const indexed = checker.getIndexTypeOfType(type, kind);
      if (indexed) entries.push({ key: `index:${kind}`, type: indexed });
    }
    if ((type.flags & ts.TypeFlags.Object) !== 0) {
      const properties = boundedReader.propertiesOf(type, role);
      if (properties.kind === "exhausted") {
        entries.push({ key: "overflow:properties", targetType: evidence("target"),
          type: evidence(role) });
      } else for (const property of properties.values) {
        const declaration = property.valueDeclaration ?? property.declarations?.[0];
        const nested = declaration && symbolType(property, declaration);
        if (nested) entries.push({ key: `property:${property.getName()}`,
          type: nested });
      }
      addSignatures(entries, type, role);
    }
    const result = Object.freeze(entries);
    cache[role].set(type, result);
    return result;
  }

  function childrenOf(type) {
    return variants(type).flatMap((member) => childEntries(member)
      .flatMap(({ targetType, type: child }) => targetType && targetType !== child
        ? [child, targetType] : [child]));
  }

  function originChildrenOf(type) {
    return variants(type).flatMap((member) => childEntries(member)
      .filter(({ key }) => /^(?:alias-argument|base|constraint)(?::|$)/u.test(key))
      .map(({ type: child }) => child));
  }

  function hasDuplicateSignatures(type) {
    return variants(type).some((member) => {
      const signatures = boundedReader.signaturesOf(member);
      if (signatures.kind === "exhausted") return true;
      const keys = signatures.values.map(({ kind, signature }) =>
        signatureKey(kind, signature, false)
      );
      return new Set(keys).size !== keys.length;
    });
  }

  function summarizedPair(sources, targets) {
    const source = summary.summarize(sources.map(({ type }) => type), "source");
    const target = summary.summarize(targets.map(({ targetType, type }) =>
      targetType ?? type
    ), "target");
    return [source.type, target.type];
  }

  function correspondingPairs(
    sourceType, targetType, includeUnconstrainedParameters = true,
  ) {
    const sourcesByKey = Map.groupBy(
      childEntries(sourceType, "source"), ({ key }) => key,
    );
    const targetsByKey = Map.groupBy(
      childEntries(targetType, "target"), ({ key }) => key,
    );
    const pairs = [];
    for (const [key, sources] of sourcesByKey) {
      const targets = targetsByKey.get(key)?.filter(({ targetType, type }) =>
        includeUnconstrainedParameters ||
        !/^(?:call|construct):overload:parameter:/u.test(key) ||
        !((targetType ?? type).flags & (
          ts.TypeFlags.Any | ts.TypeFlags.Unknown
        ))
      );
      if (!targets) continue;
      if (targets.length === 0) continue;
      const product = boundedReader.pairProduct(sources, targets);
      if (product.kind === "exhausted") pairs.push(summarizedPair(sources, targets));
      else pairs.push(...product.values.map(([source, target]) => [
        source.type, target.targetType ?? target.type,
      ]));
      if (pairs.length > MAX_DOM_PAIRS) return [[
        evidence("source"), evidence("target"),
      ]];
    }
    return pairs;
  }

  return Object.freeze({
    childrenOf,
    correspondingPairs,
    hasDuplicateSignatures,
    originChildrenOf,
    symbolType,
    typeArguments,
    variants,
  });
}
