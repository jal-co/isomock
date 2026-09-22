import { createToolcraftProductClassTextEvidence } from
  "./toolcraft-product-class-text-evidence.mjs";

const MAX_STATIC_CLASS_DEPTH = 12;

export function createToolcraftProductClassValueEvidence({
  checker,
  flowValues,
  resolveStaticString,
  ts,
}) {
  function unwrap(node) {
    let current = node;
    while (ts.isAsExpression(current) || ts.isNonNullExpression(current) ||
      ts.isParenthesizedExpression(current) ||
      ts.isSatisfiesExpression(current) ||
      ts.isTypeAssertionExpression(current)) current = current.expression;
    return current;
  }

  function importedModule(declaration) {
    for (let current = declaration; current; current = current.parent) {
      if (ts.isImportDeclaration(current) &&
        ts.isStringLiteralLike(current.moduleSpecifier)) {
        return current.moduleSpecifier.text;
      }
      if (ts.isSourceFile(current)) return undefined;
    }
    return undefined;
  }

  function cssModuleNamespace(expression) {
    const node = unwrap(expression);
    if (!ts.isIdentifier(node)) return undefined;
    const symbol = checker.getSymbolAtLocation(node);
    return (symbol?.declarations ?? []).map(importedModule).find((specifier) =>
      specifier?.endsWith(".module.css")
    );
  }

  function staticCssModuleMember(expression) {
    const node = unwrap(expression);
    if (ts.isPropertyAccessExpression(node)) {
      const specifier = cssModuleNamespace(node.expression);
      return specifier && { className: node.name.text, specifier };
    }
    if (!ts.isElementAccessExpression(node)) return undefined;
    const className = singleTextValue(node.argumentExpression);
    const specifier = cssModuleNamespace(node.expression);
    return className !== undefined && specifier
      ? { className, specifier }
      : undefined;
  }

  function importedClassHelperSymbol(symbol, visited = new Set()) {
    if (!symbol || visited.has(symbol)) return false;
    const nextVisited = new Set(visited).add(symbol);
    if ((symbol.flags & ts.SymbolFlags.Alias) !== 0) {
      const target = checker.getAliasedSymbol(symbol);
      if (target && importedClassHelperSymbol(target, nextVisited)) return true;
    }
    return (symbol.declarations ?? []).some((declaration) =>
      ["clsx", "clsx/lite", "tailwind-merge"].includes(
        importedModule(declaration),
      )
    );
  }

  function helperBody(declaration) {
    const body = declaration.body;
    if (!body) return undefined;
    if (!ts.isBlock(body)) return body;
    const statements = body.statements.filter((statement) =>
      !ts.isEmptyStatement(statement)
    );
    return statements.length === 1 && ts.isReturnStatement(statements[0])
      ? statements[0].expression
      : undefined;
  }

  function canonicalHelperFunction(declaration) {
    if (!ts.isFunctionLike(declaration)) return false;
    const parameters = new Set(declaration.parameters.flatMap((parameter) =>
      ts.isIdentifier(parameter.name)
        ? [checker.getSymbolAtLocation(parameter.name)]
        : []
    ));
    function valid(expression) {
      const node = unwrap(expression);
      if (ts.isIdentifier(node)) {
        return parameters.has(checker.getSymbolAtLocation(node));
      }
      if (ts.isArrayLiteralExpression(node)) {
        return node.elements.every((element) => valid(
          ts.isSpreadElement(element) ? element.expression : element,
        ));
      }
      return ts.isCallExpression(node) &&
        importedClassHelperSymbol(checker.getSymbolAtLocation(node.expression)) &&
        node.arguments.every(valid);
    }
    const body = helperBody(declaration);
    return Boolean(body && valid(body));
  }

  function classHelperSymbol(symbol, visited = new Set()) {
    if (!symbol || visited.has(symbol)) return false;
    const nextVisited = new Set(visited).add(symbol);
    if ((symbol.flags & ts.SymbolFlags.Alias) !== 0) {
      const target = checker.getAliasedSymbol(symbol);
      if (target && classHelperSymbol(target, nextVisited)) return true;
    }
    for (const declaration of symbol.declarations ?? []) {
      if (["clsx", "clsx/lite", "tailwind-merge"].includes(
        importedModule(declaration),
      )) {
        return true;
      }
      if (ts.isVariableDeclaration(declaration) && declaration.initializer &&
        (classHelperExpression(declaration.initializer, nextVisited) ||
          canonicalHelperFunction(declaration.initializer))) return true;
      if (canonicalHelperFunction(declaration)) return true;
    }
    return false;
  }

  function classHelperExpression(expression, visited = new Set()) {
    const node = unwrap(expression);
    return ts.isIdentifier(node) && classHelperSymbol(
      checker.getSymbolAtLocation(node), visited,
    );
  }

  function staticBoolean(expression) {
    const node = unwrap(expression);
    if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
    if (node.kind === ts.SyntaxKind.FalseKeyword ||
      node.kind === ts.SyntaxKind.NullKeyword ||
      ts.isIdentifier(node) && node.text === "undefined") return false;
    return undefined;
  }

  function mergeClassEvidence(values) {
    if (values.some(({ kind }) => kind === "unknown")) {
      return { kind: "unknown" };
    }
    return {
      cssClasses: values.flatMap(({ cssClasses = [] }) => cssClasses),
      kind: "tokens",
      tokens: values.flatMap(({ tokens = [] }) => tokens),
    };
  }

  const staticTextValues = createToolcraftProductClassTextEvidence({
    checker, flowValues, resolveStaticString, ts, unwrap,
  });
  function singleTextValue(expression) {
    const values = staticTextValues(expression);
    return values?.length === 1 ? values[0] : undefined;
  }

  function staticPropertyName(node) {
    if (ts.isIdentifier(node) || ts.isStringLiteralLike(node) ||
      ts.isNumericLiteral(node)) return node.text.toLowerCase();
    return ts.isComputedPropertyName(node)
      ? singleTextValue(node.expression)?.toLowerCase()
      : undefined;
  }

  function classEvidence(expression, depth = 0, visited = new Set()) {
    if (depth >= MAX_STATIC_CLASS_DEPTH) return { kind: "unknown" };
    const node = unwrap(expression);
    const texts = staticTextValues(node);
    if (texts) {
      return { kind: "tokens", tokens: texts.flatMap((text) =>
        text.split(/\s+/u).filter(Boolean)
      ) };
    }
    const boolean = staticBoolean(node);
    if (boolean !== undefined) return { kind: "tokens", tokens: [] };
    const cssModule = staticCssModuleMember(node);
    if (cssModule) {
      return { cssClasses: [cssModule], kind: "tokens", tokens: [] };
    }
    if (ts.isIdentifier(node) || ts.isPropertyAccessExpression(node) ||
      ts.isElementAccessExpression(node)) {
      const fact = flowValues.valueAt(node, expression);
      if (fact.kind === "exact" &&
        !(fact.values.length === 1 && fact.values[0] === node)) {
        return mergeClassEvidence(fact.values.map((value) =>
          classEvidence(value, depth + 1, new Set(visited))
        ));
      }
      if (fact.kind === "unknown") return { kind: "unknown" };
    }
    const flowControlled = ts.isConditionalExpression(node) ||
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken;
    if (flowControlled) {
      const fact = flowValues.resultAt(node, expression);
      return fact.kind === "exact"
        ? mergeClassEvidence(fact.values.map((value) =>
          classEvidence(value, depth + 1, new Set(visited))
        ))
        : { kind: "unknown" };
    }
    if (ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
      return staticBoolean(node.left) === false
        ? { kind: "tokens", tokens: [] }
        : classEvidence(node.right, depth + 1, new Set(visited));
    }
    if (ts.isArrayLiteralExpression(node)) {
      return mergeClassEvidence(node.elements.map((element) =>
        classEvidence(
          ts.isSpreadElement(element) ? element.expression : element,
          depth + 1,
          new Set(visited),
        )
      ));
    }
    if (ts.isObjectLiteralExpression(node)) {
      const values = [];
      for (const property of node.properties) {
        if (ts.isSpreadAssignment(property)) {
          values.push(classEvidence(
            property.expression, depth + 1, new Set(visited),
          ));
          continue;
        }
        if (!property.name || (!ts.isPropertyAssignment(property) &&
          !ts.isShorthandPropertyAssignment(property))) {
          return { kind: "unknown" };
        }
        const name = staticPropertyName(property.name);
        if (!name) return { kind: "unknown" };
        const value = ts.isPropertyAssignment(property)
          ? property.initializer : property.name;
        if (staticBoolean(value) !== false) {
          values.push({ kind: "tokens", tokens: name.split(/\s+/u) });
        }
      }
      return mergeClassEvidence(values);
    }
    if (ts.isCallExpression(node) &&
      classHelperExpression(node.expression, visited)) {
      return mergeClassEvidence(node.arguments.map((argument) =>
        classEvidence(argument, depth + 1, new Set(visited))
      ));
    }
    return { kind: "unknown" };
  }

  return classEvidence;
}
