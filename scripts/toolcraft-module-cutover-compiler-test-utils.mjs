import path from "node:path";

import ts from "typescript";

import { getCanonicalToolcraftConstructorName } from "./toolcraft-product-constructor-boundary.mjs";
import { createToolcraftStaticStringResolver } from "./toolcraft-static-string.mjs";
import {
  compareCodeUnits,
  resolveToolcraftInventoryReference,
} from "./toolcraft-module-cutover-inventory-test-utils.mjs";

export {
  collectToolcraftClosedConstructorDiagnostics,
} from "./toolcraft-module-constructor-test-utils.mjs";

function unwrap(node) {
  let current = node;
  while (
    current &&
    (ts.isParenthesizedExpression(current) ||
      ts.isAsExpression(current) ||
      ts.isTypeAssertionExpression(current) ||
      ts.isSatisfiesExpression(current) ||
      ts.isNonNullExpression(current))
  ) current = current.expression;
  return current;
}

function propertyName(node, resolveStaticString) {
  if (!node.name) return undefined;
  if (ts.isIdentifier(node.name) || ts.isStringLiteralLike(node.name)) {
    return node.name.text;
  }
  return ts.isComputedPropertyName(node.name)
    ? resolveStaticString(node.name.expression)
    : undefined;
}

function propertyInitializer(property) {
  if (ts.isPropertyAssignment(property)) return property.initializer;
  if (ts.isShorthandPropertyAssignment(property)) return property.name;
  return undefined;
}

function catalogObject(node) {
  const value = unwrap(node);
  if (
    ts.isCallExpression(value) && value.arguments.length === 1 &&
    ts.isPropertyAccessExpression(value.expression) &&
    value.expression.name.text === "freeze"
  ) return catalogObject(value.arguments[0]);
  return ts.isObjectLiteralExpression(value) ? value : undefined;
}

function stringLiteralUnion(checker, declaration) {
  const type = checker.getTypeAtLocation(declaration.name);
  return type.types?.flatMap((member) =>
    member.isStringLiteral?.() ? [member.value] : [],
  ).sort(compareCodeUnits);
}

function resolveValueDeclarationFiles(node, checker) {
  const files = new Set();
  const seenSymbols = new Set();
  const visit = (value) => {
    const current = unwrap(value);
    if (!current) return;
    if (ts.isIdentifier(current)) {
      let symbol = checker.getSymbolAtLocation(current);
      while (symbol && symbol.flags & ts.SymbolFlags.Alias) {
        if (seenSymbols.has(symbol)) return;
        seenSymbols.add(symbol);
        symbol = checker.getAliasedSymbol(symbol);
      }
      for (const declaration of symbol?.declarations ?? []) {
        files.add(path.resolve(declaration.getSourceFile().fileName));
        if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
          visit(declaration.initializer);
        }
      }
      return;
    }
    if (ts.isCallExpression(current)) {
      for (const argument of current.arguments) visit(argument);
    }
  };
  visit(node);
  return files;
}

function collectModuleReferences(sourceFile, resolveStaticString) {
  const references = [];
  const visit = (node) => {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)
    ) references.push(node.moduleSpecifier.text);
    else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression &&
      ts.isStringLiteralLike(node.moduleReference.expression)
    ) references.push(node.moduleReference.expression.text);
    else if (
      ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteralLike(node.argument.literal)
    ) references.push(node.argument.literal.text);
    else if (
      ts.isCallExpression(node) && node.arguments.length &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require"))
    ) references.push(resolveStaticString(node.arguments[0]));
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return references;
}

function isCapabilityExpression(node, checker, capabilityType) {
  const value = unwrap(node);
  if (!value || ts.isStringLiteralLike(value) || ts.isNumericLiteral(value)) {
    return false;
  }
  const type = checker.getTypeAtLocation(value);
  return Boolean(
    !(type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) &&
    checker.isTypeAssignableTo(type, capabilityType),
  );
}

function containsCapabilityExpression(node, checker, capabilityType) {
  let found = false;
  const visit = (current) => {
    found ||= isCapabilityExpression(current, checker, capabilityType);
    if (!found) ts.forEachChild(current, visit);
  };
  visit(node);
  return found;
}

function hasCapabilityLiteralComparison(
  node,
  checker,
  capabilityType,
  capabilityIds,
) {
  let found = false;
  const visit = (current) => {
    if (ts.isBinaryExpression(current)) {
      const leftIsCapability = isCapabilityExpression(
        current.left,
        checker,
        capabilityType,
      );
      const rightIsCapability = isCapabilityExpression(
        current.right,
        checker,
        capabilityType,
      );
      found ||=
        (leftIsCapability && ts.isStringLiteralLike(unwrap(current.right)) &&
          capabilityIds.has(unwrap(current.right).text)) ||
        (rightIsCapability && ts.isStringLiteralLike(unwrap(current.left)) &&
          capabilityIds.has(unwrap(current.left).text));
    }
    if (!found) ts.forEachChild(current, visit);
  };
  visit(node);
  return found;
}

