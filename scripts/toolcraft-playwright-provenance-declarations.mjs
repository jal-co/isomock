import ts from "typescript";

import { cloneProvenance as clone, equalProvenance as equal,
  getProvenanceAccessPath as accessPath, poisonProvenance as poison,
  unknownProvenance as unknown } from "./toolcraft-playwright-provenance-value.mjs";

const MAX_DECLARATION_ITERATIONS = 32;

export function predeclarePlaywrightProvenanceBindings(source, env) {
  for (const statement of source.statements) {
    if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) && statement.name) {
      env.set(statement.name.text, { imported: false, item: unknown(), moduleCell: true });
    }
    if (ts.isVariableStatement(statement)) for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name)) {
        env.set(declaration.name.text, { imported: false, item: unknown(), moduleCell: true });
      }
    }
  }
}

export function stabilizePlaywrightProvenanceDeclarations({ bind, env, evaluate, source }) {
  const reassigned = new Set(source.statements.flatMap((statement) => {
    if (!ts.isExpressionStatement(statement)) return [];
    const expression = statement.expression;
    if (ts.isBinaryExpression(expression) && expression.operatorToken.kind >= ts.SyntaxKind.FirstAssignment &&
      expression.operatorToken.kind <= ts.SyntaxKind.LastAssignment) return [accessPath(expression.left)?.root].filter(Boolean);
    if ((ts.isPrefixUnaryExpression(expression) || ts.isPostfixUnaryExpression(expression)) &&
      ts.isIdentifier(expression.operand)) return [expression.operand.text];
    if (ts.isCallExpression(expression) && ts.isPropertyAccessExpression(expression.expression) &&
      ["assign", "defineProperties", "defineProperty"].includes(expression.expression.name.text)) {
      return [accessPath(expression.arguments[0])?.root].filter(Boolean);
    }
    return [];
  }));
  const declarations = source.statements.flatMap((statement) => {
    if ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) && statement.name) {
      return reassigned.has(statement.name.text) ? [] : [{ initializer: statement, name: statement.name }];
    }
    if (ts.isVariableStatement(statement)) return statement.declarationList.declarations
      .filter((declaration) => ts.isIdentifier(declaration.name) && declaration.initializer &&
        !reassigned.has(declaration.name.text) &&
        (ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer) ||
          ts.isClassExpression(declaration.initializer)))
      .map((declaration) => ({ initializer: declaration.initializer, name: declaration.name }));
    return [];
  });
  for (let iteration = 0; iteration < MAX_DECLARATION_ITERATIONS; iteration += 1) {
    let changed = false;
    for (const declaration of declarations) {
      const previous = clone(env.get(declaration.name.text).item);
      bind(declaration.name, evaluate(declaration.initializer, true));
      changed ||= !equal(previous, env.get(declaration.name.text).item);
    }
    if (!changed) return;
  }
  for (const declaration of declarations) poison(env.get(declaration.name.text).item);
}
