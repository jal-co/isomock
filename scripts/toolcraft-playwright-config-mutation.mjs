import ts from "typescript";

const unwrap = (input) => {
  let node = input;
  while (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isTypeAssertionExpression(node) || ts.isSatisfiesExpression(node) || ts.isNonNullExpression(node)) node = node.expression;
  return node;
};

function rootIdentifier(input) {
  let node = unwrap(input);
  while (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) node = unwrap(node.expression);
  return ts.isIdentifier(node) ? node : undefined;
}

function isInside(node, boundary) {
  for (let cursor = node; cursor; cursor = cursor.parent) if (cursor === boundary) return true;
  return false;
}
export function assertToolcraftPlaywrightConfigStaticUse({ checker, exportedExpression, isDefineConfigCall, repoPath, sourceFile }) {
  const declarations = new Map();
  const index = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      const symbol = checker.getSymbolAtLocation(node.name);
      if (symbol) declarations.set(symbol, node.initializer);
    }
    ts.forEachChild(node, index);
  };
  index(sourceFile);
  const roots = new Set(), addConfigRoots = (input) => {
    const node = unwrap(input);
    if (ts.isIdentifier(node)) { const symbol = checker.getSymbolAtLocation(node); if (declarations.has(symbol)) roots.add(symbol); return; }
    if (ts.isConditionalExpression(node)) { addConfigRoots(node.whenTrue); addConfigRoots(node.whenFalse); return; }
    if (ts.isCallExpression(node) && isDefineConfigCall(node)) { for (const argument of node.arguments) addConfigRoots(argument); return; }
    if (ts.isObjectLiteralExpression(node)) for (const property of node.properties) if (ts.isSpreadAssignment(property)) addConfigRoots(property.expression);
  };
  addConfigRoots(exportedExpression);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [symbol, initializer] of declarations) {
      const sourceNode = rootIdentifier(initializer), source = sourceNode && checker.getSymbolAtLocation(sourceNode);
      if (!roots.has(symbol) && roots.has(source)) { roots.add(symbol); changed = true; }
      if (roots.has(symbol) && source && declarations.has(source) && !roots.has(source)) { roots.add(source); changed = true; }
    }
  }
  const allowed = [exportedExpression, ...[...roots].map((symbol) => declarations.get(symbol)).filter(Boolean)];
  const visit = (node) => {
    if (ts.isIdentifier(node) && !(ts.isVariableDeclaration(node.parent) && node.parent.name === node) && roots.has(checker.getSymbolAtLocation(node)) && !allowed.some((boundary) => isInside(node, boundary)))
      throw new Error(`${repoPath} has an unsupported opaque use of its static Playwright config.`);
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
}
