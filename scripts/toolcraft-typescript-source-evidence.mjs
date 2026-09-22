import { createRequire } from "node:module";

import { createToolcraftTypeScriptChecker } from "./toolcraft-typescript-analysis.mjs";
import {
  collectToolcraftTypeScriptSemanticFacts,
} from "./toolcraft-typescript-semantic-evidence.mjs";

const require = createRequire(import.meta.url);
const EMPTY_FACTS = Object.freeze([]);
const EMPTY_BOUNDARY_EVIDENCE = Object.freeze({
  moduleLoadingViolations: EMPTY_FACTS,
  playwrightAuthorityViolations: EMPTY_FACTS,
  productSourceViolations: EMPTY_FACTS,
  reservedEvidenceViolations: EMPTY_FACTS,
});
const EMPTY_SEMANTIC_FACTS = Object.freeze({
  exportedCallableBindings: EMPTY_FACTS,
  exportedRuntimeBindings: EMPTY_FACTS,
  identifiers: EMPTY_FACTS,
  importedCallTargets: EMPTY_FACTS,
  importedRuntimeBindings: EMPTY_FACTS,
  localCallTargets: EMPTY_FACTS,
  moduleShape: "empty",
  staticStrings: EMPTY_FACTS,
});
let compilerLoadAttempted = false;
let evidenceInspectorsPromise;
let typescriptCompiler;

export function getToolcraftTypeScriptCompiler() {
  if (compilerLoadAttempted) return typescriptCompiler;
  compilerLoadAttempted = true;
  try {
    const importedCompiler = require("typescript");
    typescriptCompiler = importedCompiler.default ?? importedCompiler;
  } catch (error) {
    if (error?.code !== "MODULE_NOT_FOUND") throw error;
  }
  return typescriptCompiler;
}

export function isToolcraftTypeScriptCompilerAvailable() {
  return Boolean(getToolcraftTypeScriptCompiler());
}

