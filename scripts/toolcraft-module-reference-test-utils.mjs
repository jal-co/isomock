import ts from "typescript";

import { unwrapToolcraftModuleNode as unwrap } from "./toolcraft-module-ast-test-utils.mjs";

function localInitializers(sourceFile) {
  const initializers = new Map();
  const visit = (node) => {
    if (
      ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) &&
      node.initializer
    ) initializers.set(node.name.text, node.initializer);
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return initializers;
}

function resolveLocalExpression(node, initializers, seen = new Set()) {
  const value = unwrap(node);
  if (!ts.isIdentifier(value) || seen.has(value.text)) return value;
  seen.add(value.text);
  const initializer = initializers.get(value.text);
  return initializer
    ? resolveLocalExpression(initializer, initializers, seen)
    : value;
}

function isImportMetaUrl(node) {
  const value = unwrap(node);
  return ts.isPropertyAccessExpression(value) && value.name.text === "url" &&
    ts.isMetaProperty(value.expression) &&
    value.expression.keywordToken === ts.SyntaxKind.ImportKeyword;
}

function collectNodeUrlPathBindings(sourceFile) {
  const bindings = new Set();
  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteralLike(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== "node:url" ||
      !statement.importClause?.namedBindings ||
      !ts.isNamedImports(statement.importClause.namedBindings)
    ) continue;
    for (const element of statement.importClause.namedBindings.elements) {
      if ((element.propertyName?.text ?? element.name.text) === "pathToFileURL") {
        bindings.add(element.name.text);
      }
    }
  }
  return bindings;
}

function collectNodePathBindings(sourceFile) {
  const joins = new Set();
  const namespaces = new Set();
  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteralLike(statement.moduleSpecifier) ||
      statement.moduleSpecifier.text !== "node:path" || !statement.importClause
    ) continue;
    if (statement.importClause.name) namespaces.add(statement.importClause.name.text);
    const imported = statement.importClause.namedBindings;
    if (imported && ts.isNamespaceImport(imported)) {
      namespaces.add(imported.name.text);
    }
    if (imported && ts.isNamedImports(imported)) {
      for (const element of imported.elements) {
        if ((element.propertyName?.text ?? element.name.text) === "join") {
          joins.add(element.name.text);
        }
      }
    }
  }
  return { joins, namespaces };
}

function resolveExactRootedFile(node, pathBindings, resolveStaticString) {
  const value = unwrap(node);
  if (!ts.isCallExpression(value) || value.arguments.length < 2) return false;
  const isJoin =
    (ts.isIdentifier(value.expression) && pathBindings.joins.has(value.expression.text)) ||
    (ts.isPropertyAccessExpression(value.expression) &&
      value.expression.name.text === "join" &&
      ts.isIdentifier(value.expression.expression) &&
      pathBindings.namespaces.has(value.expression.expression.text));
  if (!isJoin || resolveStaticString(value.arguments[0]) !== undefined) return false;
  const suffixParts = value.arguments.slice(1).map((part) =>
    resolveStaticString(part),
  );
  if (suffixParts.some((part) => part === undefined)) return false;
  const suffix = suffixParts.join("/").replaceAll("\\", "/");
  return !suffix.startsWith("/") &&
    !suffix.split("/").includes("..") &&
    /\.[cm]?[jt]sx?$/u.test(suffix) &&
    !/(?:^|\/)modules(?:\/|$)/u.test(suffix);
}

function resolveHrefReference(
  node,
  initializers,
  pathBindings,
  pathToFileUrlBindings,
  resolveStaticString,
) {
  const value = unwrap(node);
  if (!ts.isPropertyAccessExpression(value) || value.name.text !== "href") {
    return undefined;
  }
  const owner = resolveLocalExpression(value.expression, initializers);
  if (
    ts.isNewExpression(owner) && ts.isIdentifier(owner.expression) &&
    owner.expression.text === "URL" && owner.arguments?.length === 2 &&
    isImportMetaUrl(owner.arguments[1])
  ) {
    return { specifier: resolveStaticString(owner.arguments[0]) };
  }
  if (
    ts.isCallExpression(owner) && ts.isIdentifier(owner.expression) &&
    pathToFileUrlBindings.has(owner.expression.text) && owner.arguments.length === 1
  ) {
    const specifier = resolveStaticString(owner.arguments[0]);
    if (specifier !== undefined) return { specifier };
    return {
      safeFileUrl: resolveExactRootedFile(
        owner.arguments[0],
        pathBindings,
        resolveStaticString,
      ),
    };
  }
  return {};
}

function resolveDynamicReference(
  node,
  initializers,
  pathBindings,
  pathToFileUrlBindings,
  resolveStaticString,
) {
  const specifier = resolveStaticString(node);
  if (specifier !== undefined) return { specifier };
  const href = resolveHrefReference(
    node,
    initializers,
    pathBindings,
    pathToFileUrlBindings,
    resolveStaticString,
  );
  if (href) return href;
  const value = unwrap(node);
  return ts.isTemplateExpression(value) && value.head.text.startsWith("@/content/")
    ? { safeFileUrl: true }
    : {};
}

export function collectToolcraftModuleReferences(
  sourceFile,
  resolveStaticString,
) {
  const references = [];
  const initializers = localInitializers(sourceFile);
  const pathBindings = collectNodePathBindings(sourceFile);
  const pathToFileUrlBindings = collectNodeUrlPathBindings(sourceFile);
  const visit = (node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)
    ) references.push({ node: node.moduleSpecifier, specifier: node.moduleSpecifier.text });
    else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression &&
      ts.isStringLiteralLike(node.moduleReference.expression)
    ) references.push({
      node: node.moduleReference.expression,
      specifier: node.moduleReference.expression.text,
    });
    else if (
      ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteralLike(node.argument.literal)
    ) references.push({ node: node.argument, specifier: node.argument.literal.text });
    else if (
      ts.isCallExpression(node) && node.arguments.length > 0 &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require"))
    ) references.push({
      node: node.arguments[0],
      ...resolveDynamicReference(
        node.arguments[0],
        initializers,
        pathBindings,
        pathToFileUrlBindings,
        resolveStaticString,
      ),
    });
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return references;
}
