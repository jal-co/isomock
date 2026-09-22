import { createToolcraftTypeScriptCallableInventory } from "./toolcraft-typescript-callables.mjs";

export function createToolcraftTypeScriptProgram({
  host,
  options,
  rootNames,
  ts,
}) {
  return ts.createProgram({ host, options, rootNames });
}

function hasModifier(node, kind) {
  return node.modifiers?.some((modifier) => modifier.kind === kind);
}

function freezeFacts(facts) {
  return Object.freeze(
    facts.map((fact) => Object.freeze({ ...fact })),
  );
}

export function createToolcraftTypeScriptChecker(sourceFile, ts) {
  const compilerOptions = {
    allowJs: true,
    noLib: true,
    noResolve: true,
    target: ts.ScriptTarget.Latest,
  };
  const defaultHost = ts.createCompilerHost(compilerOptions);
  const host = {
    ...defaultHost,
    fileExists: (fileName) => fileName === sourceFile.fileName,
    getSourceFile: (fileName) =>
      fileName === sourceFile.fileName ? sourceFile : undefined,
    readFile: (fileName) =>
      fileName === sourceFile.fileName ? sourceFile.text : undefined,
    writeFile: () => undefined,
  };
  return ts
    .createProgram([sourceFile.fileName], compilerOptions, host)
    .getTypeChecker();
}

export function unwrapToolcraftTypeScriptExpression(node, ts) {
  let current = node;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isSatisfiesExpression(current) ||
    ts.isNonNullExpression(current)
  ) {
    current = current.expression;
  }
  return current;
}

function collectBindingNames(name, names, ts) {
  if (ts.isIdentifier(name)) {
    names.push(name);
    return;
  }
  for (const element of name.elements) {
    if (!ts.isOmittedExpression(element)) {
      collectBindingNames(element.name, names, ts);
    }
  }
}

export function collectToolcraftTypeScriptModuleBindings(
  sourceFile,
  ts,
  checker = createToolcraftTypeScriptChecker(sourceFile, ts),
  callables = createToolcraftTypeScriptCallableInventory({
    checker,
    sourceFile,
    ts,
    unwrapExpression: unwrapToolcraftTypeScriptExpression,
  }),
) {
  const exportedCallableBindings = [];
  const exportedRuntimeBindings = new Set();
  const importedBindingSymbols = [];
  const importedRuntimeBindings = [];
  function addExport(exportedName, symbol) {
    exportedRuntimeBindings.add(exportedName);
    const callable = symbol && callables.getBySymbol(symbol);
    if (callable) {
      exportedCallableBindings.push({
        callableId: callable.callableId,
        exportedName,
      });
    }
  }
  function addImport(specifier, importedName, localNode) {
    const localName = localNode.text;
    const binding = Object.freeze({
      importedName,
      localName,
      specifier,
    });
    importedRuntimeBindings.push(binding);
    const symbol = checker.getSymbolAtLocation(localNode);
    if (symbol) {
      importedBindingSymbols.push(Object.freeze({ binding, symbol }));
    }
  }
  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement)) {
      const clause = statement.importClause;
      if (clause?.isTypeOnly) continue;
      const specifier = ts.isStringLiteralLike(statement.moduleSpecifier)
        ? statement.moduleSpecifier.text
        : undefined;
      if (!specifier) continue;
      if (clause?.name) addImport(specifier, "default", clause.name);
      const named = clause?.namedBindings;
      if (named && ts.isNamespaceImport(named)) {
        addImport(specifier, "*", named.name);
      } else if (named && ts.isNamedImports(named)) {
        for (const element of named.elements) {
          if (!element.isTypeOnly) {
            addImport(
              specifier,
              element.propertyName?.text ?? element.name.text,
              element.name,
            );
          }
        }
      }
      continue;
    }
    if (hasModifier(statement, ts.SyntaxKind.ExportKeyword)) {
      if (
        (ts.isFunctionDeclaration(statement) ||
          ts.isClassDeclaration(statement)) &&
        statement.name
      ) {
        addExport(
          statement.name.text,
          checker.getSymbolAtLocation(statement.name),
        );
      } else if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          const names = [];
          collectBindingNames(declaration.name, names, ts);
          for (const name of names) {
            addExport(
              name.text,
              checker.getSymbolAtLocation(name),
            );
          }
        }
      }
    }
    if (
      ts.isExportDeclaration(statement) &&
      statement.exportClause &&
      ts.isNamedExports(statement.exportClause) &&
      !statement.isTypeOnly
    ) {
      const specifier =
        statement.moduleSpecifier &&
        ts.isStringLiteralLike(statement.moduleSpecifier)
          ? statement.moduleSpecifier.text
          : undefined;
      for (const element of statement.exportClause.elements) {
        if (element.isTypeOnly) continue;
        const importedName =
          element.propertyName?.text ?? element.name.text;
        if (specifier) {
          addExport(element.name.text);
          importedRuntimeBindings.push({
            importedName,
            localName: element.name.text,
            specifier,
          });
        } else {
          addExport(
            element.name.text,
            checker.getExportSpecifierLocalTargetSymbol(element),
          );
        }
      }
    }
  }
  return Object.freeze({
    callables,
    exportedCallableBindings: freezeFacts(
      exportedCallableBindings,
    ),
    exportedRuntimeBindings: Object.freeze(
      [...exportedRuntimeBindings].sort(),
    ),
    importedBindingSymbols: Object.freeze(importedBindingSymbols),
    importedRuntimeBindings: freezeFacts(importedRuntimeBindings),
  });
}

