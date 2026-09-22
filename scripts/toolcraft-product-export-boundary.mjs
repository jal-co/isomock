import ts from "typescript";
const forbiddenGlobalExportConstructors = new Set([
  "MediaRecorder",
  "VideoEncoder",
]);
const forbiddenCanvasExportMethods = new Set([
  "captureStream",
  "toBlob",
  "toDataURL",
]);
const forbiddenGlobalExportFunctions = new Set(["showSaveFilePicker"]);

export function getToolcraftProductExportModuleKind(
  normalizedSpecifier,
  resolvedSpecifier,
) {
  if (/^mediabunny(?:\/|$)/u.test(normalizedSpecifier)) {
    return "runtime-export-mechanics";
  }
  if (
    /^@repo\/toolcraft-runtime\/export(?:\/|$)/u.test(normalizedSpecifier) ||
    /^[#@]\/toolcraft\/runtime\/export(?:\/|$)/u.test(normalizedSpecifier) ||
    /\/src\/toolcraft\/runtime\/export(?:\/|$)/u.test(resolvedSpecifier ?? "")
  ) {
    return "runtime-export-mechanics";
  }
  return null;
}

export function isForbiddenToolcraftRuntimeExport(moduleKind) {
  return moduleKind === "runtime-export-mechanics";
}

function getDeclarationScope(node, sourceFile) {
  let current = node.parent;
  while (current) {
    if (
      ts.isSourceFile(current) ||
      ts.isFunctionLike(current) ||
      ts.isBlock(current) ||
      ts.isCatchClause(current)
    ) {
      return current;
    }
    current = current.parent;
  }
  return sourceFile;
}

function collectLexicalDeclarations(sourceFile) {
  const declarations = [];

  function collectBindingNames(name, scope) {
    if (ts.isIdentifier(name)) {
      declarations.push({ name: name.text, scope });
    } else if (
      ts.isObjectBindingPattern(name) ||
      ts.isArrayBindingPattern(name)
    ) {
      for (const element of name.elements) {
        if (ts.isBindingElement(element)) collectBindingNames(element.name, scope);
      }
    }
  }

  function visit(node) {
    if (ts.isImportClause(node) && node.name) {
      collectBindingNames(node.name, sourceFile);
    } else if (ts.isImportSpecifier(node) || ts.isNamespaceImport(node)) {
      collectBindingNames(node.name, sourceFile);
    } else if (ts.isVariableDeclaration(node)) {
      collectBindingNames(node.name, getDeclarationScope(node, sourceFile));
    } else if (ts.isParameter(node)) {
      collectBindingNames(node.name, node.parent);
    } else if (
      (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) &&
      node.name
    ) {
      collectBindingNames(node.name, getDeclarationScope(node, sourceFile));
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return declarations;
}

export function createToolcraftProductExportInspector({
  getNodeLocation,
  repoPath,
  sourceFile,
}) {
  const lexicalDeclarations = collectLexicalDeclarations(sourceFile);

  function isLexicallyDeclared(identifier) {
    const ancestorScopes = new Set();
    let current = identifier.parent;
    while (current) {
      if (
        ts.isSourceFile(current) ||
        ts.isFunctionLike(current) ||
        ts.isBlock(current) ||
        ts.isCatchClause(current)
      ) {
        ancestorScopes.add(current);
      }
      current = current.parent;
    }
    return lexicalDeclarations.some(
      (declaration) =>
        declaration.name === identifier.text &&
        ancestorScopes.has(declaration.scope),
    );
  }

  function violation(node, subject) {
    return {
      ...getNodeLocation(sourceFile, node),
      kind: "runtime-export-ownership",
      message: `Product source must not own ${subject}. Declare exportRenderer for image/video or svgExportRenderer for SVG and let runtime export actions create and download the artifact.`,
      repoPath,
    };
  }

  return (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      forbiddenGlobalExportFunctions.has(node.expression.text) &&
      !isLexicallyDeclared(node.expression)
    ) {
      return [violation(node, `${node.expression.text} artifact delivery`)];
    }
    if (
      ts.isNewExpression(node) &&
      ts.isIdentifier(node.expression) &&
      forbiddenGlobalExportConstructors.has(node.expression.text) &&
      !isLexicallyDeclared(node.expression)
    ) {
      return [
        violation(
          node,
          `${node.expression.text} encoder or recorder construction`,
        ),
      ];
    }
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression)
    ) {
      const propertyName = node.expression.name.text;
      if (forbiddenCanvasExportMethods.has(propertyName)) {
        return [violation(node, `canvas.${propertyName}() export mechanics`)];
      }
      if (
        propertyName === "createObjectURL" &&
        ts.isIdentifier(node.expression.expression) &&
        node.expression.expression.text === "URL" &&
        !isLexicallyDeclared(node.expression.expression)
      ) {
        return [violation(node, "URL.createObjectURL() artifact delivery")];
      }
    }
    return [];
  };
}