function resolveVariableInitializer(node, checker) {
  const value = unwrap(node);
  if (!ts.isIdentifier(value)) return value;
  let symbol = checker.getSymbolAtLocation(value);
  if (symbol?.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
  return symbol?.declarations?.find(
    (declaration) => ts.isVariableDeclaration(declaration) && declaration.initializer,
  )?.initializer;
}

function isConcreteCapabilityMap(node, checker, capabilityIds) {
  const value = unwrap(resolveVariableInitializer(node, checker));
  if (
    !value || !ts.isNewExpression(value) ||
    !ts.isIdentifier(value.expression) || value.expression.text !== "Map"
  ) return false;
  const entries = value.arguments?.[0] && unwrap(value.arguments[0]);
  return Boolean(
    entries && ts.isArrayLiteralExpression(entries) &&
    entries.elements.some((element) => {
      const tuple = unwrap(element);
      const key = tuple && ts.isArrayLiteralExpression(tuple)
        ? unwrap(tuple.elements[0])
        : undefined;
      return Boolean(
        key && ts.isStringLiteralLike(key) && capabilityIds.has(key.text),
      );
    }),
  );
}

function hasFeatureSwitchboard(
  sourceFile,
  checker,
  capabilityType,
  capabilityIds,
  allowGenericLookup,
) {
  let found = false;
  const visit = (node) => {
    if (
      ts.isSwitchStatement(node) &&
      isCapabilityExpression(node.expression, checker, capabilityType)
    ) found = true;
    if (
      ts.isIfStatement(node) &&
      (allowGenericLookup
        ? containsCapabilityExpression(node.expression, checker, capabilityType)
        : hasCapabilityLiteralComparison(
            node.expression,
            checker,
            capabilityType,
            capabilityIds,
          ))
    ) found = true;
    if (
      ts.isConditionalExpression(node) &&
      hasCapabilityLiteralComparison(
        node.condition,
        checker,
        capabilityType,
        capabilityIds,
      )
    ) found = true;
    if (
      ts.isElementAccessExpression(node) && node.argumentExpression &&
      allowGenericLookup &&
      isCapabilityExpression(node.argumentExpression, checker, capabilityType)
    ) found = true;
    if (
      ts.isCallExpression(node) && node.arguments.some((argument) =>
        isCapabilityExpression(argument, checker, capabilityType),
      ) &&
      ((ts.isPropertyAccessExpression(node.expression) &&
        ["get", "has"].includes(node.expression.name.text) &&
        (allowGenericLookup || isConcreteCapabilityMap(
          node.expression.expression,
          checker,
          capabilityIds,
        ))) || ts.isElementAccessExpression(node.expression))
    ) found = true;
    if (!found) ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

function isSchemaAuthor(sourceFile, inventory) {
  let found = false;
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      getCanonicalToolcraftConstructorName(
        inventory.context,
        node.expression,
      ) === "defineToolcraft"
    ) found = true;
    if (!found) ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

function isCompositionOwner(sourceFile, inventory) {
  let found = false;
  const visit = (node) => {
    if (
      ((ts.isFunctionDeclaration(node) && node.name) ||
        ts.isCallExpression(node)) &&
      getCanonicalToolcraftConstructorName(
        inventory.context,
        ts.isCallExpression(node) ? node.expression : node.name,
      ) === "composeToolcraftApp"
    ) found = true;
    if (!found) ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

export function collectToolcraftCapabilityProofInventoryDiagnostics(inventory) {
  const diagnostics = [];
  const capabilityEntry = inventory.entries.find(({ repoPath }) =>
    repoPath.endsWith("/modules/contract/capability.ts"),
  );
  const catalogEntry = inventory.entries.find(({ repoPath }) =>
    repoPath.endsWith("/acceptance/capability-proofs/catalog.ts"),
  );
  if (!capabilityEntry || !catalogEntry) {
    return [{ code: "missing-capability-proof-authority", repoPath: "<inventory>" }];
  }
  const checker = inventory.context.checker;
  const capabilitySource = inventory.context.program.getSourceFile(
    capabilityEntry.absolutePath,
  );
  const catalogSource = inventory.context.program.getSourceFile(
    catalogEntry.absolutePath,
  );
  const capabilityDeclaration = capabilitySource?.statements.find((statement) =>
    ts.isTypeAliasDeclaration(statement) &&
    statement.name.text === "ToolcraftProductCapabilityId",
  );
  const catalogDeclaration = catalogSource?.statements
    .filter(ts.isVariableStatement)
    .flatMap((statement) => [...statement.declarationList.declarations])
    .find((declaration) =>
      ts.isIdentifier(declaration.name) &&
      declaration.name.text === "TOOLCRAFT_CAPABILITY_PROOF_CATALOG",
    );
  if (!capabilityDeclaration || !catalogDeclaration?.initializer) {
    return [{ code: "missing-capability-proof-authority", repoPath: catalogEntry.repoPath }];
  }
  const capabilityType = checker.getTypeAtLocation(capabilityDeclaration.name);
  const capabilityIds = stringLiteralUnion(checker, capabilityDeclaration);
  const capabilityIdSet = new Set(capabilityIds ?? []);
  const catalog = catalogObject(catalogDeclaration.initializer);
  const resolveCatalogString = createToolcraftStaticStringResolver(
    catalogSource,
    checker,
  );
  const catalogIds = catalog?.properties.map((property) =>
    propertyName(property, resolveCatalogString),
  ).filter(Boolean).sort(compareCodeUnits);
  if (!capabilityIds || !catalogIds || capabilityIds.join("\0") !== catalogIds.join("\0")) {
    diagnostics.push({
      code: "non-exhaustive-capability-recipes",
      repoPath: catalogEntry.repoPath,
    });
  }
  const recipePaths = new Set(
    catalog?.properties.flatMap((property) => {
      const initializer = propertyInitializer(property);
      return initializer
        ? [...resolveValueDeclarationFiles(initializer, checker)]
        : [];
    }) ?? [],
  );
  recipePaths.delete(path.resolve(catalogEntry.absolutePath));
  for (const entry of inventory.entries) {
    if (!/\.[cm]?tsx?$/u.test(entry.repoPath)) continue;
    const sourceFile = inventory.context.program.getSourceFile(entry.absolutePath);
    if (!sourceFile || entry.repoPath === catalogEntry.repoPath) continue;
    const resolveStaticString = createToolcraftStaticStringResolver(sourceFile, checker);
    if (recipePaths.has(path.resolve(entry.absolutePath))) {
      const importsCatalog = collectModuleReferences(
        sourceFile,
        resolveStaticString,
      ).some((specifier) => {
        if (!specifier) return false;
        const reference = resolveToolcraftInventoryReference(
          inventory,
          entry,
          specifier,
        );
        return reference.resolvedEntry?.repoPath === catalogEntry.repoPath;
      });
      if (importsCatalog) {
        diagnostics.push({ code: "recipe-imports-catalog", repoPath: entry.repoPath });
      }
    }
    const isSchemaOrComposition =
      /(?:^|\/)app-(?:composition|schema)\.[cm]?tsx?$/u.test(entry.repoPath);
    const isCompositionBoundary =
      /(?:^|\/)(?:app-composition|compose-toolcraft-app)\.[cm]?tsx?$/u.test(
        entry.repoPath,
      ) || isCompositionOwner(sourceFile, inventory);
    const isRecipe = recipePaths.has(path.resolve(entry.absolutePath));
    const isProofOrchestration =
      /(?:^|\/)(?:owner-dispatch|validate-capability-proofs)\.[cm]?tsx?$/u.test(
        entry.repoPath,
      );
    const isStarterSchema = /(?:^|\/)app-schema\.[cm]?tsx?$/u.test(
      entry.repoPath,
    );
    const isWebsiteSchemaAuthor =
      entry.scope === "website" && isSchemaAuthor(sourceFile, inventory);
    const isClosedOrchestration =
      isRecipe || isSchemaOrComposition || isCompositionBoundary || isProofOrchestration ||
      isStarterSchema || isWebsiteSchemaAuthor;
    const rejectsGenericLookup =
      isRecipe || isSchemaOrComposition || isCompositionBoundary || isStarterSchema ||
      isWebsiteSchemaAuthor;
    if (
      ["product", "runtime", "starter", "cli", "website"].includes(entry.scope) &&
      isClosedOrchestration &&
      hasFeatureSwitchboard(
        sourceFile,
        checker,
        capabilityType,
        capabilityIdSet,
        rejectsGenericLookup,
      )
    ) diagnostics.push({ code: "feature-name-switchboard", repoPath: entry.repoPath });
  }
  return diagnostics.sort((left, right) =>
    compareCodeUnits(left.repoPath, right.repoPath) ||
    compareCodeUnits(left.code, right.code),
  );
}
