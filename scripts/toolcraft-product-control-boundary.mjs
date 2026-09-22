import ts from "typescript";

import { createToolcraftDomMutationEvidence } from
  "./toolcraft-dom-mutation-evidence.mjs";
import { createToolcraftDomCapabilityErasureEvidence } from
  "./toolcraft-dom-capability-erasure-evidence.mjs";
import {
  createToolcraftHostConstructionEvidence,
} from
  "./toolcraft-host-construction-evidence.mjs";
import { isToolcraftTypeOnlyReference } from
  "./toolcraft-host-origin-values.mjs";
import { getToolcraftPublicUiOwner } from "./toolcraft-public-ui-ownership.mjs";
import { isToolcraftNativeSemanticHostTag } from
  "./toolcraft-native-semantic-policy.mjs";
import { createToolcraftProductComponentExtensionEvidence } from
  "./toolcraft-product-component-extension-evidence.mjs";
import { createToolcraftProductNativeHostEvidence } from
  "./toolcraft-product-native-host-evidence.mjs";

const workspacePrivateControlModulePattern =
  /^@repo\/ui\/(?:src\/)?(?:components\/controls(?:\/|$)|controls\/)/u;

function normalizeSpecifier(value) {
  return value.replaceAll("\\", "/");
}

export function isToolcraftPrivateControlImplementationModule({
  moduleSpecifier,
  resolvedSpecifier,
}) {
  const normalizedSpecifier = normalizeSpecifier(moduleSpecifier);
  const normalizedResolvedSpecifier = resolvedSpecifier
    ? normalizeSpecifier(resolvedSpecifier)
    : "";

  return (
    workspacePrivateControlModulePattern.test(normalizedSpecifier) ||
    /^[#@]\/toolcraft\/ui\/(?:components\/)?controls\//u.test(
      normalizedSpecifier,
    ) ||
    /^[#@]\/toolcraft\/ui\/components\/controls(?:\/|$)/u.test(
      normalizedSpecifier,
    ) ||
    /\/src\/toolcraft\/ui\/components\/controls(?:\/|$)/u.test(
      normalizedResolvedSpecifier,
    ) ||
    /\/packages\/ui\/src\/components\/controls(?:\/|$)/u.test(
      normalizedResolvedSpecifier,
    )
  );
}

