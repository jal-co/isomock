import ts from "typescript";

import {
  getToolcraftModulePropertyName as propertyName,
  getToolcraftModulePropertyValue as propertyValue,
  getToolcraftModuleRecordProperties as recordProperties,
  getToolcraftModuleStaticValues as staticValues,
  isToolcraftModulePropertyAccessNamed as isPropertyAccessNamed,
  unwrapToolcraftModuleNode as unwrap,
} from "./toolcraft-module-ast-test-utils.mjs";
import { createToolcraftStaticStringResolver } from "./toolcraft-static-string.mjs";
import {
  compareCodeUnits,
  getToolcraftInventorySourceFile,
  isToolcraftInventoryModuleInternal,
  resolveToolcraftInventoryReference,
} from "./toolcraft-module-cutover-inventory-test-utils.mjs";
import { collectToolcraftModuleReferences } from "./toolcraft-module-reference-test-utils.mjs";
import { hasToolcraftAlternateStorageKeyFlow } from "./toolcraft-module-storage-key-test-utils.mjs";
import { hasToolcraftV1UpgradeFlow } from "./toolcraft-module-v1-upgrade-test-utils.mjs";

function containsStaticValue(property, value, resolveStaticString) {
  return staticValues(propertyValue(property), resolveStaticString).includes(value);
}

function hasKeys(properties, keys) {
  return keys.every((key) => properties.has(key));
}

function isProductScope(scope) {
  return ["cli", "product", "starter", "website"].includes(scope);
}

function isStarterVerificationEntry(entry) {
  return entry.repoPath.startsWith("starter/src/app/") ||
    entry.repoPath.startsWith("starter/e2e/") ||
    entry.repoPath.startsWith("src/app/") ||
    entry.repoPath.startsWith("e2e/");
}

function isControlDefinitionProperty(node, resolveStaticString) {
  const control = node.parent;
  const controlEntry = control?.parent;
  const controlRecord = controlEntry?.parent;
  const controlsProperty = controlRecord?.parent;
  return ts.isObjectLiteralExpression(control) &&
    ts.isPropertyAssignment(controlEntry) &&
    ts.isObjectLiteralExpression(controlRecord) &&
    ts.isPropertyAssignment(controlsProperty) &&
    propertyName(controlsProperty, resolveStaticString) === "controls";
}

function isControlContractProperty(node, resolveStaticString) {
  const properties = recordProperties(node.parent, resolveStaticString);
  return properties.has("target") && properties.has("type");
}

function isProductControlContractProperty(node, resolveStaticString) {
  return isControlDefinitionProperty(node, resolveStaticString) ||
    isControlContractProperty(node, resolveStaticString);
}

function isControlApplicabilityRecord(node, resolveStaticString) {
  const property = node.parent;
  return (
    ts.isPropertyAssignment(property) || ts.isPropertySignature(property)
  ) && propertyName(property, resolveStaticString) === "applicability" &&
    isProductControlContractProperty(property, resolveStaticString);
}


function hasCollapseReader(sourceFile, resolveStaticString) {
  let readsStorage = false;
  let parsesJson = false;
  let readsCollapsed = false;
  let writesCollapsedSections = false;
  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      readsStorage ||= isPropertyAccessNamed(node.expression, "getItem", resolveStaticString);
      parsesJson ||= isPropertyAccessNamed(node.expression, "parse", resolveStaticString);
    }
    readsCollapsed ||= isPropertyAccessNamed(node, "collapsed", resolveStaticString);
    if (
      (ts.isPropertyAssignment(node) || ts.isPropertySignature(node)) &&
      propertyName(node, resolveStaticString) === "collapsedSections"
    ) {
      writesCollapsedSections = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return readsStorage && parsesJson && readsCollapsed && writesCollapsedSections;
}

function isCanonicalDataUrlResourceCall(node, checker) {
  if (!ts.isCallExpression(node) || !ts.isIdentifier(node.expression)) return false;
  if (!checker) return false;
  let symbol = checker.getSymbolAtLocation(node.expression);
  if (!symbol) return false;
  if (symbol.flags & ts.SymbolFlags.Alias) {
    const declaration = symbol.declarations?.find(ts.isImportSpecifier);
    if ((declaration?.propertyName ?? declaration?.name)?.text ===
      "createToolcraftDataUrlResourceRef") return true;
    symbol = checker.getAliasedSymbol(symbol);
  }
  return symbol?.getName() === "createToolcraftDataUrlResourceRef";
}

