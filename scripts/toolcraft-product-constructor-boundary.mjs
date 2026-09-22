import path from "node:path";

import ts from "typescript";

import { createToolcraftTypeScriptProgram } from "./toolcraft-typescript-analysis.mjs";

export function createToolcraftConstructorBindingContext({
  projectRoot,
  rootNames,
  runtimeSourceRoot,
}) {
  const canonicalConstructorFiles = Object.freeze({
    composeToolcraftApp: path.join(
      runtimeSourceRoot,
      "react/app-shell/compose-toolcraft-app.tsx",
    ),
    defineToolcraft: path.join(runtimeSourceRoot, "schema/define-toolcraft.ts"),
  });
  const runtimePath = path
    .relative(projectRoot, runtimeSourceRoot)
    .split(path.sep)
    .join("/");
  const program = createToolcraftTypeScriptProgram({
    options: {
      allowJs: false,
      baseUrl: projectRoot,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      paths: {
        "@/toolcraft/runtime": [`${runtimePath}/index.ts`],
        "@/toolcraft/runtime/react": [`${runtimePath}/react/index.ts`],
        "@/toolcraft/runtime": [`${runtimePath}/index.ts`],
        "@/toolcraft/runtime/react": [`${runtimePath}/react/index.ts`],
      },
      skipLibCheck: true,
      target: ts.ScriptTarget.ES2022,
    },
    rootNames: [
      ...new Set([...rootNames, ...Object.values(canonicalConstructorFiles)]),
    ],
    ts,
  });
  return {
    canonicalConstructorFiles,
    checker: program.getTypeChecker(),
    program,
  };
}

export function getCanonicalToolcraftConstructorName(context, node) {
  let symbol = context.checker.getSymbolAtLocation(node);
  const seen = new Set();
  while (symbol && (symbol.flags & ts.SymbolFlags.Alias) !== 0) {
    if (seen.has(symbol)) return undefined;
    seen.add(symbol);
    symbol = context.checker.getAliasedSymbol(symbol);
  }
  if (!symbol) return undefined;
  for (const [name, filePath] of Object.entries(
    context.canonicalConstructorFiles,
  )) {
    if (
      symbol.getName() === name &&
      symbol
        .getDeclarations()
        ?.some(
          (declaration) =>
            path.resolve(declaration.getSourceFile().fileName) === filePath,
        )
    ) {
      return name;
    }
  }
  return undefined;
}

const standardArtifactTargets = new Set([
  "actions.output",
  "export.image.format",
  "export.image.resolution",
  "export.video.format",
  "export.video.resolution",
]);

function getObjectProperty(object, name) {
  return object.properties.find(
    (property) =>
      ts.isPropertyAssignment(property) &&
      ((ts.isIdentifier(property.name) && property.name.text === name) ||
        (ts.isStringLiteralLike(property.name) && property.name.text === name)),
  );
}

function collectNamedImportBindings(sourceFile, importedName, modulePattern) {
  const bindings = new Set();
  for (const statement of sourceFile.statements) {
    if (
      !ts.isImportDeclaration(statement) ||
      !ts.isStringLiteralLike(statement.moduleSpecifier) ||
      !modulePattern.test(statement.moduleSpecifier.text)
    ) {
      continue;
    }
    const namedBindings = statement.importClause?.namedBindings;
    if (!namedBindings || !ts.isNamedImports(namedBindings)) continue;
    for (const element of namedBindings.elements) {
      if ((element.propertyName?.text ?? element.name.text) === importedName) {
        bindings.add(element.name.text);
      }
    }
  }
  return bindings;
}

function hasExportModifier(node) {
  return (
    ts.canHaveModifiers(node) &&
    ts
      .getModifiers(node)
      ?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
  );
}