export function createToolcraftProductControlInspector({
  checker,
  getNodeLocation,
  repoPath,
  resolveCssModuleClass,
  resolveStaticString,
  sourceFile,
}) {
  const hostConstruction = createToolcraftHostConstructionEvidence({
    checker,
    failClosedUnresolvedDomAuthority: true,
    resolveStaticString,
    ts,
  });
  const inspectDomMutation = createToolcraftDomMutationEvidence({
    checker,
    isDomConstruction: (call) =>
      hostConstruction.callConstruction(call)?.kind === "dom",
    resolveStaticString,
    ts,
  });
  const inspectDomCapabilityErasure =
    createToolcraftDomCapabilityErasureEvidence({
      checker,
      flowValues: hostConstruction.flowValues,
      ts,
    });
  const inspectProductComponentExtension =
    createToolcraftProductComponentExtensionEvidence(
      {
        checker,
        hostConstruction,
        repoPath,
        resolveCssModuleClass,
        resolveStaticString,
        ts,
      });
  const {
    forbiddenSchemaType,
    getInputType,
    hostHasActionableSemantics,
  } = createToolcraftProductNativeHostEvidence({ resolveStaticString });

  function createViolation(node, message, kind = "native-control-recreation") {
    return {
      ...getNodeLocation(sourceFile, node),
      kind,
      message,
      repoPath,
    };
  }

  function canEraseDomCapability(node) {
    return ts.isVariableDeclaration(node) ||
      ts.isPropertyDeclaration(node) || ts.isParameter(node) ||
      ts.isBinaryExpression(node) || ts.isReturnStatement(node) ||
      ts.isArrowFunction(node) || ts.isCallExpression(node) ||
      ts.isNewExpression(node) || ts.isYieldExpression(node) ||
      ts.isForOfStatement(node) || ts.isJsxAttribute(node);
  }

  function canMutateDom(node) {
    return ts.isCallExpression(node) ||
      ts.isPropertyAccessExpression(node) ||
      ts.isElementAccessExpression(node);
  }

  function identifierMayReferenceNamespace(node, visited = new Set()) {
    const symbol = checker.getSymbolAtLocation(node);
    if (!symbol || visited.has(symbol)) return false;
    const nextVisited = new Set(visited).add(symbol);
    return (symbol.declarations ?? []).some((declaration) => {
      if (ts.isNamespaceImport(declaration)) return true;
      return ts.isVariableDeclaration(declaration) && declaration.initializer &&
        ts.isIdentifier(declaration.initializer) &&
        identifierMayReferenceNamespace(declaration.initializer, nextVisited);
    });
  }

  function canReferenceHostAuthority(node) {
    if (ts.isBindingElement(node) || ts.isImportClause(node) ||
      ts.isImportSpecifier(node) || ts.isNamespaceImport(node) ||
      ts.isExportSpecifier(node) || ts.isNamespaceExport?.(node) ||
      ts.isPropertyAccessExpression(node) ||
      ts.isElementAccessExpression(node)) return true;
    if (!ts.isIdentifier(node)) return false;
    if (["document", "module", "require"].includes(node.text)) return true;
    return ts.isCallExpression(node.parent) && node.parent.expression === node ||
      identifierMayReferenceNamespace(node);
  }

  function inspectNode(node) {
    if (canEraseDomCapability(node) &&
      !isToolcraftTypeOnlyReference(node, ts)) {
      const erasure = inspectDomCapabilityErasure(node);
      const source = ts.isVariableDeclaration(node)
        ? node.initializer
        : ts.isBinaryExpression(node) ? node.right : undefined;
      const sourceType = source && checker.getTypeAtLocation(source);
      const acquiredCapability = source &&
        hostConstruction.authorityReference(source)?.kind === "dom" &&
        (sourceType.getCallSignatures().length > 0 ||
          sourceType.getConstructSignatures().length > 0);
      if (erasure && !acquiredCapability) {
        return [createViolation(node, erasure.reason)];
      }
    }
    if (canMutateDom(node) && !isToolcraftTypeOnlyReference(node, ts)) {
      const mutation = inspectDomMutation(node);
      if (mutation) {
        return [createViolation(node, mutation.reason)];
      }
    }
    if (canReferenceHostAuthority(node) &&
      !isToolcraftTypeOnlyReference(node, ts)) {
      const authority = hostConstruction.authorityReference(node);
      if (authority?.kind === "react") {
        return [createViolation(
          node,
          `Product source must use public Toolcraft components and JSX instead of acquiring React ${authority.factory} host authority.`,
        )];
      }
      if (authority?.kind === "dom") {
        return [createViolation(
          node,
          "Product source must use public Toolcraft components instead of acquiring DOM host-factory authority.",
        )];
      }
      if (authority?.kind === "commonjs") {
        return [createViolation(
          node,
          "Product source must not alias CommonJS module-loading authority around the public UI boundary.",
        )];
      }
    }
    if (ts.isCallExpression(node)) {
      const construction = hostConstruction.callConstruction(node);
      if (construction?.kind === "base-ui") {
        return [createViolation(
          node.expression,
          "Product source must use the public Toolcraft UI root instead of constructing a host through Base UI.",
        )];
      }
    }
    if (!ts.isJsxOpeningElement(node) && !ts.isJsxSelfClosingElement(node)) {
      return [];
    }
    const extension = inspectProductComponentExtension(node);
    if (extension) return [createViolation(...extension)];

    const jsxConstruction = hostConstruction.jsxConstruction(node.tagName);
    if (jsxConstruction.kind === "base-ui") {
      return [createViolation(
        node.tagName,
        "Product source must import components from the public Toolcraft UI root instead of rendering Base UI directly.",
      )];
    }
    if (jsxConstruction.kind === "unknown-host") {
      return [createViolation(
        node.tagName,
        "Product host origin exceeded the bounded proof and must fail closed.",
      )];
    }
    const tagNames = jsxConstruction.kind === "intrinsic"
      ? [jsxConstruction.tag]
      : jsxConstruction.kind === "intrinsic-alias"
        ? jsxConstruction.tags ?? [jsxConstruction.tag]
        : [];
    const tagName = tagNames.find(isToolcraftNativeSemanticHostTag) ?? tagNames[0];
    if (tagNames.some(isToolcraftNativeSemanticHostTag) ||
      (tagName && hostHasActionableSemantics(node.attributes, { canvasGeometry: ["svg", "g", "circle", "rect", "path", "canvas"].includes(tagName) }))) {
      return [
        createViolation(
          node.tagName,
          `Product source must use the public Button or Anchor for actions instead of an interactive raw <${tagName}> host.`,
        ),
      ];
    }
    if (tagNames.includes("select")) {
      return [
        createViolation(
          node.tagName,
          "Product source must not recreate the built-in Select with a native <select>. Declare a select schema control.",
        ),
      ];
    }
    if (tagNames.includes("textarea")) {
      return [
        createViolation(
          node.tagName,
          "Product source must not recreate built-in text or code controls with a native <textarea>. Declare a text or code schema control.",
        ),
      ];
    }

    const forwardsInputType = hostConstruction.originOf(node.tagName)
      .some((origin) => getToolcraftPublicUiOwner(origin)?.forwardsInputType);
    if (!tagNames.includes("input") && !forwardsInputType) return [];

    const inputType = getInputType(node.attributes);
    if (inputType === null) {
      return [
        createViolation(
          node.tagName,
          "Product Input type must be statically resolvable so the Toolcraft boundary can verify that it does not recreate a built-in control.",
        ),
      ];
    }

    const builtInSchemaType = forbiddenSchemaType(inputType);
    if (!builtInSchemaType) return [];

    return [
      createViolation(
        node.tagName,
        `Product source must not recreate a built-in control with input type "${inputType}". Declare the built-in ${builtInSchemaType} schema control.`,
      ),
    ];
  }

  return { inspectNode };
}
