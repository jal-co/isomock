import ts from "typescript";

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

function variableInitializer(node, checker, seen) {
  const value = unwrap(node);
  if (!checker || !ts.isIdentifier(value)) return undefined;
  let symbol = checker.getSymbolAtLocation(value);
  if (!symbol || seen.has(symbol)) return undefined;
  seen.add(symbol);
  if (symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
  return symbol?.declarations?.find(
    (declaration) => ts.isVariableDeclaration(declaration) && declaration.initializer,
  )?.initializer;
}

function resolvesToOne(node, checker, seen = new Set()) {
  const value = unwrap(node);
  if (ts.isNumericLiteral(value)) return value.text === "1";
  const initializer = variableInitializer(value, checker, seen);
  return Boolean(initializer && resolvesToOne(initializer, checker, seen));
}

function readsDiscriminator(
  node,
  checker,
  discriminator,
  resolveStaticString,
  seen = new Set(),
) {
  const value = unwrap(node);
  if (
    ts.isPropertyAccessExpression(value) &&
    value.name.text === discriminator
  ) return true;
  if (
    ts.isElementAccessExpression(value) && value.argumentExpression &&
    resolveStaticString(value.argumentExpression) === discriminator
  ) return true;
  const initializer = variableInitializer(value, checker, seen);
  return Boolean(
    initializer && readsDiscriminator(
      initializer,
      checker,
      discriminator,
      resolveStaticString,
      seen,
    ),
  );
}

export function hasToolcraftV1UpgradeFlow({
  checker,
  discriminator,
  resolveStaticString,
  sourceFile,
}) {
  let found = false;
  const visit = (node) => {
    if (
      ts.isElementAccessExpression(node) && node.argumentExpression &&
      readsDiscriminator(
        node.argumentExpression,
        checker,
        discriminator,
        resolveStaticString,
      )
    ) found = true;
    if (ts.isBinaryExpression(node)) {
      found ||=
        (readsDiscriminator(
          node.left,
          checker,
          discriminator,
          resolveStaticString,
        ) && resolvesToOne(node.right, checker)) ||
        (readsDiscriminator(
          node.right,
          checker,
          discriminator,
          resolveStaticString,
        ) && resolvesToOne(node.left, checker));
    }
    if (!found) ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}
