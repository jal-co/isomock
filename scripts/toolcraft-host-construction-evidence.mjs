import {
  isToolcraftHostDeclarationName as isDeclarationName,
  isToolcraftTypeOnlyReference,
  toolcraftHostBindingMember as bindingMember,
  toolcraftHostBindingPath as bindingPath,
  toolcraftHostCallArgument as callArgument,
  toolcraftHostImportedOperation as importedOperation,
  toolcraftHostImportOrigin as importOrigin,
  toolcraftHostStaticMemberName as staticMemberName,
  unwrapToolcraftHostExpression as unwrap,
} from "./toolcraft-host-origin-values.mjs";
import { createToolcraftHostComponentOrigin } from
  "./toolcraft-host-component-origin.mjs";
import {
  createToolcraftHostDomAuthority,
  toolcraftDomInteractiveTags as DOM_INTERACTIVE_TAGS,
} from "./toolcraft-host-dom-authority.mjs";
import { isToolcraftDomHostFactoryName } from "./toolcraft-dom-host-capabilities.mjs";
import { createToolcraftStaticFlowValues } from
  "./toolcraft-static-flow-values.mjs";

const REACT_FACTORIES = new Map([
  ["react", new Set(["cloneElement", "createElement", "createFactory"])],
  ["react/jsx-dev-runtime", new Set(["jsxDEV"])],
  ["react/jsx-runtime", new Set(["jsx", "jsxs"])],
]);
const INVOCATION_MEMBERS = new Set(["apply", "bind", "call"]);
const SAFE_REACT_NAMESPACE_MEMBERS = new Set([
  "createContext",
  "forwardRef",
  "lazy",
  "memo",
]);

export function isToolcraftBaseUiModule(specifier) {
  return specifier === "@base-ui/react" || specifier.startsWith("@base-ui/react/");
}

export function isToolcraftReactHostFactoryModule(specifier) {
  return REACT_FACTORIES.has(specifier);
}

