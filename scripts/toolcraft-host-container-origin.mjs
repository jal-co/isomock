import {
  toolcraftHostSpreadMemberPresence as spreadMemberPresence,
  unwrapToolcraftHostExpression as unwrap,
} from "./toolcraft-host-origin-values.mjs";

export function createToolcraftHostContainerOrigin({
  checker,
  mergeFacts,
  operations,
  targetOf,
  ts,
}) {
  function arrayOrigins(expression, rest, visited, context) {
    const node = unwrap(expression, ts);
    if (ts.isArrayLiteralExpression(node)) return node.elements.flatMap(
      (element) => ts.isSpreadElement(element)
        ? arrayOrigins(element.expression, rest, new Set(visited), context)
        : operations.originAtPath(element, rest, new Set(visited), context),
    );
    if (!ts.isIdentifier(node)) return [{ kind: "unknown" }];
    const symbol = targetOf(checker.getSymbolAtLocation(node));
    if (!symbol || visited.has(symbol)) return [{ kind: "unknown" }];
    const nextVisited = new Set(visited).add(symbol);
    const facts = (symbol.declarations ?? []).flatMap((declaration) =>
      ts.isVariableDeclaration(declaration) && declaration.initializer
        ? arrayOrigins(declaration.initializer, rest, nextVisited, context) : []
    );
    return facts.length > 0 ? mergeFacts(facts) : [{ kind: "unknown" }];
  }

  return function literalPath(expression, members, visited, context) {
    const value = unwrap(expression, ts);
    const [member, ...rest] = members;
    if (ts.isObjectLiteralExpression(value)) {
      let selected = [{ kind: "unknown" }];
      for (const property of value.properties) {
        if (ts.isSpreadAssignment(property)) {
          const presence = spreadMemberPresence(
            property.expression,
            member,
            checker,
            ts,
          );
          if (presence === "absent") continue;
          const spreadFacts = operations.originAtPath(
            property.expression,
            members,
            new Set(visited),
            context,
          );
          selected = presence === "required"
            ? spreadFacts : mergeFacts(selected, spreadFacts);
          continue;
        }
        const name = property.name &&
          (ts.isIdentifier(property.name) || ts.isStringLiteralLike(property.name) ||
            ts.isNumericLiteral(property.name)
            ? property.name.text
            : undefined);
        if (name !== member) continue;
        const nested = ts.isPropertyAssignment(property)
          ? property.initializer
          : ts.isShorthandPropertyAssignment(property) ? property.name : undefined;
        selected = nested
          ? operations.originAtPath(nested, rest, new Set(visited), context)
          : [{ kind: "unknown" }];
      }
      return selected;
    }
    if (!ts.isArrayLiteralExpression(value) || !/^\d+$/u.test(member)) {
      return undefined;
    }
    let offset = 0;
    const index = Number(member);
    for (const [position, element] of value.elements.entries()) {
      if (ts.isSpreadElement(element)) {
        const spreadType = checker.getTypeAtLocation(element.expression);
        const lengthProperty = checker.getPropertyOfType(spreadType, "length");
        const lengthType = lengthProperty && checker.getTypeOfSymbolAtLocation(
          lengthProperty,
          element.expression,
        );
        const length = lengthType &&
          (lengthType.flags & ts.TypeFlags.NumberLiteral) !== 0
          ? lengthType.value : undefined;
        const spreadIndex = index - offset;
        if (length === undefined) {
          const possible = value.elements.slice(position + 1).flatMap(
            (candidate) => ts.isSpreadElement(candidate)
              ? arrayOrigins(
                candidate.expression,
                rest,
                new Set(visited),
                context,
              )
              : operations.originAtPath(
                candidate,
                rest,
                new Set(visited),
                context,
              ),
          );
          return mergeFacts(
            arrayOrigins(element.expression, rest, new Set(visited), context),
            possible,
          );
        }
        if (spreadIndex >= length) {
          offset += length;
          continue;
        }
        const property = checker.getPropertyOfType(
          spreadType,
          String(spreadIndex),
        );
        if (!property) return [{ kind: "unknown" }];
        return operations.originAtPath(
          element.expression,
          [String(spreadIndex), ...rest],
          new Set(visited),
          context,
        );
      }
      if (offset === index) {
        return operations.originAtPath(
          element,
          rest,
          new Set(visited),
          context,
        );
      }
      offset += 1;
    }
    return [{ kind: "unknown" }];
  };
}