function compareCodeUnits(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function isToolcraftPackageRootOrSubpath(specifier, packageName) {
  return (
    specifier === packageName ||
    specifier?.startsWith(`${packageName}/`) === true
  );
}

function scriptKind(filePath, ts) {
  if (/\.tsx$/iu.test(filePath)) return ts.ScriptKind.TSX;
  if (/\.jsx$/iu.test(filePath)) return ts.ScriptKind.JSX;
  if (/\.[cm]?js$/iu.test(filePath)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function importDeclarationIsTypeOnly(node, ts) {
  const clause = node.importClause;
  if (!clause) return false;
  if (clause.isTypeOnly) return true;
  if (clause.name || !clause.namedBindings) return false;
  return ts.isNamedImports(clause.namedBindings) &&
    clause.namedBindings.elements.length > 0 &&
    clause.namedBindings.elements.every((element) => element.isTypeOnly);
}

function exportDeclarationIsTypeOnly(node, ts) {
  if (node.isTypeOnly) return true;
  return node.exportClause &&
    ts.isNamedExports(node.exportClause) &&
    node.exportClause.elements.length > 0 &&
    node.exportClause.elements.every((element) => element.isTypeOnly);
}

function freezeFacts(facts) {
  return Object.freeze(facts.map((fact) => Object.freeze({ ...fact })));
}

export function parseToolcraftTypeScriptSource({ absolutePath, rawSource }) {
  const ts = getToolcraftTypeScriptCompiler();
  if (!ts) return undefined;
  return {
    sourceFile: ts.createSourceFile(
      absolutePath,
      rawSource,
      ts.ScriptTarget.Latest,
      true,
      scriptKind(absolutePath, ts),
    ),
    ts,
  };
}

function getNodeLocation(sourceFile, node) {
  const location = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return { column: location.character + 1, line: location.line + 1 };
}

async function loadEvidenceInspectors() {
  evidenceInspectorsPromise ??= Promise.all([
    import("./toolcraft-static-string.mjs"),
    import("./toolcraft-product-boundary-ast.mjs"),
    import("./toolcraft-product-evidence-boundary-ast.mjs"),
    import("./toolcraft-playwright-evidence-authority.mjs"),
  ]).then(([staticStrings, productBoundary, evidenceBoundary, playwright]) => ({
    ...staticStrings,
    ...productBoundary,
    ...evidenceBoundary,
    ...playwright,
  }));
  return evidenceInspectorsPromise;
}

export function collectToolcraftTypeScriptResolvedImportFacts({ resolveStaticString, sourceFile, ts }) {
  const imports = [];
  const recordedImportKeys = new Set();
  const visitedNodes = new Set();

  function record(category, node, specifier, typeOnly = false) {
    const offset = node.getStart(sourceFile);
    const normalizedSpecifier = specifier ?? null;
    const evidenceKey = JSON.stringify([
      category,
      offset,
      node.end,
      normalizedSpecifier,
      typeOnly,
    ]);
    if (recordedImportKeys.has(evidenceKey)) return;
    recordedImportKeys.add(evidenceKey);
    const location = sourceFile.getLineAndCharacterOfPosition(
      offset,
    );
    imports.push({
      category,
      column: location.character + 1,
      line: location.line + 1,
      offset,
      specifier: normalizedSpecifier,
      typeOnly,
    });
  }

  function recordImportType(node, category) {
    if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteralLike(node.argument.literal)
    ) {
      record(category, node.argument.literal, node.argument.literal.text, true);
    }
  }

  function visitJSDoc(node) {
    if (visitedNodes.has(node)) return;
    visitedNodes.add(node);
    recordImportType(node, "jsdoc-import-type");
    ts.forEachChild(node, visitJSDoc);
  }

  function visit(node) {
    if (visitedNodes.has(node)) return;
    visitedNodes.add(node);
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      record(
        "static-import",
        node.moduleSpecifier,
        node.moduleSpecifier.text,
        importDeclarationIsTypeOnly(node, ts),
      );
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      record(
        "static-export",
        node.moduleSpecifier,
        node.moduleSpecifier.text,
        exportDeclarationIsTypeOnly(node, ts),
      );
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression &&
      ts.isStringLiteralLike(node.moduleReference.expression)
    ) {
      record(
        "import-equals",
        node.moduleReference.expression,
        node.moduleReference.expression.text,
        node.isTypeOnly,
      );
    } else if (ts.isImportTypeNode(node)) {
      recordImportType(node, "import-type");
    } else if (
      ts.isCallExpression(node) &&
      node.arguments.length > 0 &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require"))
    ) {
      record(
        node.expression.kind === ts.SyntaxKind.ImportKeyword
          ? "dynamic-import"
          : "require",
        node.arguments[0],
        resolveStaticString(node.arguments[0]),
      );
    }
    for (const jsDocNode of [
      ...(node.jsDoc ?? []),
      ...ts.getJSDocCommentsAndTags(node),
    ]) {
      visitJSDoc(jsDocNode);
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  imports.sort(
    (left, right) =>
      left.offset - right.offset ||
      compareCodeUnits(left.category, right.category) ||
      compareCodeUnits(String(left.specifier), String(right.specifier)),
  );
  return freezeFacts(
    imports.map(({ offset: _offset, ...importFact }) => importFact),
  );
}

export function collectToolcraftTypeScriptImportFacts({
  absolutePath,
  rawSource,
}) {
  const parsed = parseToolcraftTypeScriptSource({ absolutePath, rawSource });
  if (!parsed) return EMPTY_FACTS;
  const { sourceFile, ts } = parsed;
  return collectToolcraftTypeScriptResolvedImportFacts({
    resolveStaticString(node) {
      return ts.isStringLiteralLike(node) ? node.text : undefined;
    },
    sourceFile,
    ts,
  });
}

export async function createToolcraftTypeScriptDependencyRecord({
  absolutePath,
  rawSource,
}) {
  const parsed = parseToolcraftTypeScriptSource({ absolutePath, rawSource });
  if (!parsed) {
    return Object.freeze({ imports: EMPTY_FACTS, rawSource });
  }
  const { sourceFile, ts } = parsed;
  const checker = createToolcraftTypeScriptChecker(sourceFile, ts);
  const { createToolcraftStaticStringResolver } =
    await import("./toolcraft-static-string.mjs");
  const resolveStaticString =
    createToolcraftStaticStringResolver(sourceFile, checker);
  return Object.freeze({
    imports: collectToolcraftTypeScriptResolvedImportFacts({
      resolveStaticString,
      sourceFile,
      ts,
    }),
    rawSource,
  });
}

export async function createToolcraftTypeScriptSourceRecord({
  absolutePath,
  includeBoundaryEvidence = true,
  rawSource,
  repoPath,
  rootDir,
}) {
  const parsed = parseToolcraftTypeScriptSource({ absolutePath, rawSource });
  if (!parsed) {
    return Object.freeze({
      boundaryEvidence: EMPTY_BOUNDARY_EVIDENCE,
      imports: EMPTY_FACTS,
      rawSource,
      semanticFacts: EMPTY_SEMANTIC_FACTS,
    });
  }
  const { sourceFile, ts } = parsed;
  const checker = createToolcraftTypeScriptChecker(sourceFile, ts);
  const inspectors = includeBoundaryEvidence
    ? await loadEvidenceInspectors()
    : await import("./toolcraft-static-string.mjs");
  const resolveStaticString =
    inspectors.createToolcraftStaticStringResolver(sourceFile, checker);
  const inspectorInput = {
    absolutePath,
    checker,
    getNodeLocation,
    repoPath,
    resolveStaticString,
    rootDir,
    sourceFile,
  };
  const boundaryEvidence = !includeBoundaryEvidence
    ? EMPTY_BOUNDARY_EVIDENCE : Object.freeze({
      moduleLoadingViolations: freezeFacts(
        inspectors.inspectToolcraftModuleLoading(inspectorInput),
      ),
      playwrightAuthorityViolations: freezeFacts(
        inspectors.inspectToolcraftPlaywrightEvidenceAuthority(inspectorInput),
      ),
      productSourceViolations: freezeFacts(
        inspectors.inspectToolcraftProductSource(inspectorInput),
      ),
      reservedEvidenceViolations: freezeFacts(
        inspectors.inspectToolcraftReservedEvidenceAccess(inspectorInput),
      ),
    });
  return Object.freeze({
    boundaryEvidence,
    imports: collectToolcraftTypeScriptResolvedImportFacts({ resolveStaticString, sourceFile, ts }),
    rawSource,
    semanticFacts: collectToolcraftTypeScriptSemanticFacts({
      checker,
      resolveStaticString,
      sourceFile,
      ts,
    }),
  });
}