export function createToolcraftHostConstructionEvidence({
  checker,
  failClosedUnresolvedDomAuthority = false,
  resolveStaticString,
  ts,
}) {
  const flowValues = createToolcraftStaticFlowValues({
    checker,
    resolveStaticString,
    ts,
  });
  const {
    bindingOwnerMatches,
    isDocumentOwner,
    isDomOwner,
    isUnresolvedOwner,
  } = createToolcraftHostDomAuthority({
    checker,
    failClosedUnresolvedDomAuthority,
    resolveStaticString,
    ts,
  });
  const { originOf, originOfSymbol } = createToolcraftHostComponentOrigin({
    checker,
    flowValues,
    isBaseUiModule: isToolcraftBaseUiModule,
    isReactHostFactoryModule: isToolcraftReactHostFactoryModule,
    resolveStaticString,
    ts,
  });

  function jsxConstruction(tagName) {
    if (ts.isIdentifier(tagName) && /^[a-z]/u.test(tagName.text)) {
      return { kind: "intrinsic", node: tagName, tag: tagName.text.toLowerCase() };
    }
    const origins = originOf(tagName);
    if (origins.some((origin) => origin.kind === "unknown" && origin.overflow)) {
      return { kind: "unknown-host", node: tagName };
    }
    const base = origins.find((origin) => origin.kind === "import" &&
      isToolcraftBaseUiModule(origin.specifier) && importedOperation(origin));
    if (base) return { kind: "base-ui", node: tagName,
      operation: importedOperation(base), sourceFiles: base.sourceFiles,
      specifier: base.specifier };
    const tags = [...new Set(origins
      .filter(({ kind }) => kind === "intrinsic").map(({ tag }) => tag))];
    return tags.length > 0
      ? { kind: "intrinsic-alias", node: tagName, tag: tags[0], tags }
      : { kind: "component", node: tagName };
  }

  function callConstruction(call) {
    let callee = unwrap(call.expression, ts);
    let invocation;
    if ((ts.isPropertyAccessExpression(callee) || ts.isElementAccessExpression(callee)) &&
      INVOCATION_MEMBERS.has(staticMemberName(callee, resolveStaticString, ts))) {
      invocation = staticMemberName(callee, resolveStaticString, ts);
      callee = unwrap(callee.expression, ts);
    }
    for (const origin of originOf(callee)) {
      if (origin.kind !== "import") continue;
      const operation = importedOperation(origin);
      if (REACT_FACTORIES.get(origin.specifier)?.has(operation)) {
        return { factory: operation, invocation, kind: "react", node: call.expression,
          tag: callArgument(call, invocation, 0, ts) };
      }
      if (isToolcraftBaseUiModule(origin.specifier) &&
        operation && !origin.specifier.endsWith("/merge-props")) {
        return { invocation, kind: "base-ui", node: call.expression,
          operation, sourceFiles: origin.sourceFiles, specifier: origin.specifier };
      }
    }
    if (ts.isPropertyAccessExpression(callee) || ts.isElementAccessExpression(callee)) {
      const factory = staticMemberName(callee, resolveStaticString, ts);
      const reviewedOwner = factory === "cloneNode"
        ? isDomOwner(callee.expression) || isUnresolvedOwner(callee.expression)
        : isDocumentOwner(callee.expression) ||
          isUnresolvedOwner(callee.expression);
      if (isToolcraftDomHostFactoryName(factory) && reviewedOwner) {
        const index = factory === "createElementNS" ? 1 : 0;
        const tagNode = callArgument(call, invocation, index, ts);
        const tag = tagNode && resolveStaticString(tagNode)?.toLowerCase();
        return { dynamic: !tagNode || tag === undefined,
          interactive: tag === undefined || DOM_INTERACTIVE_TAGS.has(tag),
          kind: "dom", node: call.expression, tag };
      }
    }
    return undefined;
  }

  function authorityReference(node) {
    const imported = importOrigin(node, ts);
    if (imported) {
      const operation = importedOperation(imported);
      if (REACT_FACTORIES.get(imported.specifier)?.has(operation)) {
        return { factory: operation, kind: "react", node };
      }
    }
    if (ts.isBindingElement(node)) {
      const members = bindingPath(node, resolveStaticString, ts);
      const member = members?.at(-1);
      const factory = node.dotDotDotToken ? "dynamic" : member;
      if ((node.dotDotDotToken || !member || isToolcraftDomHostFactoryName(member)) &&
        bindingOwnerMatches(node, member)) {
        return { factory: factory ?? "dynamic", kind: "dom", node };
      }
    }
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      const member = staticMemberName(node, resolveStaticString, ts);
      const reviewedOwner = member === "cloneNode"
        ? isDomOwner(node.expression) || isUnresolvedOwner(node.expression)
        : isDocumentOwner(node.expression) || isUnresolvedOwner(node.expression);
      if (isToolcraftDomHostFactoryName(member) && reviewedOwner) {
        return { factory: member, kind: "dom", node };
      }
      const origins = originOf(node);
      const react = origins.find((origin) => origin.kind === "import" &&
        REACT_FACTORIES.get(origin.specifier)?.has(importedOperation(origin)));
      if (react) {
        const nested = (ts.isPropertyAccessExpression(node.parent) ||
          ts.isElementAccessExpression(node.parent)) && node.parent.expression === node;
        return nested ? undefined : { factory: importedOperation(react),
          kind: "react", node };
      }
      const ownerOrigins = originOf(node.expression);
      const reactNamespace = ownerOrigins.some((origin) => origin.kind === "import" &&
        REACT_FACTORIES.has(origin.specifier));
      if (reactNamespace && member === undefined) {
        return { factory: "dynamic", kind: "react", node };
      }
    }
    if (ts.isIdentifier(node) && !isDeclarationName(node, ts) &&
      !isToolcraftTypeOnlyReference(node, ts)) {
      if (node.text === "require" || node.text === "module") {
        const declarations = checker.getSymbolAtLocation(node)?.declarations ?? [];
        const directRequireCall = node.text === "require" &&
          ts.isCallExpression(node.parent) && node.parent.expression === node;
        const directModuleRequireCall = node.text === "module" &&
          (ts.isPropertyAccessExpression(node.parent) ||
            ts.isElementAccessExpression(node.parent)) &&
          node.parent.expression === node &&
          staticMemberName(node.parent, resolveStaticString, ts) === "require" &&
          ts.isCallExpression(node.parent.parent) &&
          node.parent.parent.expression === node.parent;
        if (!directRequireCall && !directModuleRequireCall &&
          (declarations.length === 0 || declarations.every((declaration) =>
            declaration.getSourceFile().isDeclarationFile
          ))) return { kind: "commonjs", node };
      }
      const origins = originOf(node);
      const calledFactory = ts.isCallExpression(node.parent) &&
        node.parent.expression === node &&
        origins.find((origin) => origin.kind === "import" &&
          REACT_FACTORIES.get(origin.specifier)?.has(
            importedOperation(origin),
          ));
      if (calledFactory) {
        return {
          factory: importedOperation(calledFactory),
          kind: "react",
          node,
        };
      }
      const namespace = origins.find((origin) => origin.kind === "import" &&
        REACT_FACTORIES.has(origin.specifier) && origin.importedName === "*" &&
        origin.members.length === 0);
      if (namespace) {
        const parent = node.parent;
        const directMember = (ts.isPropertyAccessExpression(parent) ||
          ts.isElementAccessExpression(parent)) && parent.expression === node;
        const safeDestructure = ts.isVariableDeclaration(parent) &&
          parent.initializer === node && ts.isObjectBindingPattern(parent.name) &&
          parent.name.elements.length > 0 &&
          parent.name.elements.every((element) =>
            !element.dotDotDotToken &&
            SAFE_REACT_NAMESPACE_MEMBERS.has(
              bindingMember(element, resolveStaticString, ts),
            )
          );
        if (!directMember && !safeDestructure) {
          return { factory: "namespace", kind: "react", node };
        }
      }
      if (node.text === "document" && isDocumentOwner(node) &&
        ts.isVariableDeclaration(node.parent) && node.parent.initializer === node) {
        const binding = node.parent.name;
        if (ts.isIdentifier(binding)) {
          return { factory: "document", kind: "dom", node };
        }
      }
    }
    return undefined;
  }

  return Object.freeze({ authorityReference, callConstruction, flowValues,
    jsxConstruction, originOf, originOfSymbol });
}
