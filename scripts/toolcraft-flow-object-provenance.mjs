import { toolcraftOwnPropertyProof } from
  "./toolcraft-flow-property-descriptors.mjs";

const ADAPTERS = new Set(["apply", "bind", "call"]);
const FUNCTION_OWNERS = new Set([
  "CallableFunction", "Function", "NewableFunction",
]);
const OBJECT_INTRINSICS = new Set(["assign", "create", "defineProperty"]);
const OWN_PROPERTY_PROOF = Object.freeze({
  ABSENT: "absent", PRESENT: "present", UNKNOWN: "unknown",
});

export function createToolcraftFlowObjectProvenance({ checker, index, ts }) {
  function propertySymbol(reference) {
    if (reference?.propertySymbol) return reference.propertySymbol;
    const node = index.unwrap(reference?.node);
    if (ts.isPropertyAccessExpression(node)) {
      return checker.getSymbolAtLocation(node.name);
    }
    if (ts.isElementAccessExpression(node) && node.argumentExpression) {
      return checker.getSymbolAtLocation(node.argumentExpression);
    }
  }

  function globalOwner(reference, owners) {
    const declarations = propertySymbol(reference)?.declarations ?? [];
    return declarations.length > 0 && declarations.some((declaration) => {
      const owner = declaration.parent?.symbol;
      const name = owner?.getName?.();
      const global = name && checker.resolveName?.(
        name, reference.node, ts.SymbolFlags.Type, false,
      );
      return owners.has(name) && Boolean(global) &&
        (global === owner || global.declarations?.includes(declaration.parent));
    });
  }

  function ownPropertyProof(reference, state) {
    if (!reference?.member || reference.baseFact?.kind !== "exact") {
      return OWN_PROPERTY_PROOF.UNKNOWN;
    }
    const proofs = reference.baseFact.values.map((value) => {
      const object = state.objects.get(index.unwrap(value));
      if (!object) return OWN_PROPERTY_PROOF.ABSENT;
      return toolcraftOwnPropertyProof(
        object.propertyDescriptors.get(reference.member),
        object.propertyRemainder?.string,
      );
    });
    return proofs.length > 0 && proofs.every((proof) => proof === proofs[0])
      ? proofs[0] : OWN_PROPERTY_PROOF.UNKNOWN;
  }

  function canonicalAdapter(reference, state, candidates) {
    if (!ADAPTERS.has(reference?.member) || candidates.length === 0) return;
    const symbol = propertySymbol(reference);
    if (symbol && !globalOwner(reference, FUNCTION_OWNERS)) return;
    return Object.freeze({
      kind: reference.member,
      proof: ownPropertyProof(reference, state),
    });
  }

  function intrinsicKind(reference) {
    const rawSource = reference?.receiverSource ?? reference?.node;
    const source = rawSource && index.unwrap(rawSource);
    const sourceDeclarations = source && ts.isIdentifier(source)
      ? checker.getSymbolAtLocation(source)?.declarations ?? [] : [];
    if (reference?.member === "Symbol" && ts.isIdentifier(source) &&
      source.text === "globalThis" &&
      sourceDeclarations.every((declaration) =>
        declaration.getSourceFile().isDeclarationFile)) return "symbol";
    if (reference?.kind === "binding" && ts.isIdentifier(source) &&
      source.text === "Symbol" && !sourceDeclarations.some((declaration) =>
          !declaration.getSourceFile().isDeclarationFile)) return "symbol";
    if (reference?.member === "for" && globalOwner(
      reference, new Set(["SymbolConstructor"]),
    )) return "symbolFor";
    if (!OBJECT_INTRINSICS.has(reference?.member)) return;
    if (globalOwner(reference, new Set(["ObjectConstructor"]))) {
      return reference.member;
    }
    const expression = index.unwrap(reference?.receiverSource);
    if (!ts.isIdentifier(expression) || expression.text !== "Object") return;
    const symbol = checker.getSymbolAtLocation(expression);
    return symbol?.declarations?.some((declaration) =>
      !declaration.getSourceFile().isDeclarationFile) ? undefined
      : reference.member;
  }

  return Object.freeze({ canonicalAdapter, intrinsicKind,
    ownPropertyProof });
}
