export function createToolcraftHostFlowOrigin({
  checker,
  flowValues,
  mergeFacts,
  originAtPath,
  originOf,
  targetOf,
  ts,
}) {
  function flowManaged(symbol) {
    return (symbol?.declarations ?? []).some((declaration) =>
      ts.isVariableDeclaration(declaration) ||
      ts.isBindingElement(declaration) || ts.isParameter(declaration)
    );
  }

  function boundFacts(item, members, visited) {
    const facts = item.path.length === 0
      ? originOf(item.expression, new Set(visited), item.context)
      : originAtPath(
        item.expression,
        [...item.path, ...members],
        new Set(visited),
        item.context,
      );
    return item.possible
      ? facts.map((fact) => fact.kind === "import"
        ? { ...fact, possible: true } : fact)
      : facts;
  }

  function resolvedFlowOrigins(node, visited, context) {
    const reference = flowValues.reference(node);
    if (!reference?.symbol || !flowManaged(reference.symbol)) return undefined;
    if (visited.has(reference.symbol)) return [{ kind: "unknown" }];
    const nextVisited = new Set(visited).add(reference.symbol);
    const fact = flowValues.valueAt(node, node);
    if (fact.kind === "exact" && fact.values.length === 1 &&
      fact.values[0] === node) return undefined;
    if (fact.kind !== "exact") {
      if (fact.kind === "unknown" && fact.possibleValues?.length) {
        const possible = fact.possibleValues.flatMap((value) =>
          originOf(value, new Set(nextVisited), context)
        ).filter(({ kind }) => kind !== "unknown").map((origin) =>
          origin.kind === "import" ? { ...origin, possible: true } : origin
        );
        if (possible.length > 0) return mergeFacts(possible);
      }
      const bindingFallback = (reference.symbol.declarations ?? []).some(
        (declaration) => ts.isBindingElement(declaration) ||
          ts.isParameter(declaration),
      );
      return bindingFallback ? undefined : [{ kind: "unknown" }];
    }
    const resolved = fact.values.flatMap((value) =>
      originOf(value, new Set(nextVisited), context)
    );
    if (resolved.some(({ kind }) => kind !== "unknown")) {
      return mergeFacts(resolved);
    }
    const syntheticCallable = fact.values.some((value) =>
      ts.isIdentifier(value) && !checker.getSymbolAtLocation(value)
    );
    return syntheticCallable ? undefined : mergeFacts(resolved);
  }

  function flowPathOrigins(node, members, visited, context) {
    const root = flowValues.reference(node);
    if (!root?.symbol || !flowManaged(root.symbol)) return undefined;
    if (visited.has(root.symbol)) return [{ kind: "unknown" }];
    const nextVisited = new Set(visited).add(root.symbol);
    const [member, ...rest] = members;
    const fact = flowValues.propertyAt(node, member, node);
    if (fact.kind === "unknown") {
      const possible = (fact.possibleValues ?? []).flatMap((value) =>
        rest.length === 0
          ? originOf(value, new Set(nextVisited), context)
          : originAtPath(value, rest, new Set(nextVisited), context)
      ).filter(({ kind }) => kind !== "unknown").map((origin) =>
        origin.kind === "import" ? { ...origin, possible: true } : origin
      );
      if (possible.length > 0) return mergeFacts(possible);
      const object = flowValues.objectAt(node, node);
      const mutated = object.kind !== "object" || object.variants.some(
        ({ propertyRemainder }) => ["string", "symbol"].some((domain) =>
          propertyRemainder?.[domain]?.alternatives?.some(
            ({ kind }) => kind !== "absent"
          )),
      );
      return mutated ? [{ kind: "unknown" }] : undefined;
    }
    if (fact.kind !== "exact") return undefined;
    const resolved = fact.values.flatMap((value) => rest.length === 0
      ? originOf(value, new Set(nextVisited), context)
      : originAtPath(value, rest, new Set(nextVisited), context));
    return resolved.length > 0 ? mergeFacts(resolved) : [{ kind: "unknown" }];
  }

  function factsFromTypeNode(typeNode, visited, context) {
    if (!typeNode) return [];
    if (ts.isTypeQueryNode(typeNode)) {
      return originOf(typeNode.exprName, new Set(visited), context);
    }
    if (ts.isUnionTypeNode(typeNode) || ts.isIntersectionTypeNode(typeNode)) {
      return typeNode.types.flatMap((member) =>
        factsFromTypeNode(member, new Set(visited), context)
      );
    }
    if (ts.isParenthesizedTypeNode(typeNode) || ts.isTypeOperatorNode(typeNode)) {
      return factsFromTypeNode(typeNode.type, visited, context);
    }
    if (!ts.isTypeReferenceNode(typeNode)) return [];
    const symbol = targetOf(checker.getSymbolAtLocation(typeNode.typeName));
    if (!symbol || visited.has(symbol)) return [];
    const nextVisited = new Set(visited).add(symbol);
    return (symbol.declarations ?? []).flatMap((declaration) =>
      ts.isTypeAliasDeclaration(declaration)
        ? factsFromTypeNode(declaration.type, nextVisited, context) : []
    );
  }

  function possibleImportsIn(candidate, visited, context) {
    const facts = [];
    function visit(node) {
      if (node !== candidate && ts.isFunctionLike(node)) return;
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        facts.push(...originOf(node.tagName, new Set(visited), context)
          .filter(({ kind }) => kind === "import")
          .map((origin) => ({ ...origin, possible: true })));
      }
      ts.forEachChild(node, visit);
    }
    visit(candidate);
    return facts;
  }

  return Object.freeze({
    boundFacts,
    factsFromTypeNode,
    flowPathOrigins,
    possibleImportsIn,
    resolvedFlowOrigins,
  });
}
