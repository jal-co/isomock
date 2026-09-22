import { UNKNOWN, exact, mergeFacts } from "./toolcraft-flow-facts.mjs";
import { toolcraftFlowStateKey } from "./toolcraft-flow-state-keys.mjs";

export function createToolcraftFlowPatterns({
  assignValue, evaluateExpression, index, memory, readProperty, ts,
}) {
  function memberName(node) {
    if (ts.isIdentifier(node) || ts.isStringLiteralLike(node) ||
      ts.isNumericLiteral(node)) return node.text;
    return ts.isComputedPropertyName(node)
      ? index.staticMember(node.expression) : undefined;
  }

  function defaultBranches(fact, initializer, state, depth, calls) {
    const values = fact?.kind === "exact" ? fact.values : [];
    const defined = values.filter((value) => {
      const node = index.unwrap(value);
      return !(ts.isIdentifier(node) && node.text === "undefined");
    });
    const fallback = !fact || fact.kind === "absent" || fact.kind === "unknown" ||
      defined.length < values.length;
    const branches = [
      ...(fact?.kind === "unknown" ? [{ fact, state }]
        : defined.length > 0 ? [{ fact: exact(defined), state }] : []),
      ...(fallback ? evaluateExpression(initializer, state, depth + 1, calls) : []),
    ];
    const grouped = Map.groupBy(branches, ({ state: next }) =>
      toolcraftFlowStateKey(next));
    return [...grouped.values()].map((items) => ({
      fact: mergeFacts(items.map(({ fact: value }) => value)),
      state: items[0].state,
    }));
  }

  function assign(target, fact, state, depth = 0, calls = new Set()) {
    const node = index.unwrap(target);
    if (ts.isParameter(node)) {
      if (!node.initializer) return assign(
        node.name, fact, state, depth + 1, calls,
      );
      return defaultBranches(
        fact, node.initializer, state, depth, calls,
      ).flatMap((branch) => assign(
        node.name, branch.fact, branch.state, depth + 1, calls,
      ));
    }
    if (ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      return defaultBranches(fact, node.right, state, depth, calls).flatMap(
        (branch) => assign(
          node.left, branch.fact, branch.state, depth + 1, calls,
        ),
      );
    }
    if (ts.isArrayBindingPattern(node) || ts.isArrayLiteralExpression(node)) {
      let states = [state];
      node.elements.forEach((element, position) => {
        if (ts.isOmittedExpression(element)) return;
        states = states.flatMap((current) => {
          const targetNode = ts.isBindingElement(element)
            ? element.name : ts.isSpreadElement(element)
              ? element.expression : element;
          if (ts.isSpreadElement(element) ||
            ts.isBindingElement(element) && element.dotDotDotToken) {
            const projected = memory.projectRest(
              fact, { index: position, kind: "array" }, current, targetNode,
            );
            return assign(
              targetNode, projected.fact, projected.state, depth + 1, calls,
            );
          }
          const projected = memory.projectIndex(fact, position, current);
          if (ts.isBindingElement(element) && element.initializer) {
            return defaultBranches(
              projected, element.initializer, current, depth + 1, calls,
            ).flatMap((branch) => assign(
              targetNode, branch.fact, branch.state, depth + 1, calls,
            ));
          }
          return assign(targetNode, projected, current, depth + 1, calls);
        });
      });
      return states;
    }
    if (ts.isObjectBindingPattern(node) || ts.isObjectLiteralExpression(node)) {
      let frames = [{ excluded: Object.freeze([]), state }];
      for (const property of node.elements ?? node.properties) {
        frames = frames.flatMap((frame) => {
          if (ts.isSpreadAssignment(property) ||
            ts.isBindingElement(property) && property.dotDotDotToken) {
            const targetNode = ts.isBindingElement(property)
              ? property.name : property.expression;
            const projected = memory.projectRest(
              fact, { excluded: frame.excluded, kind: "object" },
              frame.state, targetNode,
            );
            return assign(
              targetNode, projected.fact, projected.state, depth + 1, calls,
            ).map((next) => ({ ...frame, state: next }));
          }
          const nameNode = property.propertyName ?? property.name;
          const targetNode = ts.isBindingElement(property) ? property.name
            : ts.isPropertyAssignment(property) ? property.initializer
              : property.name;
          const initializer = ts.isBindingElement(property)
            ? property.initializer : property.objectAssignmentInitializer;
          const staticName = nameNode && memberName(nameNode);
          const keys = nameNode && ts.isComputedPropertyName(nameNode)
            ? evaluateExpression(
                nameNode.expression, frame.state, depth + 1, calls,
              ).map(({ fact: keyFact, state: next }) => ({ keyFact, state: next }))
            : [{ keyFact: undefined, state: frame.state }];
          return keys.flatMap(({ keyFact, state: keyed }) => readProperty(
            fact, staticName, keyFact, nameNode, keyed, depth + 1, calls,
          ).flatMap((projected) => {
            const name = projected.reference.member;
            const excluded = name === undefined ? frame.excluded
              : Object.freeze([...frame.excluded, name]);
            const branches = initializer ? defaultBranches(
              projected.fact, initializer, projected.state, depth + 1, calls,
            ) : [{ fact: projected.fact, state: projected.state }];
            return branches.flatMap((branch) => assign(
              targetNode, branch.fact, branch.state, depth + 1, calls,
            ).map((next) => ({ excluded, state: next })));
          }));
        });
      }
      return frames.map(({ state: next }) => next);
    }
    return assignValue(node, fact ?? UNKNOWN, state, depth, calls);
  }

  return Object.freeze({ assign });
}