function getStaticAccessPath(expression, ts) {
  let current = unwrapToolcraftTypeScriptExpression(expression, ts);
  const members = [];
  while (
    ts.isPropertyAccessExpression(current) ||
    ts.isElementAccessExpression(current)
  ) {
    if (ts.isPropertyAccessExpression(current)) {
      members.unshift(current.name.text);
    } else {
      const argument = current.argumentExpression &&
        unwrapToolcraftTypeScriptExpression(
          current.argumentExpression,
          ts,
        );
      if (
        !argument ||
        (!ts.isStringLiteralLike(argument) &&
          !ts.isNoSubstitutionTemplateLiteral(argument))
      ) {
        return undefined;
      }
      members.unshift(argument.text);
    }
    current = unwrapToolcraftTypeScriptExpression(
      current.expression,
      ts,
    );
  }
  return ts.isIdentifier(current)
    ? { members, root: current }
    : undefined;
}

export function getToolcraftTypeScriptImportedCallTarget({
  bindings,
  checker,
  expression,
  ts,
}) {
  const access = getStaticAccessPath(expression, ts);
  if (!access) return undefined;
  const symbol = checker.getSymbolAtLocation(access.root);
  const importedSymbol = symbol &&
    bindings.importedBindingSymbols.find(
      (binding) => binding.symbol === symbol,
    );
  if (!importedSymbol) return undefined;
  const { binding } = importedSymbol;
  if (
    !binding ||
    (binding.importedName === "*" && access.members.length === 0)
  ) {
    return undefined;
  }
  return Object.freeze({
    importedName: binding.importedName,
    localName: binding.localName,
    memberPath: access.members.join("."),
    operation: access.members.at(-1) ?? binding.importedName,
    specifier: binding.specifier,
  });
}

function getCallerExportNames(callable, bindings) {
  if (!callable) return Object.freeze([]);
  return Object.freeze(
    [
      ...new Set(
        bindings.exportedCallableBindings
          .filter(
            (binding) =>
              binding.callableId === callable.callableId,
          )
          .map((binding) => binding.exportedName),
      ),
    ].sort(),
  );
}

function getLocalCallTarget(expression, bindings, checker, ts) {
  const callee = unwrapToolcraftTypeScriptExpression(expression, ts);
  if (!ts.isIdentifier(callee)) return undefined;
  const symbol = checker.getSymbolAtLocation(callee);
  return symbol && bindings.callables.getBySymbol(symbol);
}

export function collectToolcraftTypeScriptCallTargets({
  bindings,
  checker,
  sourceFile,
  ts,
}) {
  const importedKeys = new Set();
  const importedCallTargets = [];
  const localKeys = new Set();
  const localCallTargets = [];
  function visit(node) {
    if (ts.isCallExpression(node)) {
      const caller = bindings.callables.getEnclosing(node);
      const importedTarget = getToolcraftTypeScriptImportedCallTarget({
        bindings,
        checker,
        expression: node.expression,
        ts,
      });
      if (importedTarget) {
        const fact = Object.freeze({
          ...importedTarget,
          callerCallableId: caller?.callableId ?? null,
          callerExportNames: getCallerExportNames(caller, bindings),
        });
        const key = JSON.stringify(fact);
        if (!importedKeys.has(key)) {
          importedKeys.add(key);
          importedCallTargets.push(fact);
        }
      }
      const callee = getLocalCallTarget(
        node.expression,
        bindings,
        checker,
        ts,
      );
      if (caller && callee) {
        const fact = Object.freeze({
          calleeCallableId: callee.callableId,
          callerCallableId: caller.callableId,
        });
        const key = JSON.stringify(fact);
        if (!localKeys.has(key)) {
          localKeys.add(key);
          localCallTargets.push(fact);
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return Object.freeze({
    importedCallTargets: Object.freeze(importedCallTargets),
    localCallTargets: Object.freeze(localCallTargets),
  });
}
