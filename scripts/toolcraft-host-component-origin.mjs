import {
  toolcraftHostBindingInitializer as bindingInitializer,
  toolcraftHostBindingPath as bindingPath,
  toolcraftHostImportedOperation as importedOperation,
  toolcraftHostImportOrigin as importOrigin,
  toolcraftHostLiteralStrings as literalStrings,
  toolcraftHostStaticMemberName as staticMemberName,
  unwrapToolcraftHostExpression as unwrap,
} from "./toolcraft-host-origin-values.mjs";
import { createToolcraftHostCallOrigin } from
  "./toolcraft-host-call-origin.mjs";
import { createToolcraftHostContainerOrigin } from
  "./toolcraft-host-container-origin.mjs";
import {
  emptyToolcraftHostOriginContext,
  getToolcraftHostBoundReferences,
} from "./toolcraft-host-origin-context.mjs";
import { createToolcraftHostFlowOrigin } from
  "./toolcraft-host-flow-origin.mjs";

const MAX_HOST_ORIGIN_FACTS = 16;

function factKey(fact) {
  if (fact.kind === "intrinsic") return `intrinsic:${fact.tag}`;
  if (fact.kind !== "import") return fact.kind;
  const files = fact.sourceFiles.map(({ fileName }) => fileName).join("|");
  const certainty = fact.possible ? "possible" : "exact";
  return ["import", fact.specifier, fact.importedName,
    fact.members.join("."), files, certainty].join(":");
}

function mergeFacts(...groups) {
  const facts = new Map();
  for (const group of groups) {
    for (const fact of group) {
      const key = factKey(fact);
      if (facts.has(key)) continue;
      if (facts.size >= MAX_HOST_ORIGIN_FACTS - 1) {
        facts.set("unknown:overflow", { kind: "unknown", overflow: true });
        continue;
      }
      facts.set(key, fact);
    }
  }
  return Object.freeze([...facts.values()]);
}