function hasInlineMediaHydration(sourceFile, checker, resolveStaticString) {
  const markers = new Set();
  let arrayGuard = false;
  let canonicalCall = false;
  let readsDefaultAssets = false;
  const visit = (node) => {
    if (ts.isCallExpression(node)) {
      arrayGuard ||= isPropertyAccessNamed(node.expression, "isArray", resolveStaticString);
      canonicalCall ||= isCanonicalDataUrlResourceCall(node, checker);
    }
    for (const marker of ["dataUrl", "id", "mimeType"]) {
      if (isPropertyAccessNamed(node, marker, resolveStaticString)) markers.add(marker);
    }
    readsDefaultAssets ||= isPropertyAccessNamed(
      node,
      "defaultAssets",
      resolveStaticString,
    );
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return arrayGuard && canonicalCall && markers.size === 3 && !readsDefaultAssets;
}

function hasStaticPrefix(node, prefix, resolveStaticString) {
  const value = unwrap(node);
  const resolved = resolveStaticString(value);
  if (resolved?.startsWith(prefix)) return true;
  if (
    ts.isBinaryExpression(value) &&
    value.operatorToken.kind === ts.SyntaxKind.PlusToken
  ) return hasStaticPrefix(value.left, prefix, resolveStaticString);
  return ts.isTemplateExpression(value) && value.head.text.startsWith(prefix);
}

function isIndexedDbUpgradeOwner(sourceFile, resolveStaticString) {
  let opensDatabase = false;
  let ownsUpgradeHandler = false;
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      isPropertyAccessNamed(node.expression, "open", resolveStaticString)
    ) opensDatabase = true;
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      isPropertyAccessNamed(node.left, "onupgradeneeded", resolveStaticString)
    ) ownsUpgradeHandler = true;
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return opensDatabase && ownsUpgradeHandler;
}

function hasMissingKindMediaUnion(node, checker) {
  if (!checker || !ts.isTypeAliasDeclaration(node)) return false;
  const type = checker.getTypeAtLocation(node.name);
  if (!(type.flags & ts.TypeFlags.Union) || !type.types) return false;
  const members = type.types.map((member) =>
    new Set(checker.getPropertiesOfType(member).map(({ name }) => name)),
  );
  const mediaMarkers = ["fileName", "id", "mimeType"];
  return members.some((properties) =>
    mediaMarkers.every((marker) => properties.has(marker)) &&
    ["dataUrl", "resourceRef", "sourceBundleRef"].some((marker) =>
      properties.has(marker),
    ) &&
    !properties.has("assetKind"),
  ) && members.some((properties) => properties.has("assetKind"));
}

function recordDiagnostic(
  node,
  entry,
  sourceFile,
  checker,
  resolveStaticString,
  report,
) {
  const properties = recordProperties(node, resolveStaticString);
  if (properties.size === 0) return;
  if (
    hasKeys(properties, [
      "configuredMaximumValue", "developmentValue", "effectiveMaximumValue",
      "id", "limit", "maximumValue", "targetPressure", "unit",
    ])
  ) report("performance-maximum-value");
  if (
    hasKeys(properties, ["fromVersion", "kind", "payload"]) &&
    containsStaticValue(properties.get("kind"), "migrated", resolveStaticString)
  ) report("migrated-persistence-result");
  if (
    isProductScope(entry.scope) &&
    isControlApplicabilityRecord(node, resolveStaticString) &&
    properties.has("mode") && properties.has("origin") &&
    ["implicit", "legacy"].some((value) =>
      containsStaticValue(properties.get("origin"), value, resolveStaticString),
    )
  ) report("legacy-control-applicability");
  if (
    hasKeys(properties, ["asset", "type"]) &&
    containsStaticValue(properties.get("type"), "media.import", resolveStaticString)
  ) report("single-media-import");
  if (
    hasKeys(properties, ["aggregateDigest", "descriptorVersion", "packageSource", "sourceFiles"]) &&
    containsStaticValue(properties.get("descriptorVersion"), "1", resolveStaticString) &&
    hasToolcraftV1UpgradeFlow({
      checker,
      discriminator: "descriptorVersion",
      resolveStaticString,
      sourceFile,
    })
  ) report("model-bundle-v1-upgrade");
  if (
    hasKeys(properties, ["appId", "canvas", "exportedAt", "source", "timeline", "values", "version"]) &&
    containsStaticValue(properties.get("source"), "toolcraft-settings", resolveStaticString) &&
    containsStaticValue(properties.get("version"), "1", resolveStaticString) &&
    hasToolcraftV1UpgradeFlow({
      checker,
      discriminator: "version",
      resolveStaticString,
      sourceFile,
    })
  ) report("settings-v1-upgrade");
  if (
    hasKeys(properties, ["state", "version"]) &&
    containsStaticValue(properties.get("version"), "1", resolveStaticString) &&
    hasToolcraftV1UpgradeFlow({
      checker,
      discriminator: "version",
      resolveStaticString,
      sourceFile,
    })
  ) report("persistence-v1-upgrade");
  if (
    properties.has("onDisposeError") &&
    ["create", "dispose", "get"].some((key) => properties.has(key))
  ) report("source-asset-provider-on-dispose-error");
  void checker;
}

