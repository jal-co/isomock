import ts from "typescript";

import {
  builtInControlExportNames,
  runtimeSurfaceComponentNames,
} from "./toolcraft-integrity-policy.mjs";
import {
  createToolcraftProductExportInspector,
  isForbiddenToolcraftRuntimeExport,
} from "./toolcraft-product-export-boundary.mjs";
import { createToolcraftProductControlInspector } from "./toolcraft-product-control-boundary.mjs";
import { getToolcraftSensitiveModuleKind } from "./toolcraft-product-boundary-module-policy.mjs";
import { createToolcraftProductConstructorInspector } from "./toolcraft-product-constructor-boundary.mjs";
import { inspectToolcraftProductStyleNode } from "./toolcraft-product-style-boundary.mjs";

const runtimeSurfaceNames = new Set(runtimeSurfaceComponentNames);
const builtInControlNames = new Set(builtInControlExportNames);
const runtimeModelPresentationInternalNames = new Set([
  "ToolcraftModelCanvasLayer",
  "ToolcraftModelCanvasLayers",
  "ToolcraftModelRenderProvider",
  "useOptionalToolcraftModelRenderHost",
  "useToolcraftModelRenderHost",
]);

function isForbiddenNamedExport(moduleKind, importedName) {
  if (moduleKind === "ui-control-implementation") return true;
  if (moduleKind === "ui-private-implementation") return true;
  if (moduleKind === "ui-base-implementation") return true;
  if (isForbiddenToolcraftRuntimeExport(moduleKind)) return true;
  if (moduleKind === "runtime-product-module-internal") return true;
  if (
    moduleKind === "runtime-model-import" ||
    moduleKind === "runtime-model-presentation"
  )
    return true;
  return moduleKind === "runtime-react"
    ? runtimeSurfaceNames.has(importedName) ||
        runtimeModelPresentationInternalNames.has(importedName)
    : builtInControlNames.has(importedName) ||
        (importedName.endsWith("Control") &&
          importedName !== "createControlHistoryGroupId");
}

function getImportViolationKind(moduleKind, importedName) {
  switch (moduleKind) {
    case "runtime-export-mechanics":
      return "runtime-export-ownership";
    case "runtime-model-presentation":
      return "runtime-model-presentation-ownership";
    case "runtime-react":
      return runtimeModelPresentationInternalNames.has(importedName)
        ? "runtime-model-presentation-ownership"
        : "runtime-surface";
    case "runtime-model-import":
      return "runtime-model-import-ownership";
    case "runtime-product-module-internal":
      return "runtime-product-module-ownership";
    case "ui-control-implementation":
      return "built-in-control-implementation";
    case "ui-private-implementation":
      return "private-ui-implementation";
    case "ui-base-implementation":
      return "private-ui-implementation";
    default:
      return "built-in-control";
  }
}

function getViolationMessage(kind, subject, moduleSpecifier) {
  switch (kind) {
    case "runtime-export-ownership":
      return `Product source must not own artifact encoding, recording, or download mechanics${subject} from ${moduleSpecifier}. Declare exportRenderer for image/video or svgExportRenderer for SVG and let runtime export actions create and download the artifact.`;
    case "runtime-surface":
      return `Product source must not import or re-export host-owned runtime surface${subject} from ${moduleSpecifier}. Use ToolcraftAppComposition, schema, canvasContent, controlRenderers, onPanelAction, and runtime commands.`;
    case "runtime-model-presentation-ownership":
      return `Product source must not import raw model render hosts or standard model canvas internals${subject} from ${moduleSpecifier}. Declare modelPresentation and use useToolcraftModelPresentationConsumer for visible custom model output.`;
    case "runtime-model-import-ownership":
      return `Product source must not import or re-export model loaders, topology/repair infrastructure, or runtime model-import internals${subject} from ${moduleSpecifier}. Declare a model fileDrop in schema and use the runtime-owned import, analysis, repair, persistence, preview, and export pipeline.`;
    case "runtime-product-module-ownership":
      return `Product source must not import module resolvers or deep module internals${subject} from ${moduleSpecifier}. Use factories from the public Toolcraft runtime root.`;
    case "built-in-control-implementation":
      return `Product source must not import or re-export a deep control implementation${subject} from ${moduleSpecifier}. Use the public schema control instead of copying or composing its private mechanics.`;
    case "private-ui-implementation":
      return `Product source may import Toolcraft UI only from the public root. Deep UI implementation${subject} from ${moduleSpecifier} is private.`;
    default:
      return `Product source must not import or re-export built-in control${subject} from ${moduleSpecifier}. Declare it through schema or justify a true custom controlRenderer.`;
  }
}

function createViolation({
  getNodeLocation,
  importedName,
  kind,
  moduleSpecifier,
  node,
  repoPath,
  sourceFile,
}) {
  const subject = importedName ? ` ${importedName}` : "";
  return {
    ...getNodeLocation(sourceFile, node),
    kind,
    message: getViolationMessage(kind, subject, moduleSpecifier),
    repoPath,
  };
}

