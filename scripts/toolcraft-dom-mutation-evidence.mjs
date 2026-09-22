import {
  isToolcraftDomMarkupCapabilityName,
  isToolcraftDomMutationCapabilityName,
  isToolcraftDomSemanticCapabilityName,
} from "./toolcraft-dom-host-capabilities.mjs";
import { createToolcraftDomTypeEvidence } from
  "./toolcraft-dom-type-evidence.mjs";

const MUTATION_INTRINSICS = new Map([
  ["Object", new Set([
    "assign", "defineProperties", "defineProperty", "setPrototypeOf",
  ])],
  ["Reflect", new Set(["defineProperty", "set", "setPrototypeOf"])],
]);

function unwrap(node, ts) {
  let current = node;
  while (
    ts.isAsExpression(current) || ts.isNonNullExpression(current) ||
    ts.isParenthesizedExpression(current) || ts.isSatisfiesExpression(current) ||
    ts.isTypeAssertionExpression(current)
  ) current = current.expression;
  return current;
}

function staticMemberName(node, resolveStaticString, ts) {
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  return node.argumentExpression
    ? resolveStaticString(node.argumentExpression)
    : undefined;
}

function globalIdentifier(node, name, checker, ts) {
  if (!ts.isIdentifier(node) || node.text !== name) return false;
  const declarations = checker.getSymbolAtLocation(node)?.declarations ?? [];
  return declarations.length === 0 || declarations.every((declaration) =>
    declaration.getSourceFile().isDeclarationFile
  );
}

function violation(code, tag) {
  return {
    code,
    reason:
      "DOM markup and interaction semantics are owned by canonical Toolcraft primitives, not imperative host mutation.",
    tag,
  };
}

function isWorkerMessagingHost(type) {
  if (type?.isUnion?.()) return type.types.every(isWorkerMessagingHost);
  const symbol = type?.symbol;
  return ["Worker", "DedicatedWorkerGlobalScope", "SharedWorkerGlobalScope", "ServiceWorkerGlobalScope"]
    .includes(symbol?.getName?.()) && (symbol.declarations ?? []).length > 0 &&
    symbol.declarations.some(declaration => /\/lib\.(?:dom|webworker)\.d\.[cm]?ts$/u.test(
      declaration.getSourceFile().fileName.replaceAll("\\", "/"),
    )) && symbol.declarations.every(declaration => /\/lib\.(?:dom|webworker)\.d\.[cm]?ts$/u.test(
      declaration.getSourceFile().fileName.replaceAll("\\", "/"),
    ) || (declaration.members?.length === 0 && !declaration.heritageClauses?.length));
}

