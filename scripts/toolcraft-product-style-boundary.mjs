import ts from "typescript";

function getNodeLocation(sourceFile, node) {
  const location = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return { column: location.character + 1, line: location.line + 1 };
}

export function inspectToolcraftProductStyleNode({
  node,
  repoPath,
  resolveStaticString,
  sourceFile,
}) {
  const violations = [];
  const isStyleElement =
    (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
    node.tagName.getText(sourceFile) === "style";
  const createsStyleElement =
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression) &&
    node.expression.name.text === "createElement" &&
    node.arguments[0] &&
    ts.isStringLiteralLike(node.arguments[0]) &&
    node.arguments[0].text.toLowerCase() === "style";
  const createsStyleSheet =
    ts.isNewExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === "CSSStyleSheet";

  if (isStyleElement || createsStyleElement || createsStyleSheet) {
    violations.push({
      ...getNodeLocation(sourceFile, node),
      kind: "global-style-injection",
      message:
        "Product source must not inject global style elements or stylesheets. Use a local *.module.css file so product styling cannot modify the signed Toolcraft host.",
      repoPath,
    });
  }

  let styleModuleSpecifier;
  let styleModuleNode;
  if (
    (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
    node.moduleSpecifier &&
    ts.isStringLiteralLike(node.moduleSpecifier)
  ) {
    styleModuleSpecifier = node.moduleSpecifier.text;
    styleModuleNode = node.moduleSpecifier;
  } else if (
    ts.isImportEqualsDeclaration(node) &&
    ts.isExternalModuleReference(node.moduleReference) &&
    node.moduleReference.expression &&
    ts.isStringLiteralLike(node.moduleReference.expression)
  ) {
    styleModuleSpecifier = node.moduleReference.expression.text;
    styleModuleNode = node.moduleReference.expression;
  } else if (
    ts.isCallExpression(node) &&
    (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
      (ts.isIdentifier(node.expression) && node.expression.text === "require")) &&
    node.arguments.length > 0
  ) {
    styleModuleSpecifier = resolveStaticString?.(node.arguments[0]);
    styleModuleNode = node.arguments[0];
  }

  if (
    styleModuleSpecifier &&
    /\.(?:css|less|sass|scss|styl|stylus)(?:\?|$)/iu.test(styleModuleSpecifier) &&
    (!/\.module\.css(?:\?|$)/iu.test(styleModuleSpecifier) ||
      !/^(?:\.|@\/|#\/|\/src\/)/u.test(styleModuleSpecifier))
  ) {
    violations.push({
      ...getNodeLocation(sourceFile, styleModuleNode),
      kind: "product-global-css-import",
      message:
        "Product source may import only local *.module.css styles. Package or plain CSS imports can restyle the signed Toolcraft host.",
      repoPath,
    });
  }

  return violations;
}
