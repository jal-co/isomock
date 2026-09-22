import { toolcraftDomEvidenceToken } from
  "./toolcraft-dom-evidence-tokens.mjs";

export const MAX_DOM_COLLECTION = 128;
export const MAX_DOM_PAIRS = 128;
export const MAX_DOM_SUMMARY_COLLECTION = 256;

function exact(values) {
  return Object.freeze({ kind: "exact", values: Object.freeze([...values]) });
}

function exactValue(value) {
  return Object.freeze({ kind: "exact", value });
}

function exhausted(role) {
  return Object.freeze({
    evidence: toolcraftDomEvidenceToken(
      role === "target" ? "exhaustedTarget" : "exhaustedSource",
    ),
    kind: "exhausted",
    values: Object.freeze([]),
  });
}

export function createToolcraftDomBoundedTypeReader({
  checker,
  collectionLimit = MAX_DOM_COLLECTION,
  ts,
}) {
  function bounded(values, role = "source") {
    if (!values || values.length > collectionLimit) return exhausted(role);
    return exact(values);
  }

  function readBounded(knownSize, read, role = "source") {
    if (Number.isInteger(knownSize) && knownSize > collectionLimit) {
      return exhausted(role);
    }
    return bounded(read(), role);
  }

  function propertiesOf(type, role) {
    return readBounded(
      type?.symbol?.members?.size,
      () => checker.getPropertiesOfType(type),
      role,
    );
  }

  function propertyMatches(type, predicate, role = "source") {
    const properties = propertiesOf(type, role);
    return properties.kind === "exhausted"
      ? properties : exactValue(properties.values.some(predicate));
  }

  function summaryPropertiesOf(type, role) {
    const members = type?.symbol?.members;
    if (members && members.size <= MAX_DOM_SUMMARY_COLLECTION) {
      // Symbol members include internal signature/type-parameter symbols whose
      // value type is `any`. Read actual instantiated properties instead.
      const properties = checker.getPropertiesOfType(type);
      return properties.length <= MAX_DOM_SUMMARY_COLLECTION
        ? exact(properties) : exhausted(role);
    }
    if (members && members.size > MAX_DOM_SUMMARY_COLLECTION) {
      return exhausted(role);
    }
    const properties = checker.getPropertiesOfType(type);
    return properties.length <= MAX_DOM_SUMMARY_COLLECTION
      ? exact(properties) : exhausted(role);
  }

  function signaturesOf(type, role) {
    const knownCalls = type?.callSignatures?.length;
    const knownConstructs = type?.constructSignatures?.length;
    if (Number.isInteger(knownCalls) && knownCalls > collectionLimit ||
      Number.isInteger(knownConstructs) && knownConstructs > collectionLimit ||
      Number.isInteger(knownCalls) && Number.isInteger(knownConstructs) &&
        knownCalls + knownConstructs > collectionLimit) return exhausted(role);
    const calls = type.getCallSignatures?.() ?? [];
    const constructs = type.getConstructSignatures?.() ?? [];
    if (calls.length > collectionLimit || constructs.length > collectionLimit ||
      calls.length + constructs.length > collectionLimit) return exhausted(role);
    return exact([
      ...calls.map((signature) => Object.freeze({ kind: "call", signature })),
      ...constructs.map((signature) => Object.freeze({
        kind: "construct", signature,
      })),
    ]);
  }

  function signaturesOfKind(type, kind, role) {
    const known = kind === ts?.SignatureKind.Call
      ? type?.callSignatures?.length : type?.constructSignatures?.length;
    return readBounded(
      known, () => checker.getSignaturesOfType(type, kind), role,
    );
  }

  function callableShape(type, role = "source") {
    const signatures = signaturesOf(type, role);
    return signatures.kind === "exhausted"
      ? signatures : exactValue(signatures.values.length > 0);
  }

  function parametersOf(signature, role) {
    return readBounded(
      signature?.parameters?.length, () => signature.getParameters(), role,
    );
  }

  function variantsOf(type, role) {
    if (!type) return exact([]);
    return bounded(type.isUnionOrIntersection?.() ? type.types : [type], role);
  }

  function baseTypesOf(type, role) {
    return readBounded(
      type?.resolvedBaseTypes?.length,
      () => type.getBaseTypes?.() ?? [],
      role,
    );
  }

  function typeArgumentsOf(type, role) {
    if (!ts || (type.flags & ts.TypeFlags.Object) === 0 ||
      (type.objectFlags & ts.ObjectFlags.Reference) === 0) return exact([]);
    try {
      return readBounded(
        type?.typeArguments?.length,
        () => checker.getTypeArguments(type),
        role,
      );
    } catch {
      return exhausted(role);
    }
  }

  function pairProduct(left, right, role = "source") {
    if (left.length > collectionLimit || right.length > collectionLimit ||
      left.length * right.length > MAX_DOM_PAIRS) return exhausted(role);
    return exact(left.flatMap((source) => right.map((target) =>
      Object.freeze([source, target])
    )));
  }

  return Object.freeze({
    baseTypesOf,
    bounded,
    callableShape,
    pairProduct,
    parametersOf,
    propertyMatches,
    propertiesOf,
    summaryPropertiesOf,
    signaturesOf,
    signaturesOfKind,
    typeArgumentsOf,
    variantsOf,
  });
}
