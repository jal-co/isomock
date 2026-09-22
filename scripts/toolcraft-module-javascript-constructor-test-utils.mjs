import path from "node:path";

import ts from "typescript";

import { unwrapToolcraftModuleNode as unwrapExpression } from "./toolcraft-module-ast-test-utils.mjs";
import {
  getToolcraftInventorySourceFile,
  resolveToolcraftInventoryReference,
} from "./toolcraft-module-cutover-inventory-test-utils.mjs";

function isRuntimePublicSpecifier(inventory, entry, specifier, exportName) {
  const reference = resolveToolcraftInventoryReference(inventory, entry, specifier);
  const publicEntry = exportName === "composeToolcraftApp"
    ? path.resolve(inventory.runtimeSourceRoot, "react/index.ts")
    : path.resolve(inventory.runtimeSourceRoot, "index.ts");
  if (
    reference.resolvedPath &&
    path.resolve(reference.resolvedPath) === publicEntry
  ) return true;
  return exportName === "composeToolcraftApp"
    ? /^(?:@repo\/toolcraft-runtime|[#@]\/toolcraft\/runtime)\/react$/u.test(specifier)
    : /^(?:@repo\/toolcraft-runtime|[#@]\/toolcraft\/runtime)$/u.test(specifier);
}

function resolveJavascriptConstructorExport(
  inventory,
  entry,
  specifier,
  exportName,
  seen = new Set(),
) {
  if (
    isRuntimePublicSpecifier(inventory, entry, specifier, exportName) &&
    ["composeToolcraftApp", "defineToolcraft"].includes(exportName)
  ) return exportName;
  const target = resolveToolcraftInventoryReference(
    inventory,
    entry,
    specifier,
  ).resolvedEntry;
  const key = target && `${target.absolutePath}\0${exportName}`;
  if (!target || seen.has(key)) return undefined;
  seen.add(key);
  const sourceFile = getToolcraftInventorySourceFile(inventory, target);
  for (const statement of sourceFile.statements) {
    if (
      !ts.isExportDeclaration(statement) ||
      !statement.moduleSpecifier ||
      !ts.isStringLiteralLike(statement.moduleSpecifier) ||
      !statement.exportClause ||
      !ts.isNamedExports(statement.exportClause)
    ) continue;
    const element = statement.exportClause.elements.find(({ name }) =>
      name.text === exportName,
    );
    if (!element) continue;
    const resolved = resolveJavascriptConstructorExport(
      inventory,
      target,
      statement.moduleSpecifier.text,
      element.propertyName?.text ?? element.name.text,
      seen,
    );
    if (resolved) return resolved;
  }
  return undefined;
}

function namespaceSpecifier(node, namespaces, resolveStaticString) {
  const value = unwrapExpression(node);
  if (ts.isIdentifier(value)) return namespaces.get(value.text);
  if (
    ts.isCallExpression(value) && value.arguments.length > 0 &&
    (value.expression.kind === ts.SyntaxKind.ImportKeyword ||
      (ts.isIdentifier(value.expression) && value.expression.text === "require"))
  ) return resolveStaticString(value.arguments[0]);
  return undefined;
}

function namespaceMember(node, namespaces, resolveStaticString) {
  if (ts.isPropertyAccessExpression(node)) {
    const specifier = namespaceSpecifier(
      node.expression,
      namespaces,
      resolveStaticString,
    );
    if (specifier) return [specifier, node.name.text];
  }
  if (ts.isElementAccessExpression(node)) {
    const specifier = namespaceSpecifier(
      node.expression,
      namespaces,
      resolveStaticString,
    );
    const member = resolveStaticString(node.argumentExpression);
    if (specifier && member) return [specifier, member];
  }
  return undefined;
}

function bindingPropertyName(element, resolveStaticString) {
  const name = element.propertyName ?? element.name;
  if (ts.isIdentifier(name) || ts.isStringLiteralLike(name)) return name.text;
  return ts.isComputedPropertyName(name)
    ? resolveStaticString(name.expression)
    : undefined;
}

export function getJavascriptConstructorName(
  inventory,
  entry,
  node,
  bindings,
  namespaces,
  resolveStaticString,
) {
  const value = unwrapExpression(node);
  if (ts.isIdentifier(value)) return bindings.get(value.text);
  const member = namespaceMember(value, namespaces, resolveStaticString);
  return member && resolveJavascriptConstructorExport(
    inventory,
    entry,
    member[0],
    member[1],
  );
}

export function collectJavascriptConstructorBindings(
  inventory,
  entry,
  sourceFile,
  initializers,
  resolveStaticString,
) {
  const bindings = new Map();
  const namespaces = new Map();
  const flows = [...initializers];
  const destructurings = [];
  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteralLike(statement.moduleSpecifier) ||
      !statement.importClause?.namedBindings
    ) continue;
    const imported = statement.importClause.namedBindings;
    if (ts.isNamespaceImport(imported)) {
      namespaces.set(imported.name.text, statement.moduleSpecifier.text);
      continue;
    }
    if (!ts.isNamedImports(imported)) continue;
    for (const element of imported.elements) {
      const constructorName = resolveJavascriptConstructorExport(
        inventory,
        entry,
        statement.moduleSpecifier.text,
        element.propertyName?.text ?? element.name.text,
      );
      if (constructorName) bindings.set(element.name.text, constructorName);
    }
  }
  const visit = (node) => {
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(node.left)
    ) flows.push([node.left.text, node.right]);
    if (
      ts.isVariableDeclaration(node) &&
      ts.isObjectBindingPattern(node.name) && node.initializer
    ) destructurings.push(node);
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [name, initializer] of flows) {
      const specifier = namespaceSpecifier(
        initializer,
        namespaces,
        resolveStaticString,
      );
      if (specifier && !namespaces.has(name)) {
        namespaces.set(name, specifier);
        changed = true;
      }
      if (bindings.has(name)) continue;
      const constructorName = getJavascriptConstructorName(
        inventory,
        entry,
        initializer,
        bindings,
        namespaces,
        resolveStaticString,
      );
      if (constructorName) {
        bindings.set(name, constructorName);
        changed = true;
      }
    }
    for (const declaration of destructurings) {
      const specifier = namespaceSpecifier(
        declaration.initializer,
        namespaces,
        resolveStaticString,
      );
      if (!specifier) continue;
      for (const element of declaration.name.elements) {
        if (element.dotDotDotToken || !ts.isIdentifier(element.name)) continue;
        const exportName = bindingPropertyName(element, resolveStaticString);
        const constructorName = exportName && resolveJavascriptConstructorExport(
          inventory,
          entry,
          specifier,
          exportName,
        );
        if (constructorName && !bindings.has(element.name.text)) {
          bindings.set(element.name.text, constructorName);
          changed = true;
        }
      }
    }
  }
  return { bindings, namespaces };
}

export function collectJavascriptExportedBindings(sourceFile) {
  const exported = new Set();
  for (const statement of sourceFile.statements) {
    if (
      ts.isVariableStatement(statement) &&
      ts.getCombinedModifierFlags(statement) & ts.ModifierFlags.Export
    ) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) exported.add(declaration.name.text);
      }
    }
    if (
      ts.isExportDeclaration(statement) && !statement.moduleSpecifier &&
      statement.exportClause && ts.isNamedExports(statement.exportClause)
    ) {
      for (const element of statement.exportClause.elements) {
        exported.add(element.propertyName?.text ?? element.name.text);
      }
    }
  }
  return exported;
}