export function inspectToolcraftProductSource({
  absolutePath,
  checker,
  getNodeLocation,
  repoPath,
  resolveCssModuleClass,
  resolveStaticString,
  rootDir,
  sourceFile,
}) {
  const violations = [];
  const inspectExportMechanics = createToolcraftProductExportInspector({
    getNodeLocation,
    repoPath,
    sourceFile,
  });
  const inspectControls = createToolcraftProductControlInspector({
    checker,
    getNodeLocation,
    repoPath,
    resolveCssModuleClass,
    resolveStaticString,
    sourceFile,
  });
  const inspectConstructors = createToolcraftProductConstructorInspector({
    getNodeLocation,
    repoPath,
    sourceFile,
  });

  function report(node, moduleSpecifier, moduleKind, importedName) {
    if (importedName && !isForbiddenNamedExport(moduleKind, importedName)) {
      return;
    }
    violations.push(
      createViolation({
        getNodeLocation,
        importedName,
        kind: getImportViolationKind(moduleKind, importedName),
        moduleSpecifier,
        node,
        repoPath,
        sourceFile,
      }),
    );
  }

  function getModuleKind(moduleSpecifier) {
    return getToolcraftSensitiveModuleKind({
      moduleSpecifier,
      rootDir,
      sourceFilePath: absolutePath,
    });
  }

  function inspectModuleSpecifier(node, moduleSpecifier) {
    const moduleKind = getModuleKind(moduleSpecifier);
    if (!moduleKind) return null;
    if (moduleKind === "ui-control-implementation") {
      report(node, moduleSpecifier, moduleKind);
      return null;
    }
    if (moduleKind === "ui-private-implementation") {
      report(node, moduleSpecifier, moduleKind);
      return null;
    }
    if (moduleKind === "ui-base-implementation") {
      report(node, moduleSpecifier, moduleKind);
      return null;
    }
    if (isForbiddenToolcraftRuntimeExport(moduleKind)) {
      report(node, moduleSpecifier, moduleKind);
      return null;
    }
    return moduleKind;
  }

  function visit(node) {
    violations.push(
      ...inspectToolcraftProductStyleNode({
        node,
        repoPath,
        resolveStaticString,
        sourceFile,
      }),
      ...inspectExportMechanics(node),
      ...inspectControls.inspectNode(node),
      ...inspectConstructors.inspectNode(node),
    );

    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      const moduleSpecifier = node.moduleSpecifier.text;
      const moduleKind = inspectModuleSpecifier(node, moduleSpecifier);
      const importClause = node.importClause;

      if (moduleKind && importClause && !importClause.isTypeOnly) {
        if (importClause.name)
          report(importClause.name, moduleSpecifier, moduleKind);
        const bindings = importClause.namedBindings;
        if (bindings && ts.isNamespaceImport(bindings)) {
          report(bindings, moduleSpecifier, moduleKind);
        } else if (bindings && ts.isNamedImports(bindings)) {
          for (const element of bindings.elements) {
            if (!element.isTypeOnly) {
              report(
                element,
                moduleSpecifier,
                moduleKind,
                element.propertyName?.text ?? element.name.text,
              );
            }
          }
        }
      }
    }

    if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      const moduleSpecifier = node.moduleSpecifier.text;
      const moduleKind = inspectModuleSpecifier(node, moduleSpecifier);

      if (moduleKind && !node.isTypeOnly) {
        if (!node.exportClause || ts.isNamespaceExport(node.exportClause)) {
          report(node, moduleSpecifier, moduleKind);
        } else if (ts.isNamedExports(node.exportClause)) {
          for (const element of node.exportClause.elements) {
            if (!element.isTypeOnly) {
              report(
                element,
                moduleSpecifier,
                moduleKind,
                element.propertyName?.text ?? element.name.text,
              );
            }
          }
        }
      }
    }

    if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression &&
      ts.isStringLiteralLike(node.moduleReference.expression)
    ) {
      const moduleSpecifier = node.moduleReference.expression.text;
      const moduleKind = inspectModuleSpecifier(node, moduleSpecifier);
      if (moduleKind && !node.isTypeOnly) {
        report(node, moduleSpecifier, moduleKind);
      }
    }

    if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteralLike(node.argument.literal)
    ) {
      inspectModuleSpecifier(node, node.argument.literal.text);
    }

    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) &&
          node.expression.text === "require")) &&
      node.arguments.length > 0
    ) {
      const moduleSpecifier = resolveStaticString(node.arguments[0]);
      if (moduleSpecifier === undefined) {
        violations.push({
          ...getNodeLocation(sourceFile, node.arguments[0]),
          kind: "non-static-module-specifier",
          message:
            "Product import() and require() calls must use a statically resolvable string so the Toolcraft source boundary can verify the loaded module.",
          repoPath,
        });
        ts.forEachChild(node, visit);
        return;
      }
      const moduleKind = inspectModuleSpecifier(node, moduleSpecifier);
      if (moduleKind) report(node, moduleSpecifier, moduleKind);
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return violations;
}