function inspectSyntax(entry, inventory, sourceFile, resolveStaticString, report) {
  const checker = inventory.context.checker;
  const indexedDbUpgradeOwner = isIndexedDbUpgradeOwner(
    sourceFile,
    resolveStaticString,
  );
  const visit = (node) => {
    if (
      ts.isInterfaceDeclaration(node) || ts.isTypeLiteralNode(node) ||
      ts.isObjectLiteralExpression(node)
    ) recordDiagnostic(
      node,
      entry,
      sourceFile,
      checker,
      resolveStaticString,
      report,
    );
    if (hasMissingKindMediaUnion(node, checker)) report("missing-kind-media-union");
    if (
      (ts.isInterfaceDeclaration(node) || ts.isTypeLiteralNode(node) ||
        ts.isObjectLiteralExpression(node)) &&
      hasKeys(recordProperties(node, resolveStaticString), ["controls", "id"]) &&
      hasStaticPrefix(
        propertyValue(recordProperties(node, resolveStaticString).get("id")),
        "legacy.",
        resolveStaticString,
      )
    ) report("legacy-section-id");
    if (
      isProductScope(entry.scope) &&
      (ts.isPropertyAssignment(node) || ts.isPropertySignature(node)) &&
      propertyName(node, resolveStaticString) === "applicability" &&
      node.questionToken &&
      isProductControlContractProperty(node, resolveStaticString)
    ) report("legacy-control-applicability");
    if (
      isProductScope(entry.scope) &&
      (ts.isPropertyAssignment(node) || ts.isPropertySignature(node)) &&
      propertyName(node, resolveStaticString) === "visibleWhen" &&
      (isControlDefinitionProperty(node, resolveStaticString) ||
        isControlContractProperty(node, resolveStaticString))
    ) report("control-visible-when");
    if (ts.isBinaryExpression(node)) {
      const left = staticValues(node.left, resolveStaticString);
      const right = staticValues(node.right, resolveStaticString);
      const comparesOldVersion =
        isPropertyAccessNamed(node.left, "oldVersion", resolveStaticString) ||
        isPropertyAccessNamed(node.right, "oldVersion", resolveStaticString);
      if (
        indexedDbUpgradeOwner && comparesOldVersion &&
        [...left, ...right].includes("1")
      ) {
        report("indexeddb-v1-upgrade");
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  if (hasToolcraftAlternateStorageKeyFlow(sourceFile, resolveStaticString)) {
    report("old-storage-key-reader");
  }
  if (hasCollapseReader(sourceFile, resolveStaticString)) {
    report("old-section-collapse-reader");
  }
  if (hasInlineMediaHydration(sourceFile, checker, resolveStaticString)) {
    report("persisted-inline-media-upgrade");
  }
}

export function collectToolcraftCutoverAbsenceDiagnostics(inventory) {
  const diagnostics = [];
  for (const entry of inventory.entries) {
    const compilerSource = inventory.context.program.getSourceFile(
      entry.absolutePath,
    );
    const sourceFile = compilerSource ??
      getToolcraftInventorySourceFile(inventory, entry);
    const semanticChecker = compilerSource
      ? inventory.context.checker
      : undefined;
    const resolveStaticString = semanticChecker
      ? createToolcraftStaticStringResolver(sourceFile, semanticChecker)
      : createToolcraftStaticStringResolver(sourceFile);
    const seen = new Set();
    const report = (code) => {
      if (seen.has(code)) return;
      seen.add(code);
      diagnostics.push({ code, repoPath: entry.repoPath });
    };
    const semanticInventory = semanticChecker
      ? inventory
      : { ...inventory, context: { ...inventory.context, checker: undefined } };
    inspectSyntax(
      entry,
      semanticInventory,
      sourceFile,
      resolveStaticString,
      report,
    );
    for (const referenceNode of collectToolcraftModuleReferences(
      sourceFile,
      resolveStaticString,
    )) {
      const { node, safeFileUrl, specifier } = referenceNode;
      if (!specifier) {
        if (
          isProductScope(entry.scope) &&
          !safeFileUrl
        ) report("non-static-module-reference");
        continue;
      }
      const reference = resolveToolcraftInventoryReference(
        inventory,
        entry,
        specifier,
      );
      if (
        isProductScope(entry.scope) &&
        isToolcraftInventoryModuleInternal(inventory, reference)
      ) report("deep-module-import");
      if (
        isProductScope(entry.scope) &&
        !entry.repoPath.includes("/acceptance/capability-proofs/") &&
        reference.resolvedEntry?.repoPath.endsWith(
          "/acceptance/capability-proofs/catalog.ts",
        )
      ) report("proof-catalog-import");
      if (
        entry.scope === "runtime" &&
        reference.resolvedEntry &&
        isStarterVerificationEntry(reference.resolvedEntry)
      ) report("runtime-starter-verification-import");
    }
  }
  return diagnostics.sort((left, right) =>
    compareCodeUnits(left.repoPath, right.repoPath) ||
    compareCodeUnits(left.code, right.code),
  );
}