export function createToolcraftProductConstructorInspector({
  getNodeLocation,
  repoPath,
  sourceFile,
}) {
  const defineBindings = collectNamedImportBindings(
    sourceFile,
    "defineToolcraft",
    /^(?:@repo\/toolcraft-runtime|[#@]\/toolcraft\/runtime)$/u,
  );
  const composeBindings = collectNamedImportBindings(
    sourceFile,
    "composeToolcraftApp",
    /^(?:@repo\/toolcraft-runtime\/react|[#@]\/toolcraft\/runtime\/react)$/u,
  );
  const violations = [];
  const report = (node, message) => {
    violations.push({
      ...getNodeLocation(sourceFile, node),
      kind: "product-constructor",
      message,
      repoPath,
    });
  };

  function inspectProductBase(base) {
    for (const propertyName of ["export"]) {
      const property = getObjectProperty(base, propertyName);
      if (property) {
        report(
          property,
          `Product base must not author module-owned ${propertyName}.`,
        );
      }
    }
    const panels = getObjectProperty(base, "panels");
    if (panels && ts.isObjectLiteralExpression(panels.initializer)) {
      for (const propertyName of ["layers", "timeline"]) {
        const property = getObjectProperty(panels.initializer, propertyName);
        if (property) {
          report(
            property,
            `Product base must declare ${propertyName} through its canonical module factory.`,
          );
        }
      }
    }
    const visit = (node) => {
      if (
        ts.isPropertyAssignment(node) &&
        ((ts.isIdentifier(node.name) && node.name.text === "target") ||
          (ts.isStringLiteralLike(node.name) && node.name.text === "target")) &&
        ts.isStringLiteralLike(node.initializer) &&
        standardArtifactTargets.has(node.initializer.text)
      ) {
        report(
          node,
          `Product base target "${node.initializer.text}" is owned by an artifact module.`,
        );
      }
      ts.forEachChild(node, visit);
    };
    visit(base);
  }

  function inspectDefineCall(call) {
    const input = call.arguments[0];
    if (!input || !ts.isObjectLiteralExpression(input)) {
      report(
        call,
        "defineToolcraft requires one explicit { base, modules } object literal.",
      );
      return;
    }
    const base = getObjectProperty(input, "base");
    const modules = getObjectProperty(input, "modules");
    if (!base || !modules) {
      report(
        input,
        "defineToolcraft accepts only the public { base, modules } product definition.",
      );
      return;
    }
    if (ts.isObjectLiteralExpression(base.initializer)) {
      inspectProductBase(base.initializer);
    }
    if (ts.isArrayLiteralExpression(modules.initializer)) {
      for (const element of modules.initializer.elements) {
        if (
          ts.isObjectLiteralExpression(element) ||
          ts.isSpreadElement(element)
        ) {
          report(
            element,
            "Product modules must use opaque factory definitions without copying or spreading them.",
          );
        }
      }
    }
  }

  function inspectNode(node) {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      defineBindings.has(node.expression.text)
    ) {
      inspectDefineCall(node);
    }
    if (ts.isVariableStatement(node) && hasExportModifier(node)) {
      for (const declaration of node.declarationList.declarations) {
        if (
          ts.isIdentifier(declaration.name) &&
          declaration.name.text === "appComposition" &&
          repoPath === "src/app/app-composition.tsx" &&
          (!declaration.initializer ||
            !ts.isCallExpression(declaration.initializer) ||
            !ts.isIdentifier(declaration.initializer.expression) ||
            !composeBindings.has(declaration.initializer.expression.text))
        ) {
          report(
            declaration.initializer ?? declaration,
            "Signed appComposition must be created by composeToolcraftApp(schema, ports).",
          );
        }
        if (
          ts.isIdentifier(declaration.name) &&
          declaration.name.text === "appSchema" &&
          repoPath === "src/app/app-schema.ts" &&
          (!declaration.initializer ||
            !ts.isCallExpression(declaration.initializer) ||
            !ts.isIdentifier(declaration.initializer.expression) ||
            !defineBindings.has(declaration.initializer.expression.text))
        ) {
          report(
            declaration.initializer ?? declaration,
            "Signed appSchema must be created by defineToolcraft({ base, modules }).",
          );
        }
      }
    }
    return violations.splice(0);
  }

  return { inspectNode };
}
