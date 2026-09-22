import ts from "typescript";

import {
  getCanonicalToolcraftConstructorName,
} from "./toolcraft-product-constructor-boundary.mjs";
import {
  collectToolcraftCanonicalDefinitionPolicyCodes,
  collectToolcraftConstructorInitializers as localInitializers,
  collectToolcraftConstructorObjectProperties as collectObjectProperties,
  resolveToolcraftConstructorExpression as resolveExpression,
} from "./toolcraft-module-constructor-normalization-test-utils.mjs";
import { createToolcraftStaticStringResolver } from "./toolcraft-static-string.mjs";
import {
  compareCodeUnits,
  getToolcraftInventorySourceFile,
} from "./toolcraft-module-cutover-inventory-test-utils.mjs";
import {
  collectJavascriptConstructorBindings,
  collectJavascriptExportedBindings,
  getJavascriptConstructorName,
} from "./toolcraft-module-javascript-constructor-test-utils.mjs";

function getCompositionType(inventory) {
  const sourceFile = inventory.context.program.getSourceFiles().find(({ fileName }) =>
    fileName.replaceAll("\\", "/").endsWith(
      "/react/app-shell/toolcraft-app.tsx",
    ),
  );
  const declaration = sourceFile?.statements.find((statement) =>
    ts.isTypeAliasDeclaration(statement) &&
    statement.name.text === "ToolcraftAppComposition",
  );
  return declaration
    ? inventory.context.checker.getTypeAtLocation(declaration.name)
    : undefined;
}

function isExportedVariable(node) {
  const statement = node.parent.parent;
  return ts.isVariableStatement(statement) &&
    Boolean(ts.getCombinedModifierFlags(statement) & ts.ModifierFlags.Export);
}

function isSignedAnyComposition(
  node,
  checker,
  initializers,
  resolveStaticString,
) {
  if (!(checker.getTypeAtLocation(node.name).flags & ts.TypeFlags.Any)) return false;
  if (ts.isIdentifier(node.name) && /composition$/iu.test(node.name.text)) return true;
  const properties = collectObjectProperties(
    node.initializer,
    checker,
    initializers,
    resolveStaticString,
  );
  return Boolean(properties?.has("schema"));
}

export function collectToolcraftClosedConstructorDiagnostics(inventory) {
  const diagnostics = [];
  const defineAuthors = new Set();
  const compositionAuthors = new Set();
  const compositionType = getCompositionType(inventory);
  for (const entry of inventory.entries) {
    const sourceFile = getToolcraftInventorySourceFile(inventory, entry);
    const compilerSource = inventory.context.program.getSourceFile(entry.absolutePath);
    const checker = compilerSource ? inventory.context.checker : undefined;
    const resolveStaticString = checker
      ? createToolcraftStaticStringResolver(sourceFile, checker)
      : createToolcraftStaticStringResolver(sourceFile);
    const initializers = localInitializers(sourceFile);
    const javascript = checker
      ? { bindings: new Map(), namespaces: new Map() }
      : collectJavascriptConstructorBindings(
          inventory,
          entry,
          sourceFile,
          initializers,
          resolveStaticString,
        );
    const javascriptExports = checker
      ? new Set()
      : collectJavascriptExportedBindings(sourceFile);
    const reported = new Set();
    const report = (code) => {
      if (reported.has(code)) return;
      reported.add(code);
      diagnostics.push({ code, repoPath: entry.repoPath });
    };
    const visit = (node) => {
      if (ts.isObjectLiteralExpression(node)) {
        const properties = collectObjectProperties(
          node,
          checker,
          initializers,
          resolveStaticString,
        );
        if (properties?.has("schema") && properties.has("modulePlan")) {
          report("materialized-schema-bridge");
        }
      }
      if (
        checker && ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)
      ) {
        const variableType = checker.getTypeAtLocation(node.name);
        if (
          checker.getPropertyOfType(variableType, "schema") &&
          checker.getPropertyOfType(variableType, "modulePlan")
        ) report("materialized-schema-bridge");
      }
      if (
        checker && ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) && node.initializer &&
        isExportedVariable(node)
      ) {
        const variableType = checker.getTypeAtLocation(node.name);
        const anySigned = isSignedAnyComposition(
          node,
          checker,
          initializers,
          resolveStaticString,
        );
        if (anySigned) report("any-signed-composition");
        const isSigned =
          !anySigned && compositionType &&
          checker.getPropertyOfType(variableType, "schema") &&
          checker.isTypeAssignableTo(variableType, compositionType);
        if (isSigned) {
          const initializer = resolveExpression(
            node.initializer,
            checker,
            initializers,
          ).node;
          if (
            !initializer || !ts.isCallExpression(initializer) ||
            getCanonicalToolcraftConstructorName(
              inventory.context,
              initializer.expression,
            ) !== "composeToolcraftApp"
          ) report("manual-app-composition");
        }
      }
      if (
        !checker && ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) && node.initializer &&
        javascriptExports.has(node.name.text)
      ) {
        const properties = collectObjectProperties(
          node.initializer,
          checker,
          initializers,
          resolveStaticString,
        );
        const isSigned = /composition$/iu.test(node.name.text) ||
          Boolean(properties?.has("schema"));
        const initializer = resolveExpression(
          node.initializer,
          checker,
          initializers,
        ).node;
        const constructorName =
          initializer && ts.isCallExpression(initializer)
            ? getJavascriptConstructorName(
                inventory,
                entry,
                initializer.expression,
                javascript.bindings,
                javascript.namespaces,
                resolveStaticString,
              )
            : undefined;
        if (isSigned && constructorName !== "composeToolcraftApp") {
          report("manual-app-composition");
        }
      }
      if (ts.isCallExpression(node)) {
        const constructorName = checker
          ? getCanonicalToolcraftConstructorName(inventory.context, node.expression)
          : getJavascriptConstructorName(
              inventory,
              entry,
              node.expression,
              javascript.bindings,
              javascript.namespaces,
              resolveStaticString,
            );
        if (constructorName) {
          if (
            !ts.isIdentifier(node.expression) ||
            node.expression.text !== constructorName
          ) report("constructor-alias");
          if (constructorName === "composeToolcraftApp") {
            compositionAuthors.add(entry.repoPath);
          } else {
            defineAuthors.add(entry.repoPath);
            const input = node.arguments[0];
            const resolvedInput = input && resolveExpression(
              input,
              checker,
              initializers,
            );
            if (!input || resolvedInput?.hadCast) report("old-input-cast");
            const properties = input && collectObjectProperties(
              input,
              checker,
              initializers,
              resolveStaticString,
            );
            const keys = [...(properties?.keys() ?? [])].sort(compareCodeUnits);
            if (!properties || keys.filter((key) => key !== "defaults").join("\0") !== "base\0modules") {
              report("old-product-definition");
            }
            if (properties?.has("base") && properties.has("modules")) {
              for (const code of collectToolcraftCanonicalDefinitionPolicyCodes({
                checker,
                initializers,
                properties,
                resolveStaticString,
                sourceFile,
              })) report(code);
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
  }
  return {
    compositionAuthors: [...compositionAuthors].sort(compareCodeUnits),
    defineAuthors: [...defineAuthors].sort(compareCodeUnits),
    diagnostics: diagnostics.sort((left, right) =>
      compareCodeUnits(left.repoPath, right.repoPath) ||
      compareCodeUnits(left.code, right.code),
    ),
  };
}
