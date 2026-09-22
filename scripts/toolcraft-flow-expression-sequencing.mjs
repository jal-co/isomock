import { UNKNOWN, boundStates, exact, updateState } from
  "./toolcraft-flow-facts.mjs";

const MAX_ORDERED_STATES = 32;

export function createToolcraftFlowExpressionSequencing({
  binaryTruth, budget, executeExpression, memory, nullish, truth, ts,
}) {
  function branchingOutcomes(node, state, depth, calls) {
    if (ts.isBinaryExpression(node) && [
      ts.SyntaxKind.AmpersandAmpersandToken,
      ts.SyntaxKind.BarBarToken,
      ts.SyntaxKind.QuestionQuestionToken,
    ].includes(node.operatorToken.kind)) {
      return executeExpression(node.left, state, depth + 1, calls).flatMap(
        (left) => logicalRight(node, left, depth, calls),
      );
    }
    if (ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.CommaToken) {
      return executeExpression(node.left, state, depth + 1, calls).flatMap(
        (left) => executeExpression(node.right, left.state, depth + 1, calls),
      );
    }
    if (ts.isBinaryExpression(node)) return executeExpression(
      node.left, state, depth + 1, calls,
    ).flatMap((left) => executeExpression(
      node.right, left.state, depth + 1, calls,
    ).map((right) => ({ fact: exact([node]), state: right.state,
      truth: binaryTruth(node, left, right) })));
    if (!ts.isConditionalExpression(node)) return;
    return executeExpression(node.condition, state, depth + 1, calls).flatMap(
      (condition) => conditionalBranches(node, condition, depth, calls),
    );
  }

  function logicalRight(node, left, depth, calls) {
    if (node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) {
      const status = nullish(left.fact);
      return [
        ...(status !== "true" ? [left] : []),
        ...(status !== "false" ? executeExpression(
          node.right, left.state, depth + 1, calls,
        ) : []),
      ];
    }
    const and = node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken;
    const execute = and ? left.truth !== "false" : left.truth !== "true";
    const retain = and ? left.truth !== "true" : left.truth !== "false";
    if (Number(retain) + Number(execute) > 1 && !budget.product(2, 1)) {
      return [{ fact: UNKNOWN, state: updateState(
        left.state, { overflow: true },
      ), truth: "unknown" }];
    }
    const retained = left.truth === "unknown"
      ? { ...left, truth: and ? "false" : "true" } : left;
    return [...(retain ? [retained] : []), ...(execute ? executeExpression(
      node.right, left.state, depth + 1, calls,
    ) : [])];
  }

  function conditionalBranches(node, condition, depth, calls) {
    if (condition.truth === "unknown" && !budget.product(2, 1)) {
      return [{ fact: UNKNOWN, state: updateState(
        condition.state, { overflow: true },
      ), truth: "unknown" }];
    }
    return [
      ...(condition.truth !== "false" ? executeExpression(
        node.whenTrue, condition.state, depth + 1, calls,
      ) : []),
      ...(condition.truth !== "true" ? executeExpression(
        node.whenFalse, condition.state,
        ts.isConditionalExpression(node.whenFalse) ? depth : depth + 1, calls,
      ) : []),
    ];
  }

  function orderedOutcomes(node, state, depth, calls) {
    const children = orderedChildren(node);
    if (!children) return;
    let states = [state];
    for (const child of children) {
      const next = [];
      for (const current of states) {
        const outcomes = executeExpression(child, current, depth + 1, calls);
        if (outcomes.length > MAX_ORDERED_STATES - next.length) return [{
          fact: UNKNOWN,
          state: updateState(current, { overflow: true }), truth: "unknown",
        }];
        next.push(...outcomes.map(({ state: outcome }) => outcome));
      }
      states = boundStates(next);
    }
    return states.map((next) => {
      const value = memory.materialize(node, next, depth + 1);
      return { ...value, truth: truth(value.fact) };
    });
  }

  function jsxChildren(children) {
    return children.flatMap((child) =>
      ts.isJsxExpression(child) && child.expression ? [child.expression]
        : ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child) ||
          ts.isJsxFragment(child) ? [child] : []
    );
  }

  function orderedChildren(node) {
    if (ts.isTemplateExpression(node)) {
      return node.templateSpans.map(({ expression }) => expression);
    }
    if (ts.isJsxFragment(node)) return jsxChildren(node.children);
    if (!ts.isJsxSelfClosingElement(node) && !ts.isJsxElement(node)) return;
    const opening = ts.isJsxElement(node) ? node.openingElement : node;
    const attributes = opening.attributes.properties.flatMap((attribute) =>
      ts.isJsxSpreadAttribute(attribute) ? [attribute.expression]
        : ts.isJsxAttribute(attribute) && attribute.initializer &&
          ts.isJsxExpression(attribute.initializer) &&
          attribute.initializer.expression
          ? [attribute.initializer.expression] : []
    );
    return [opening.tagName, ...attributes,
      ...(ts.isJsxElement(node) ? jsxChildren(node.children) : [])];
  }

  return Object.freeze({ branchingOutcomes, orderedOutcomes });
}