export function createToolcraftHostComponentOrigin({
  checker,
  flowValues,
  isBaseUiModule,
  isReactHostFactoryModule,
  resolveStaticString,
  ts,
}) {
  const operations = {};
  const targetOf = (symbol) => symbol &&
    (symbol.flags & ts.SymbolFlags.Alias) !== 0
    ? checker.getAliasedSymbol(symbol) : symbol;

  let factsFromTypeNode;
  let flowPathOrigins;
  let possibleImportsIn;
  let resolvedFlowOrigins;

  let boundFacts;
  function factsFromSymbol(
    symbol,
    visited = new Set(),
    context = emptyToolcraftHostOriginContext,
  ) {
    if (!symbol || visited.has(symbol)) return [{ kind: "unknown" }];
    const target = targetOf(symbol);
    const bound = getToolcraftHostBoundReferences(context, target ?? symbol);
    if (bound) {
      const facts = bound.flatMap((item) =>
        boundFacts(item, [], visited)
      );
      return facts.length > 0 ? mergeFacts(facts) : [{ kind: "unknown" }];
    }
    const nextVisited = new Set(visited).add(symbol);
    const facts = [];
    for (const declaration of symbol.declarations ?? []) {
      const imported = importOrigin(declaration, ts) ??
        (ts.isExportDeclaration(declaration) && declaration.exportClause &&
          ts.isNamespaceExport?.(declaration.exportClause)
          ? importOrigin(declaration.exportClause, ts)
          : undefined);
      if (imported) {
        let moduleDeclaration = declaration;
        while (moduleDeclaration &&
          !ts.isImportDeclaration(moduleDeclaration) &&
          !ts.isExportDeclaration(moduleDeclaration)
        ) moduleDeclaration = moduleDeclaration.parent;
        const moduleSymbol = moduleDeclaration?.moduleSpecifier &&
          checker.getSymbolAtLocation(moduleDeclaration.moduleSpecifier);
        const exported = imported.importedName !== "*" && moduleSymbol &&
          checker.getExportsOfModule(moduleSymbol).find(
            ({ name }) => name === imported.importedName,
          );
        const resolved = exported &&
          !isBaseUiModule(imported.specifier) &&
          !isReactHostFactoryModule(imported.specifier)
          ? factsFromSymbol(exported, new Set(nextVisited), context) : [];
        facts.push(...(resolved.some(({ kind }) => kind !== "unknown")
          ? resolved.filter((fact) => fact.kind !== "unknown" || fact.overflow)
            .map((fact) => fact.kind === "import" ? {
              ...fact,
              sourceFiles: [...fact.sourceFiles,
                ...(exported?.declarations ?? []).map((candidate) =>
                  candidate.getSourceFile()
                )],
            } : fact)
          : [imported]));
      } else if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
        facts.push(...originOf(
          declaration.initializer,
          new Set(nextVisited),
          context,
        ));
      } else if (ts.isExportAssignment(declaration)) {
        facts.push(...originOf(
          declaration.expression,
          new Set(nextVisited),
          context,
        ));
      } else if (ts.isExportSpecifier(declaration) &&
        !declaration.parent.parent.moduleSpecifier) {
        const local = checker.getExportSpecifierLocalTargetSymbol?.(declaration);
        if (local) facts.push(...factsFromSymbol(
          local,
          new Set(nextVisited),
          context,
        ));
      } else if (ts.isBindingElement(declaration)) {
        const initializer = bindingInitializer(declaration, ts);
        const members = bindingPath(declaration, resolveStaticString, ts);
        if (initializer && members?.length) {
          facts.push(...(declaration.dotDotDotToken
            ? originOf(initializer, new Set(nextVisited), context)
            : originAtPath(
              initializer,
              members,
              new Set(nextVisited),
              context,
            )));
        }
      }
      if ("type" in declaration) {
        facts.push(...factsFromTypeNode(
          declaration.type,
          new Set(nextVisited),
          context,
        ));
      }
    }
    if (target && target !== symbol) {
      facts.push(...factsFromSymbol(target, new Set(nextVisited), context));
    }
    const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0];
    if (declaration) {
      for (const value of literalStrings(
        checker.getTypeOfSymbolAtLocation(symbol, declaration), ts,
      )) facts.push({ kind: "intrinsic", tag: value.toLowerCase() });
    }
    const merged = mergeFacts(facts);
    const known = merged.filter(({ kind }) => kind !== "unknown");
    return known.length > 0
      ? merged.filter((fact) => fact.kind !== "unknown" || fact.overflow)
      : [{ kind: "unknown" }];
  }

  let literalPath;

  function originAtPath(
    expression,
    members,
    visited = new Set(),
    context = emptyToolcraftHostOriginContext,
  ) {
    if (members.length === 0) return originOf(expression, visited, context);
    const node = unwrap(expression, ts);
    const [member, ...rest] = members;
    const flowedPath = flowPathOrigins(node, members, visited, context);
    if (flowedPath) return flowedPath;
    const literal = literalPath(node, members, visited, context);
    if (literal) return literal;
    if (ts.isIdentifier(node)) {
      const symbol = targetOf(checker.getSymbolAtLocation(node));
      const bound = getToolcraftHostBoundReferences(context, symbol, members);
      if (bound) {
        const facts = bound.flatMap((item) =>
          boundFacts(item, [], visited)
        );
        return facts.length > 0 ? mergeFacts(facts) : [{ kind: "unknown" }];
      }
      if (symbol && !visited.has(symbol)) {
        const nextVisited = new Set(visited).add(symbol);
        const resolved = (symbol.declarations ?? []).flatMap((declaration) => {
          if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
            return originAtPath(
              declaration.initializer,
              members,
              nextVisited,
              context,
            );
          }
          if (ts.isExportAssignment(declaration)) {
            return originAtPath(
              declaration.expression,
              members,
              nextVisited,
              context,
            );
          }
          if (ts.isBindingElement(declaration)) {
            const initializer = bindingInitializer(declaration, ts);
            const prefix = bindingPath(declaration, resolveStaticString, ts);
            let requested = members;
            if (declaration.dotDotDotToken &&
              ts.isArrayBindingPattern(declaration.parent) &&
              /^\d+$/u.test(members[0] ?? "")) {
              const offset = declaration.parent.elements.indexOf(declaration);
              requested = [String(offset + Number(members[0])), ...members.slice(1)];
            }
            return initializer && prefix
              ? originAtPath(
                initializer,
                [...prefix, ...requested],
                nextVisited,
                context,
              )
              : [];
          }
          return [];
        });
        if (resolved.some(({ kind }) => kind !== "unknown")) {
          return mergeFacts(resolved);
        }
      }
    }
    const imports = originOf(node, new Set(visited), context)
      .filter(({ kind }) => kind === "import")
      .map((owner) => ({ ...owner, members: [...owner.members, ...members] }));
    if (imports.length > 0) return mergeFacts(imports);
    const property = checker.getPropertyOfType(
      checker.getTypeAtLocation(node), member,
    );
    const resolved = property
      ? factsFromSymbol(property, new Set(visited), context)
      : [{ kind: "unknown" }];
    return rest.length === 0
      ? resolved
      : mergeFacts(resolved.flatMap((fact) => fact.kind === "import"
        ? [{ ...fact, members: [...fact.members, ...rest] }]
        : [fact]));
  }

  let callOrigin;

  function originOf(
    expression,
    visited = new Set(),
    context = emptyToolcraftHostOriginContext,
  ) {
    const node = unwrap(expression, ts);
    if (ts.isIdentifier(node) || ts.isPropertyAccessExpression(node) ||
      ts.isElementAccessExpression(node)) {
      const flowed = resolvedFlowOrigins(node, visited, context);
      if (flowed) return flowed;
    }
    if (ts.isStringLiteralLike(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      return [{ kind: "intrinsic", tag: node.text.toLowerCase() }];
    }
    if (ts.isConditionalExpression(node)) {
      return mergeFacts(
        originOf(node.whenTrue, new Set(visited), context),
        originOf(node.whenFalse, new Set(visited), context),
      );
    }
    if (ts.isCallExpression(node)) {
      return callOrigin(node, visited, context);
    }
    if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) {
      const captured = possibleImportsIn(node, visited, context);
      return captured.length > 0 ? mergeFacts(captured) : [{ kind: "unknown" }];
    }
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      const member = staticMemberName(node, resolveStaticString, ts);
      if (!member) return [{ kind: "unknown" }];
      const imported = originAtPath(
        node.expression,
        [member],
        new Set(visited),
        context,
      )
        .filter(({ kind }) => kind === "import");
      const literal = literalStrings(checker.getTypeAtLocation(node), ts)
        .map((tag) => ({ kind: "intrinsic", tag: tag.toLowerCase() }));
      return mergeFacts(imported, literal,
        factsFromSymbol(
          checker.getSymbolAtLocation(node),
          new Set(visited),
          context,
        ));
    }
    if (ts.isIdentifier(node)) {
      return factsFromSymbol(
        checker.getSymbolAtLocation(node),
        visited,
        context,
      );
    }
    const literal = literalStrings(checker.getTypeAtLocation(node), ts)
      .map((tag) => ({ kind: "intrinsic", tag: tag.toLowerCase() }));
    return literal.length > 0 ? literal : [{ kind: "unknown" }];
  }

  ({ boundFacts, factsFromTypeNode, flowPathOrigins, possibleImportsIn,
    resolvedFlowOrigins } = createToolcraftHostFlowOrigin({
    checker,
    flowValues,
    mergeFacts,
    originAtPath,
    originOf,
    targetOf,
    ts,
  }));
  Object.assign(operations, { originAtPath, originOf, possibleImportsIn });
  literalPath = createToolcraftHostContainerOrigin({
    checker,
    mergeFacts,
    operations,
    targetOf,
    ts,
  });
  callOrigin = createToolcraftHostCallOrigin({
    checker,
    flowValues,
    importedOperation,
    mergeFacts,
    operations,
    resolveStaticString,
    targetOf,
    ts,
  });

  return Object.freeze({ originOf, originOfSymbol: factsFromSymbol });
}