export function createToolcraftDomMutationEvidence({
  checker,
  declarationIsExempt = () => false,
  isDomConstruction = () => false,
  resolveStaticString,
  ts,
}) {
  const { typeHasLibDomOrigin } =
    createToolcraftDomTypeEvidence({ checker, ts });
  function expressionIsDom(expression, visited = new Set()) {
    const node = unwrap(expression, ts);
    if (isWorkerMessagingHost(checker.getTypeAtLocation(node))) {
      // Worker message/error handlers have no DOM interaction surface. Preserve
      // initializer provenance so a cast from a real element is still rejected.
      if (!ts.isIdentifier(node)) return false;
      const symbol = checker.getSymbolAtLocation(node);
      if (!symbol || visited.has(symbol)) return false;
      return (symbol.declarations ?? []).some(declaration =>
        ts.isVariableDeclaration(declaration) && declaration.initializer &&
        expressionIsDom(declaration.initializer, new Set(visited).add(symbol))
      );
    }
    if (typeHasLibDomOrigin(checker.getTypeAtLocation(node))) return true;
    if (ts.isCallExpression(node) && isDomConstruction(node)) return true;
    if (!ts.isIdentifier(node)) return false;
    const symbol = checker.getSymbolAtLocation(node);
    if (!symbol || visited.has(symbol)) return false;
    const nextVisited = new Set(visited).add(symbol);
    return (symbol.declarations ?? []).some((declaration) =>
      ts.isVariableDeclaration(declaration) && declaration.initializer &&
      expressionIsDom(declaration.initializer, nextVisited)
    );
  }

  function intrinsicMutation(node) {
    if (!ts.isCallExpression(node) || node.arguments.length === 0) {
      return undefined;
    }
    const callee = unwrap(node.expression, ts);
    if (
      !ts.isPropertyAccessExpression(callee) &&
      !ts.isElementAccessExpression(callee)
    ) return undefined;
    const owner = unwrap(callee.expression, ts);
    const namespace = [...MUTATION_INTRINSICS.keys()].find((name) =>
      globalIdentifier(owner, name, checker, ts)
    );
    const member = staticMemberName(callee, resolveStaticString, ts);
    return namespace && member &&
      MUTATION_INTRINSICS.get(namespace).has(member) &&
      expressionIsDom(node.arguments[0])
      ? violation("forbidden-ui-markup-authority", namespace + "." + member)
      : undefined;
  }

  function declarationParameterIndex(identifier, declaration) {
    if (!ts.isIdentifier(identifier)) return -1;
    const symbol = checker.getSymbolAtLocation(identifier);
    return declaration.parameters.findIndex((parameter) =>
      ts.isIdentifier(parameter.name) &&
      checker.getSymbolAtLocation(parameter.name) === symbol
    );
  }

  function instantiatedMemberName(access, call, declaration) {
    if (ts.isPropertyAccessExpression(access)) return access.name.text;
    if (!access.argumentExpression) return undefined;
    const direct = resolveStaticString(access.argumentExpression);
    if (direct !== undefined) return direct;
    const index = declarationParameterIndex(
      unwrap(access.argumentExpression, ts),
      declaration,
    );
    return index >= 0 && call.arguments[index]
      ? resolveStaticString(call.arguments[index])
      : undefined;
  }

  function callPerformsDomCapabilityAccess(node) {
    if (!ts.isCallExpression(node)) return false;
    const declaration = checker.getResolvedSignature(node)?.declaration;
    if (!declaration?.body || !declaration.parameters ||
      declarationIsExempt(declaration)) return false;
    const domParameters = new Set(
      declaration.parameters.flatMap((parameter, index) =>
        node.arguments[index] && expressionIsDom(node.arguments[index]) &&
          ts.isIdentifier(parameter.name)
          ? [checker.getSymbolAtLocation(parameter.name)]
          : []
      ).filter(Boolean),
    );
    if (domParameters.size === 0) return false;
    let found = false;
    function visit(current) {
      if (found) return;
      if (ts.isPropertyAccessExpression(current) ||
        ts.isElementAccessExpression(current)) {
        const receiver = unwrap(current.expression, ts);
        if (ts.isIdentifier(receiver) && domParameters.has(
          checker.getSymbolAtLocation(receiver)
        )) {
          const member = instantiatedMemberName(current, node, declaration);
          if (!member || isToolcraftDomMarkupCapabilityName(member) ||
            isToolcraftDomMutationCapabilityName(member) ||
            isToolcraftDomSemanticCapabilityName(member)) {
            found = true;
            return;
          }
        }
      }
      ts.forEachChild(current, visit);
    }
    visit(declaration.body);
    return found;
  }

  return function inspectToolcraftDomMutation(node) {
    const intrinsic = intrinsicMutation(node);
    if (intrinsic) return intrinsic;
    if (callPerformsDomCapabilityAccess(node)) {
      return violation("forbidden-ui-markup-authority", "generic-call");
    }
    if (
      !ts.isPropertyAccessExpression(node) &&
      !ts.isElementAccessExpression(node)
    ) return undefined;
    const member = staticMemberName(node, resolveStaticString, ts);
    if (!member || !expressionIsDom(node.expression)) return undefined;
    const normalized = member.toLowerCase();
    const receiver = unwrap(node.expression, ts);
    if (normalized === "role" &&
      ts.isPropertyAccessExpression(receiver) &&
      receiver.name.text === "dataset") return undefined;
    if (isToolcraftDomSemanticCapabilityName(normalized)) {
      return violation("forbidden-ui-semantic-dom-mutation", member);
    }
    if (isToolcraftDomMarkupCapabilityName(normalized)) {
      return violation("forbidden-ui-markup-escape", member);
    }
    return isToolcraftDomMutationCapabilityName(normalized)
      ? violation("forbidden-ui-markup-authority", member)
      : undefined;
  };
}
