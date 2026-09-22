import {
  ABSENT, UNKNOWN, exact, updateState, withCompletion,
} from "./toolcraft-flow-facts.mjs";

export function createToolcraftFlowReferences({
  assignPattern, budget, evaluateExpression, factForReference, frames, index,
  memory, nullish, primitive, propertyOperations, truth, ts,
}) {
  const undefinedFact = exact([ts.factory.createIdentifier("undefined")]);

  function writeReference(reference, fact, state, depth, calls) {
    if (!reference || reference.kind === "binding") {
      return [memory.assignBinding(reference?.node, fact, state)];
    }
    return propertyOperations.assign(reference, fact, state, {
      applyCandidate: (candidate, facts, ready) => frames.apply(
        candidate, facts, ready, depth + 1, calls,
      ),
    });
  }

  function assignValue(target, fact, state, depth, calls) {
    if (!target) return [updateState(state, { overflow: true })];
    if (target?.kind === "binding" || target?.kind === "property") {
      return writeReference(target, fact, state, depth, calls);
    }
    return referenceOutcomes(target, state, depth, calls).flatMap(
      ({ reference, state: ready }) => writeReference(
        reference, fact, ready, depth, calls,
      ),
    );
  }

  function referenceOutcomes(target, state, depth, calls) {
    const node = index.unwrap(target);
    if (ts.isIdentifier(node)) return [{
      reference: Object.freeze({ kind: "binding", node }), state,
    }];
    if (!ts.isPropertyAccessExpression(node) &&
      !ts.isElementAccessExpression(node)) return [{ state }];
    return evaluateExpression(node.expression, state, depth + 1, calls).flatMap(
      ({ chain, fact: baseFact, state: base }) => {
        if (base.exit !== "normal") return [{ baseFact, state: base }];
        if (chain === "short-circuited" && ts.isOptionalChain(node)) {
          return [{ chain, fact: undefinedFact, state: base }];
        }
        const status = nullish(baseFact);
        if (!node.questionDotToken && status === "true") return [{
          baseFact,
          state: withCompletion(base, "throw", baseFact),
        }];
        if (status === "unknown" && !budget.product(2, 1)) return [{
          baseFact,
          overflow: true,
          state: updateState(base, { overflow: true }),
        }];
        const skipped = node.questionDotToken && status !== "false"
          ? [{ chain: "short-circuited", fact: undefinedFact, state: base }] : [];
        if (node.questionDotToken && status === "true") return skipped;
        const thrown = !node.questionDotToken && status === "unknown"
          ? [{ baseFact, state: withCompletion(base, "throw", baseFact) }] : [];
        const active = node.argumentExpression
          ? evaluateExpression(node.argumentExpression, base, depth + 1, calls)
            .map(({ fact: keyFact, state: next }) => {
              const propertyKeyFact = memory.propertyKeys.fromFact(
                keyFact, node.argumentExpression,
              );
              const [only] = propertyKeyFact.alternatives;
              const member = index.staticMember(node) ??
                (!propertyKeyFact.unbounded &&
                  propertyKeyFact.alternatives.length === 1 &&
                  only.kind === "string" ? only.value : propertyKeyFact);
              return ({ baseFact,
              reference: Object.freeze({
                baseFact, keyFact: propertyKeyFact,
                kind: "property", member,
                node,
                receiverFact: baseFact,
                receiverSource: node.expression,
              }),
              state: next,
            }); })
          : [{
              baseFact,
              reference: Object.freeze({
                baseFact, kind: "property", member: index.staticMember(node),
                node, receiverFact: baseFact, receiverSource: node.expression,
              }),
              state: base,
            }];
        return [...skipped, ...thrown, ...active];
      },
    );
  }

  function readReference(target, state, depth, calls) {
    const node = index.unwrap(target);
    return referenceOutcomes(node, state, depth, calls).flatMap(
      ({ baseFact, chain, fact: skippedFact, reference, state: ready }) => {
        if (ready.exit !== "normal") return [{
          fact: baseFact ?? UNKNOWN, state: ready, truth: "unknown",
        }];
        if (chain === "short-circuited") return [{
          chain,
          fact: skippedFact ?? undefinedFact,
          state: ready,
          truth: "false",
        }];
        if (!baseFact) {
          const value = memory.materialize(node, ready, depth + 1);
          return [{ ...value, reference, truth: truth(value.fact) }];
        }
        if (!reference) return [{
          fact: UNKNOWN,
          state: updateState(ready, { overflow: true }),
          truth: "unknown",
        }];
        return readResolvedReference(node, reference, ready, depth, calls);
      },
    );
  }

  function readResolvedReference(node, reference, state, depth, calls) {
    const { baseFact, member } = reference;
    const opaqueBase = baseFact.kind === "exact" &&
      baseFact.values.every((value) => !state.objects.has(index.unwrap(value)));
    const callableFact = factForReference(reference, state, depth + 1);
    return memory.descriptorOutcomesFromFact(
      baseFact, member, state, depth + 1, reference.receiverSource,
    ).flatMap((outcome) => {
      return propertyOperations.read(outcome, state, {
        applyCandidate: (candidate, facts, ready) => frames.apply(
          candidate, facts, ready, depth + 1, calls,
        ),
      }).map((result) => {
        const fact = callableFact ?? (opaqueBase && reference.receiverSource
          ? exact([node]) : result.fact.kind === "absent"
            ? member === undefined ? UNKNOWN : undefinedFact : result.fact);
        return { fact, reference, receiverFact: baseFact,
          state: result.state, truth: truth(fact) };
      });
    });
  }

  function readProperty(baseFact, member, keyFact, node, state, depth, calls) {
    const propertyKeyFact = member === undefined
      ? memory.propertyKeys.fromFact(keyFact, node) : undefined;
    const [only] = propertyKeyFact?.alternatives ?? [];
    const key = member ?? (!propertyKeyFact?.unbounded &&
      propertyKeyFact?.alternatives.length === 1 && only.kind === "string"
      ? only.value : propertyKeyFact);
    const reference = Object.freeze({
      baseFact,
      kind: "property",
      member: key,
      node,
      receiverFact: baseFact,
    });
    return readResolvedReference(node, reference, state, depth, calls);
  }

  function compoundFact(operator, left, right) {
    const first = primitive(left), second = primitive(right);
    if (operator === ts.SyntaxKind.PlusEqualsToken &&
      first !== undefined && second !== undefined) {
      const value = first + second;
      return exact([typeof value === "number"
        ? ts.factory.createNumericLiteral(value)
        : ts.factory.createStringLiteral(String(value))]);
    }
    return UNKNOWN;
  }

  function assignmentOutcomes(node, state, depth, calls) {
    if ([ts.SyntaxKind.AmpersandAmpersandEqualsToken,
      ts.SyntaxKind.BarBarEqualsToken,
      ts.SyntaxKind.QuestionQuestionEqualsToken].includes(node.operatorToken.kind)) {
      return readReference(node.left, state, depth + 1, calls).flatMap((left) => {
        if (left.state.exit !== "normal") return [left];
        const status = node.operatorToken.kind ===
          ts.SyntaxKind.QuestionQuestionEqualsToken ? nullish(left.fact) : left.truth;
        const execute = node.operatorToken.kind ===
          ts.SyntaxKind.AmpersandAmpersandEqualsToken ? status !== "false"
          : node.operatorToken.kind === ts.SyntaxKind.BarBarEqualsToken
            ? status !== "true" : status !== "false";
        const retain = node.operatorToken.kind ===
          ts.SyntaxKind.AmpersandAmpersandEqualsToken ? status !== "true"
          : node.operatorToken.kind === ts.SyntaxKind.BarBarEqualsToken
            ? status !== "false" : status !== "true";
        return [
          ...(retain ? [left] : []),
          ...(execute ? evaluateExpression(
            node.right, left.state, depth + 1, calls,
          ).flatMap((right) => assignValue(
            left.reference, right.fact, right.state, depth + 1, calls,
          ).map((next) => ({ ...right, state: next }))) : []),
        ];
      });
    }
    const simple = node.operatorToken.kind === ts.SyntaxKind.EqualsToken;
    const lefts = simple
      ? referenceOutcomes(node.left, state, depth + 1, calls).map(
        ({ reference, state: ready }) => ({
          fact: ABSENT, reference, state: ready,
        }),
      ) : readReference(node.left, state, depth + 1, calls);
    return lefts.flatMap((left) => evaluateExpression(
      node.right, left.state, depth + 1, calls,
    ).flatMap((right) => {
      const fact = simple ? right.fact
        : compoundFact(node.operatorToken.kind, left.fact, right.fact);
      const assigned = left.reference
        ? writeReference(left.reference, fact, right.state, depth + 1, calls)
        : assignPattern(node.left, fact, right.state, depth + 1, calls);
      return assigned
        .map((next) => ({ fact, state: next, truth: truth(fact) }));
    }));
  }

  function updateOutcomes(node, state, depth, calls) {
    return readReference(node.operand, state, depth + 1, calls).flatMap(
      (current) => {
        const value = primitive(current.fact);
        if (typeof value !== "number") return [{
          fact: UNKNOWN,
          state: updateState(current.state, { overflow: true }),
          truth: "unknown",
        }];
        const nextFact = exact([ts.factory.createNumericLiteral(
          value + (node.operator === ts.SyntaxKind.PlusPlusToken ? 1 : -1),
        )]);
        return writeReference(
          current.reference, nextFact, current.state, depth + 1, calls,
        ).map((next) => ({
          fact: ts.isPostfixUnaryExpression(node) ? current.fact : nextFact,
          state: next,
          truth: "unknown",
        }));
      },
    );
  }

  function deleteOutcomes(node, state, depth, calls) {
    return referenceOutcomes(node.expression, state, depth + 1, calls).flatMap(
      ({ chain, reference, state: ready }) => {
        return reference?.kind === "property"
        ? propertyOperations.deleteProperty(reference, ready).map((outcome) => ({
            ...outcome, chain, truth: truth(outcome.fact),
          }))
        : [{ chain, fact: exact([ts.factory.createTrue()]), state: ready,
            truth: "true" }];
      },
    );
  }

  return Object.freeze({ assignValue, assignmentOutcomes, deleteOutcomes,
    readProperty, readReference, referenceOutcomes, updateOutcomes,
    writeReference });
}
