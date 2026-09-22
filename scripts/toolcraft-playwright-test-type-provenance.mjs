import ts from "typescript";
import { parseToolcraftTypeScriptSource } from "./toolcraft-typescript-source-evidence.mjs";
import { evaluatePlaywrightProvenanceClass } from "./toolcraft-playwright-provenance-class.mjs";
import { interpretPlaywrightProvenanceStatements } from "./toolcraft-playwright-provenance-statements.mjs";
import { interpretPlaywrightProvenanceMutation } from "./toolcraft-playwright-provenance-mutation.mjs";
import { predeclarePlaywrightProvenanceBindings, stabilizePlaywrightProvenanceDeclarations } from "./toolcraft-playwright-provenance-declarations.mjs";
import { createPlaywrightNamespace, createPlaywrightProvenanceEffects, evaluatePlaywrightProvenanceCall, evaluatePlaywrightProxyConstruction, evaluatePlaywrightReflectInvocation, isTrustedPlaywrightExternalSpecifier, readPlaywrightIntrinsicMember } from "./toolcraft-playwright-provenance-effects.mjs";
import { AUTHORITY, SAFE, UNKNOWN, authorityProvenance as authority, cloneProvenance, computedKey, equalProvenance as equal, getProvenanceAccessPath as accessPath, hasProvenanceParameter,
  joinProvenance as join, poisonProvenance as poison, propertyKey, provenanceValue as value, rankProvenance as rank, readProvenanceMember as member, retargetClonedProvenanceWrites, safeProvenance as safe,
  unknownProvenance as unknown, substituteProvenanceParameters as substituteParameters, tagProvenance as tagged, unwrapExpression as unwrap, writeProvenancePath } from "./toolcraft-playwright-provenance-value.mjs";
