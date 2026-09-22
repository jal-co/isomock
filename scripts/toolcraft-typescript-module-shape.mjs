import {
  collectToolcraftTypeScriptModuleBindings,
  createToolcraftTypeScriptChecker,
  getToolcraftTypeScriptImportedCallTarget,
  unwrapToolcraftTypeScriptExpression,
} from "./toolcraft-typescript-analysis.mjs";

function hasModifier(node, kind) {
  return node.modifiers?.some((modifier) => modifier.kind === kind);
}

function getCallableReturnExpression(fn, ts) {
  if (ts.isArrowFunction(fn) && !ts.isBlock(fn.body)) return fn.body;
  const [statement] = fn.body?.statements ?? [];
  return fn.body?.statements.length === 1 &&
    statement &&
    ts.isReturnStatement(statement)
    ? statement.expression
    : undefined;
}

function getSingleExportedCallable(statements, ts) {
  if (statements.length !== 1) return undefined;
  const [statement] = statements;
  if (
    ts.isFunctionDeclaration(statement) &&
    hasModifier(statement, ts.SyntaxKind.ExportKeyword)
  ) {
    return statement;
  }
  if (
    !ts.isVariableStatement(statement) ||
    !hasModifier(statement, ts.SyntaxKind.ExportKeyword) ||
    (statement.declarationList.flags & ts.NodeFlags.Const) === 0 ||
    statement.declarationList.declarations.length !== 1
  ) {
    return undefined;
  }
  const [declaration] = statement.declarationList.declarations;
  const initializer = declaration.initializer &&
    unwrapToolcraftTypeScriptExpression(declaration.initializer, ts);
  return initializer &&
    (ts.isArrowFunction(initializer) ||
      ts.isFunctionExpression(initializer))
    ? initializer
    : undefined;
}

function getForwardedCall(fn, expression, ts) {
  let normalized =
    unwrapToolcraftTypeScriptExpression(expression, ts);
  while (
    ts.isAwaitExpression(normalized) &&
    hasModifier(fn, ts.SyntaxKind.AsyncKeyword)
  ) {
    normalized = unwrapToolcraftTypeScriptExpression(
      normalized.expression,
      ts,
    );
  }
  return ts.isCallExpression(normalized) ? normalized : undefined;
}

function isIdentityFacade(fn, expression, ts) {
  const normalized =
    unwrapToolcraftTypeScriptExpression(expression, ts);
  const parameter = fn.parameters[0];
  return (
    fn.parameters.length === 1 &&
    parameter &&
    !parameter.dotDotDotToken &&
    !parameter.initializer &&
    ts.isIdentifier(parameter.name) &&
    ts.isIdentifier(normalized) &&
    normalized.text === parameter.name.text
  );
}

function forwardsParameter(argument, parameter, ts) {
  if (parameter.initializer || !ts.isIdentifier(parameter.name)) {
    return false;
  }
  if (parameter.dotDotDotToken) {
    return (
      ts.isSpreadElement(argument) &&
      ts.isIdentifier(argument.expression) &&
      argument.expression.text === parameter.name.text
    );
  }
  return (
    ts.isIdentifier(argument) &&
    argument.text === parameter.name.text
  );
}

function isImportedForwardingFacade({
  bindings,
  checker,
  expression,
  fn,
  ts,
}) {
  if (fn.asteriskToken) return false;
  const call = getForwardedCall(fn, expression, ts);
  return (
    call &&
    getToolcraftTypeScriptImportedCallTarget({
      bindings,
      checker,
      expression: call.expression,
      ts,
    }) &&
    call.arguments.length === fn.parameters.length &&
    fn.parameters.every((parameter, index) =>
      forwardsParameter(call.arguments[index], parameter, ts),
    )
  );
}

export function getToolcraftTypeScriptModuleShape(
  sourceFile,
  ts,
  options = {},
) {
  const checker =
    options.checker ??
    createToolcraftTypeScriptChecker(sourceFile, ts);
  const bindings =
    options.bindings ??
    collectToolcraftTypeScriptModuleBindings(
      sourceFile,
      ts,
      checker,
    );
  const statements = sourceFile.statements.filter(
    (statement) => !ts.isImportDeclaration(statement),
  );
  if (statements.length === 0) return "empty";
  if (statements.every((statement) => ts.isExportDeclaration(statement))) {
    return "reexport-only";
  }
  const fn = getSingleExportedCallable(statements, ts);
  if (!fn || fn.asteriskToken) return "behavior";
  const expression = getCallableReturnExpression(fn, ts);
  if (!expression) return "behavior";
  if (isIdentityFacade(fn, expression, ts)) return "identity-facade";
  return isImportedForwardingFacade({
    bindings,
    checker,
    expression,
    fn,
    ts,
  })
    ? "forwarding-facade"
    : "behavior";
}
