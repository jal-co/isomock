import ts from "typescript";

const PLAYWRIGHT_MODULE = "@playwright/test";
const PLAYWRIGHT_EVIDENCE_AUTHORITY_MESSAGE =
  'Product-owned tests must import "test" from the protected ./toolcraft-product-test wrapper. Direct Playwright runtime authority is not available to product code.';

function importedName(specifier) {
  return specifier.propertyName?.text ?? specifier.name.text;
}

function isPlaywrightAuthorityModule(value) {
  return (
    value === PLAYWRIGHT_MODULE || value?.startsWith(`${PLAYWRIGHT_MODULE}/`)
  );
}

function isAllowedPlaywrightImport(specifier, importClause) {
  if (specifier.isTypeOnly || importClause.isTypeOnly) {
    return importedName(specifier) !== "TestInfo";
  }
  return importedName(specifier) === "expect";
}

export function inspectToolcraftPlaywrightEvidenceAuthority({
  getNodeLocation,
  repoPath,
  resolveStaticString,
  sourceFile,
}) {
  const violations = [];
  const createRequireNames = new Set();
  const moduleNamespaceNames = new Set();
  const loaderNames = new Set(["require"]);

  function report(node) {
    violations.push({
      ...getNodeLocation(sourceFile, node),
      kind: "direct-playwright-evidence-authority",
      message: PLAYWRIGHT_EVIDENCE_AUTHORITY_MESSAGE,
      repoPath,
    });
  }

  function visit(node) {
    if (ts.isImportDeclaration(node) && resolveStaticString(node.moduleSpecifier) === "node:module" &&
      node.importClause) {
      if (node.importClause.name) moduleNamespaceNames.add(node.importClause.name.text);
      const bindings = node.importClause.namedBindings;
      if (bindings && ts.isNamespaceImport(bindings)) moduleNamespaceNames.add(bindings.name.text);
      if (bindings && ts.isNamedImports(bindings)) for (const specifier of bindings.elements) {
        if (importedName(specifier) === "createRequire") createRequireNames.add(specifier.name.text);
      }
    }
    const isCreateRequireCall = (call) => ts.isIdentifier(call.expression)
      ? createRequireNames.has(call.expression.text)
      : ts.isPropertyAccessExpression(call.expression) && call.expression.name.text === "createRequire" &&
        ts.isIdentifier(call.expression.expression) && moduleNamespaceNames.has(call.expression.expression.text);
    const isModuleRequire = (expression) => ts.isPropertyAccessExpression(expression) && expression.name.text === "require" &&
      ts.isIdentifier(expression.expression) && expression.expression.text === "module";
    if (ts.isVariableDeclaration(node) && node.initializer) {
      if (ts.isObjectBindingPattern(node.name) && ts.isIdentifier(node.initializer) && moduleNamespaceNames.has(node.initializer.text)) {
        for (const element of node.name.elements) if (ts.isIdentifier(element.name) &&
          importedName(element) === "createRequire") createRequireNames.add(element.name.text);
      }
      if (ts.isIdentifier(node.name) && ((ts.isCallExpression(node.initializer) && isCreateRequireCall(node.initializer)) ||
        (ts.isIdentifier(node.initializer) && loaderNames.has(node.initializer.text)) || isModuleRequire(node.initializer))) loaderNames.add(node.name.text);
      if (ts.isIdentifier(node.name) && ((ts.isIdentifier(node.initializer) && createRequireNames.has(node.initializer.text)) ||
        (ts.isPropertyAccessExpression(node.initializer) && node.initializer.name.text === "createRequire" &&
          ts.isIdentifier(node.initializer.expression) && moduleNamespaceNames.has(node.initializer.expression.text)))) createRequireNames.add(node.name.text);
    }
    if (
      ts.isImportDeclaration(node) &&
      isPlaywrightAuthorityModule(resolveStaticString(node.moduleSpecifier)) &&
      node.importClause
    ) {
      if (node.importClause.name) report(node.importClause.name);
      const bindings = node.importClause.namedBindings;
      if (bindings && ts.isNamespaceImport(bindings)) {
        report(bindings);
      } else if (bindings && ts.isNamedImports(bindings)) {
        for (const specifier of bindings.elements) {
          if (!isAllowedPlaywrightImport(specifier, node.importClause)) {
            report(specifier);
          }
        }
      }
    }

    if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression &&
      isPlaywrightAuthorityModule(
        resolveStaticString(node.moduleReference.expression),
      )
    ) {
      report(node);
    }

    if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      isPlaywrightAuthorityModule(resolveStaticString(node.moduleSpecifier))
    ) {
      report(node);
    }

    if (ts.isCallExpression(node) && node.arguments.length > 0) {
      const callee = node.expression;
      const isDynamicImport = callee.kind === ts.SyntaxKind.ImportKeyword;
      const isRequire = ts.isIdentifier(callee) && loaderNames.has(callee.text);
      const isModuleRequireCall = isModuleRequire(callee);
      const isCreatedRequire = ts.isCallExpression(callee) && isCreateRequireCall(callee);
      if (
        (isDynamicImport || isRequire || isModuleRequireCall || isCreatedRequire) &&
        isPlaywrightAuthorityModule(resolveStaticString(node.arguments[0]))
      ) {
        report(node);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return violations;
}