const MAX_NODES = 100_000, MAX_ITERATIONS = 256;
function analyzeModule({ source, dependency, budget, trustedFacadePath }, exportsByPath, collectConsumption = false) {
  const env = new Map(), exports = new Map(), consumed = [], exportedBindings = new Map(), dependencyViews = new Map();
  const { applyCallWrites, begin: beginEffects, end: endEffects, recordWrite } = createPlaywrightProvenanceEffects(env);
  predeclarePlaywrightProvenanceBindings(source, env);
  const tick = (node) => {
    if (budget.visitedNodes.has(node)) return node;
    budget.visitedNodes.add(node);
    if (++budget.nodes > MAX_NODES) throw new Error("Playwright authority provenance node budget exceeded; authority is unknown.");
    return node;
  };
  const mark = (binding, item, node) => {
    if (collectConsumption && (binding?.imported || item.target) && rank(item) !== SAFE) consumed.push({ node, target: item.target ?? binding?.target });
    return item;
  };
  const bind = (pattern, item, imported = Boolean(item.target), target = item.target) => {
    if (ts.isIdentifier(pattern)) {
      const existing = env.get(pattern.text);
      if (existing?.moduleCell || (existing?.scopedCell && existing.item.capturedCell)) {
        writeProvenancePath(existing.item, [], item);
        Object.assign(existing, { imported, target });
      } else env.set(pattern.text, { item, imported, target });
      for (const exportName of exportedBindings.get(pattern.text) ?? []) exports.set(exportName, item);
    }
    else if (ts.isObjectBindingPattern(pattern)) for (const element of pattern.elements) {
      bind(element.name, element.dotDotDotToken || element.initializer ? unknown() : readPlaywrightIntrinsicMember(item, propertyKey(element.propertyName ?? element.name)), imported, target);
    } else if (ts.isArrayBindingPattern(pattern)) pattern.elements.forEach((element, index) => {
      if (ts.isBindingElement(element)) bind(element.name, element.dotDotDotToken || element.initializer ? unknown() : member(item, String(index)), imported, target);
    });
  };
  const trackExport = (localName, exportName = localName) => {
    const names = exportedBindings.get(localName) ?? new Set();
    names.add(exportName); exportedBindings.set(localName, names);
  };
  const mutate = (left, assigned) => {
    const path = accessPath(left);
    const binding = path && env.get(path.root);
    if (!binding) return false;
    if (path.keys.some((key) => key === undefined)) { poison(binding.item); return true; }
    if (path.keys.length === 0) { bind(ts.factory.createIdentifier(path.root), assigned); return true; }
    let owner = binding.item;
    for (const key of path.keys.slice(0, -1)) {
      let next = owner.members.get(key);
      if (!next) { next = value(SAFE, SAFE, new Map(), true); owner.members.set(key, next); }
      owner = next;
    }
    owner.members.set(path.keys.at(-1), assigned);
    return true;
  };
  const namespaceFor = (specifier) => {
    const target = dependency(specifier);
    const targetExports = target && exportsByPath.get(target);
    let viewedExports = targetExports;
    if (targetExports && !dependencyViews.has(target)) {
      const seen = new Map();
      const view = new Map([...targetExports].map(([key, item]) => [key, cloneProvenance(item, seen)]));
      for (const item of view.values()) retargetClonedProvenanceWrites(item, seen);
      if (target === trustedFacadePath) for (const item of view.values()) item.target = target;
      dependencyViews.set(target, view);
    }
    if (targetExports) viewedExports = dependencyViews.get(target);
    const namespace = specifier === "@playwright/test" ? createPlaywrightNamespace() : targetExports
      ? value(SAFE, SAFE, new Map(viewedExports), true, target) : target
      ? value(SAFE, SAFE, new Map(), true, target) : isTrustedPlaywrightExternalSpecifier(specifier) ? safe() : unknown();
    return { namespace, target };
  };
  const evaluate = (input, markUse = true) => {
    const node = tick(unwrap(input));
    if (ts.isIdentifier(node)) {
      const binding = env.get(node.text), intrinsic = ["Proxy", "Reflect", "globalThis", "global"].includes(node.text)
        ? tagged(safe(), `global:${node.text}`) : safe();
      return markUse ? mark(binding, binding?.item ?? intrinsic, node) : binding?.item ?? intrinsic;
    }
    if (ts.isStringLiteralLike(node) || ts.isNumericLiteral(node) || [ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword, ts.SyntaxKind.NullKeyword].includes(node.kind)) return safe();
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      const ownerNode = unwrap(node.expression), owner = evaluate(ownerNode, false);
      const item = readPlaywrightIntrinsicMember(owner, ts.isPropertyAccessExpression(node) ? node.name.text : computedKey(node.argumentExpression));
      return ts.isIdentifier(ownerNode) ? mark(env.get(ownerNode.text), item, node) :
        mark({ imported: Boolean(item.target), target: item.target }, item, node);
    }
    if (ts.isObjectLiteralExpression(node)) {
      let result = safe();
      for (const property of node.properties) {
        if (ts.isSpreadAssignment(property)) {
          const spread = evaluate(property.expression);
          if (spread.state === UNKNOWN) result = join(result, unknown());
          else for (const [key, item] of spread.members) result.members.set(key, item);
        } else if (ts.isPropertyAssignment(property)) {
          const key = propertyKey(property.name);
          if (key === undefined) result = join(result, unknown()); else result.members.set(key, evaluate(property.initializer));
        } else if (ts.isShorthandPropertyAssignment(property)) result.members.set(property.name.text, evaluate(property.name));
        else result = join(result, unknown());
      }
      return result;
    }
    if (ts.isArrayLiteralExpression(node)) {
      const result = safe();
      node.elements.forEach((element, index) => result.members.set(String(index), ts.isSpreadElement(element) ? unknown() : evaluate(element)));
      return result;
    }
    if (ts.isClassExpression(node) || ts.isClassDeclaration(node)) {
      return evaluatePlaywrightProvenanceClass({ bind, env, evaluate, mutate, node });
    }
    if (ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node) || ts.isGetAccessorDeclaration(node)) {
      const previous = new Map(env);
      const capturedNames = new Set(env.keys());
      const clones = new Map();
      for (const binding of previous.values()) binding.item.capturedCell = true;
      env.clear();
      for (const [name, binding] of previous) env.set(name, { ...binding, item: cloneProvenance(binding.item, clones) });
      node.parameters.forEach((parameter, index) =>
        bind(parameter.name, { ...safe(), parameterIndex: index, parameterRest: Boolean(parameter.dotDotDotToken) }));
      const effects = beginEffects(previous, clones);
      const returned = node.body && ts.isBlock(node.body)
        ? interpretPlaywrightProvenanceStatements({ bind, capturedNames, effects, env, evaluate, mutate,
          recordEvaluatedEffects: effects.recordEvaluatedEffects,
          recordExecution: effects.recordExecution, recordWrite, statements: node.body.statements, tick })
        : node.body ? evaluate(node.body) : safe();
      if (node.body && !ts.isBlock(node.body) &&
        (ts.isCallExpression(unwrap(node.body)) || ts.isTaggedTemplateExpression(unwrap(node.body)))) effects.recordExecution(returned, node.body);
      endEffects();
      const summaryReturn = returned;
      const returnsParameter = hasProvenanceParameter(summaryReturn);
      env.clear(); for (const pair of previous) env.set(...pair);
      const result = value(SAFE, effects.execution, new Map(), true, summaryReturn.target, returnsParameter, undefined, summaryReturn);
      result.executionEffect = effects.execution; result.invokedParameters = effects.invokedParameters; result.writes = effects.writes;
      result.invokedCallables = effects.invokedCallables;
      return result;
    }
    if (ts.isCallExpression(node)) {
      const mutation = interpretPlaywrightProvenanceMutation({ bind, env, evaluate, input: node, mutate, recordWrite }); if (mutation.handled) return mutation.value;
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const specifier = node.arguments.length === 1 && ts.isStringLiteralLike(node.arguments[0]) ? node.arguments[0].text : undefined;
      return specifier ? namespaceFor(specifier).namespace : unknown();
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "require") {
      const specifier = node.arguments.length === 1 && ts.isStringLiteralLike(node.arguments[0]) ? node.arguments[0].text : undefined;
      return specifier ? namespaceFor(specifier).namespace : unknown();
    }
    if (ts.isNewExpression(node)) {
      const constructor = evaluate(node.expression);
      const argumentsValues = (node.arguments ?? []).map((argument) =>
        evaluate(argument, Boolean(constructor.instance && hasProvenanceParameter(constructor.instance))));
      const proxy = evaluatePlaywrightProxyConstruction({ argumentsValues, constructor, evaluate, mark, markUse, node });
      if (proxy) return proxy;
      return constructor.instance
        ? tagged(substituteParameters(constructor.instance, argumentsValues), constructor.target)
        : constructor.state === SAFE && constructor.call === SAFE ? safe() : unknown();
    }
    if (ts.isCallExpression(node)) {
      const callee = evaluate(node.expression, false);
      const reflected = evaluatePlaywrightReflectInvocation({ applyCallWrites, callee, evaluate, mark, node });
      if (reflected) return reflected;
      return evaluatePlaywrightProvenanceCall({ applyCallWrites, evaluate, mark, markUse, node, trustedFacadePath });
    }
    if (ts.isConditionalExpression(node)) return join(evaluate(node.whenTrue), evaluate(node.whenFalse));
    if (ts.isBinaryExpression(node)) {
      const booleanOperators = new Set([
        ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken,
        ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.LessThanToken, ts.SyntaxKind.LessThanEqualsToken,
        ts.SyntaxKind.GreaterThanToken, ts.SyntaxKind.GreaterThanEqualsToken, ts.SyntaxKind.InKeyword, ts.SyntaxKind.InstanceOfKeyword,
      ]);
      if (booleanOperators.has(node.operatorToken.kind)) { evaluate(node.left, false); evaluate(node.right, false); return safe(); }
      const primitiveOperators = new Set([
        ts.SyntaxKind.PlusToken, ts.SyntaxKind.MinusToken, ts.SyntaxKind.AsteriskToken,
        ts.SyntaxKind.SlashToken, ts.SyntaxKind.PercentToken, ts.SyntaxKind.AsteriskAsteriskToken,
        ts.SyntaxKind.AmpersandToken, ts.SyntaxKind.BarToken, ts.SyntaxKind.CaretToken,
        ts.SyntaxKind.LessThanLessThanToken, ts.SyntaxKind.GreaterThanGreaterThanToken,
        ts.SyntaxKind.GreaterThanGreaterThanGreaterThanToken,
      ]);
      if (primitiveOperators.has(node.operatorToken.kind)) { evaluate(node.left, false); evaluate(node.right, false); return safe(); }
      return join(evaluate(node.left), evaluate(node.right));
    }
    if (ts.isPrefixUnaryExpression(node) && node.operator === ts.SyntaxKind.ExclamationToken) { evaluate(node.operand, false); return safe(); }
    if (ts.isPrefixUnaryExpression(node) && [ts.SyntaxKind.PlusToken, ts.SyntaxKind.MinusToken, ts.SyntaxKind.TildeToken].includes(node.operator)) {
      evaluate(node.operand, false); return safe();
    }
    if (ts.isTypeOfExpression(node)) { evaluate(node.expression, false); return safe(); }
    if (ts.isVoidExpression(node) || ts.isDeleteExpression(node)) {
      const operand = evaluate(node.expression);
      const result = safe(); result.executionEffect = operand.executionEffect ?? SAFE; return result;
    }
    if (ts.isTaggedTemplateExpression(node)) {
      const tag = evaluate(node.tag, false);
      if (tag.call !== SAFE) mark({ imported: Boolean(tag.target), target: tag.target }, tag, node.tag);
      const result = unknown(); result.executionEffect = Math.max(tag.state, tag.call); return result;
    }
    if (ts.isAwaitExpression(node) || ts.isYieldExpression(node) || ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node) || ts.isTypeOfExpression(node)) return evaluate(node.operand ?? node.expression);
    if (ts.isTemplateExpression(node) || ts.isNoSubstitutionTemplateLiteral(node)) return safe();
    return unknown();
  };
  const isExported = (node) => node.modifiers?.some(({ kind }) => kind === ts.SyntaxKind.ExportKeyword);
  for (const statement of source.statements) {
    tick(statement);
    if (ts.isImportEqualsDeclaration(statement) && !statement.isTypeOnly && ts.isExternalModuleReference(statement.moduleReference) &&
      statement.moduleReference.expression && ts.isStringLiteralLike(statement.moduleReference.expression)) {
      const { namespace, target } = namespaceFor(statement.moduleReference.expression.text);
      bind(statement.name, namespace, true, target);
      if (isExported(statement)) exports.set(statement.name.text, namespace);
      continue;
    }
    if (ts.isImportDeclaration(statement) && ts.isStringLiteralLike(statement.moduleSpecifier) && statement.importClause && !statement.importClause.isTypeOnly) {
      const specifier = statement.moduleSpecifier.text;
      const { namespace, target } = namespaceFor(specifier);
      if (statement.importClause.name) bind(statement.importClause.name, specifier === "@playwright/test" ? unknown() : member(namespace, "default"), true, target);
      const bindings = statement.importClause.namedBindings;
      if (bindings && ts.isNamespaceImport(bindings)) bind(bindings.name, namespace, true, target);
      if (bindings && ts.isNamedImports(bindings)) for (const item of bindings.elements) if (!item.isTypeOnly) bind(item.name, member(namespace, item.propertyName?.text ?? item.name.text), true, target);
      continue;
    }
    if (ts.isVariableStatement(statement)) for (const declaration of statement.declarationList.declarations) {
      const item = declaration.initializer
        ? evaluate(declaration.initializer, ts.isIdentifier(declaration.name))
        : unknown();
      bind(declaration.name, item);
      if (isExported(statement) && ts.isIdentifier(declaration.name)) {
        trackExport(declaration.name.text); exports.set(declaration.name.text, env.get(declaration.name.text).item);
      }
    }
    if (ts.isFunctionDeclaration(statement) && statement.name) {
      const item = evaluate(statement); bind(statement.name, item); if (isExported(statement)) { trackExport(statement.name.text); exports.set(statement.name.text, env.get(statement.name.text).item); }
    }
    if (ts.isClassDeclaration(statement) && statement.name) {
      const item = evaluate(statement); bind(statement.name, item); if (isExported(statement)) { trackExport(statement.name.text); exports.set(statement.name.text, env.get(statement.name.text).item); }
    }
    if (ts.isEnumDeclaration(statement)) {
      const item = value(SAFE, SAFE, new Map(statement.members.map((memberNode) => [propertyKey(memberNode.name), safe()])), true);
      bind(statement.name, item); if (isExported(statement)) exports.set(statement.name.text, item);
    }
    if (ts.isModuleDeclaration(statement) && ts.isIdentifier(statement.name)) {
      const item = value(SAFE, SAFE, new Map(), true);
      const body = statement.body && ts.isModuleBlock(statement.body) ? statement.body.statements : [];
      for (const child of body) {
        if (ts.isFunctionDeclaration(child) && child.name) item.members.set(child.name.text, evaluate(child));
        else if (ts.isVariableStatement(child)) for (const declaration of child.declarationList.declarations) {
          if (ts.isIdentifier(declaration.name)) item.members.set(declaration.name.text, declaration.initializer ? evaluate(declaration.initializer) : unknown());
          else item.members.set("*", unknown());
        } else item.members.set("*", unknown());
      }
      bind(statement.name, item); if (isExported(statement)) exports.set(statement.name.text, item);
    }
    if (ts.isExportAssignment(statement)) exports.set(statement.isExportEquals ? "export=" : "default", evaluate(statement.expression));
    if (ts.isExportDeclaration(statement)) {
      const target = statement.moduleSpecifier && ts.isStringLiteralLike(statement.moduleSpecifier) ? dependency(statement.moduleSpecifier.text) : undefined;
      const targetExports = target && exportsByPath.get(target);
      if (!statement.exportClause) {
        if (!targetExports) exports.set("*", unknown()); else for (const [key, item] of targetExports) if (key !== "default") exports.set(key, item);
      } else if (ts.isNamespaceExport(statement.exportClause)) exports.set(statement.exportClause.name.text, targetExports ? value(SAFE, SAFE, new Map(targetExports)) : unknown());
      else for (const item of statement.exportClause.elements) {
        const localName = item.propertyName?.text ?? item.name.text;
        exports.set(item.name.text, targetExports?.get(localName) ?? env.get(localName)?.item ?? unknown());
        if (!targetExports) trackExport(localName, item.name.text);
      }
    }
    if (ts.isExpressionStatement(statement)) {
      const expression = unwrap(statement.expression);
      if (ts.isBinaryExpression(expression) && expression.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && expression.operatorToken.kind <= ts.SyntaxKind.LastAssignment) {
        const assigned = expression.operatorToken.kind === ts.SyntaxKind.EqualsToken ? evaluate(expression.right) : unknown();
        const left = unwrap(expression.left);
        if (ts.isPropertyAccessExpression(left) && ts.isIdentifier(left.expression) && left.expression.text === "module" && left.name.text === "exports") {
          if (assigned.members.size > 0) for (const [key, item] of assigned.members) exports.set(key, item);
          exports.set("default", assigned);
        } else if (ts.isPropertyAccessExpression(left) && ts.isIdentifier(left.expression)) {
          if (left.expression.text === "exports") exports.set(left.name.text, assigned);
          else {
            const mutation = interpretPlaywrightProvenanceMutation({ bind, env, evaluate, input: expression, mutate, recordWrite });
            if (!mutation.handled) exports.set("*", unknown());
          }
        } else if (ts.isPropertyAccessExpression(left) && ts.isPropertyAccessExpression(left.expression) &&
          ts.isIdentifier(left.expression.expression) && left.expression.expression.text === "module" && left.expression.name.text === "exports") {
          exports.set(left.name.text, assigned);
        } else {
          const mutation = interpretPlaywrightProvenanceMutation({ bind, env, evaluate, input: expression, mutate, recordWrite });
          if (!mutation.handled) exports.set("*", unknown());
        }
      } else {
        const mutation = interpretPlaywrightProvenanceMutation({ bind, env, evaluate, input: expression, mutate, recordWrite });
        if (!mutation.handled) {
          evaluate(expression);
          if (ts.isCallExpression(expression) || ts.isNewExpression(expression) || ts.isTaggedTemplateExpression(expression)) exports.set("*", unknown());
        }
      }
    }
    if (ts.isIfStatement(statement) || ts.isForStatement(statement) || ts.isForInStatement(statement) || ts.isForOfStatement(statement) ||
      ts.isWhileStatement(statement) || ts.isDoStatement(statement) || ts.isSwitchStatement(statement) || ts.isTryStatement(statement) ||
      ts.isWithStatement(statement) || ts.isLabeledStatement(statement)) exports.set("*", unknown());
  }
  stabilizePlaywrightProvenanceDeclarations({ bind, env, evaluate, source });
  return { consumed, exports };
}
export function collectToolcraftPlaywrightBindingProvenanceViolations({ entryByPath, frameworkFilePaths, graph, productFilePaths, reachablePaths, verifiedFacade }) {
  const resolved = new Map(graph.moduleImports.map((item) => [`${item.importerRepoPath}\0${item.specifier}`, item.resolvedRepoPath]));
  const reachable = new Set(reachablePaths);
  const relevant = new Set(graph.moduleImports
    .filter(({ importerRepoPath, specifier }) => reachable.has(importerRepoPath) && /^@playwright\/test(?:\/|$)/u.test(specifier))
    .map(({ importerRepoPath }) => importerRepoPath));
  const queue = [...relevant];
  while (queue.length > 0) {
    const dependencyPath = queue.shift();
    for (const importerPath of graph.reverse.get(dependencyPath) ?? []) {
      if (reachable.has(importerPath) && !relevant.has(importerPath)) {
        relevant.add(importerPath);
        queue.push(importerPath);
      }
    }
  }
  const budget = { nodes: 0, visitedNodes: new WeakSet() };
  const models = new Map([...relevant].flatMap((repoPath) => {
    const record = graph.sourceRecords.get(repoPath);
    if (!record?.rawSource) return [];
    const parsed = parseToolcraftTypeScriptSource({ absolutePath: repoPath, rawSource: record.rawSource });
    if (!parsed) throw new Error(`${repoPath} requires the TypeScript compiler for Playwright binding provenance.`);
    return [[repoPath, { source: parsed.sourceFile, budget, dependency: (specifier) => resolved.get(`${repoPath}\0${specifier}`), trustedFacadePath: verifiedFacade ? "e2e/toolcraft-product-test.ts" : undefined }]];
  }));
  const exportsByPath = new Map([...models].map(([repoPath]) => [repoPath, new Map()]));
  for (let iteration = 0, changed = true; changed;) {
    if (++iteration > MAX_ITERATIONS) throw new Error("Playwright authority provenance iteration budget exceeded; authority is unknown.");
    changed = false;
    for (const [repoPath, model] of models) {
      const next = analyzeModule(model, exportsByPath).exports, previous = exportsByPath.get(repoPath);
      if (next.size !== previous.size || [...next].some(([key, item]) => !previous.has(key) || !equal(item, previous.get(key)))) {
        exportsByPath.set(repoPath, next); changed = true;
      }
    }
  }
  const violations = [];
  for (const [repoPath, model] of models) {
    if (entryByPath.get(repoPath)?.owner !== "product" && !productFilePaths?.has(repoPath)) continue;
    for (const { node, target } of analyzeModule(model, exportsByPath, true).consumed) {
      if (target && target !== "@playwright/test" && !target.startsWith("intrinsic:") && entryByPath.get(target)?.owner !== "framework" && !frameworkFilePaths?.has(target)) continue;
      if (verifiedFacade && target === "e2e/toolcraft-product-test.ts") continue;
      const location = model.source.getLineAndCharacterOfPosition(node.getStart(model.source));
      violations.push({ column: location.character + 1, line: location.line + 1, repoPath,
        kind: "framework-playwright-test-authority-bridge",
        message: `Product-owned tests may obtain Playwright TestType authority only through the verified protected product-test facade (authority source: ${target ?? "unknown runtime value"}).` });
    }
  }
  return violations;
}
