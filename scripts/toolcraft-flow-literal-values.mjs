import {
  ABSENT, MAX_POSITIONAL_SLOTS, exact, updateState,
} from "./toolcraft-flow-facts.mjs";
import {
  toolcraftEvaluatedKey, toolcraftEvaluatedLiteralMember,
  toolcraftEvaluatedValue,
} from "./toolcraft-flow-evaluated-values.mjs";
import {
  toolcraftAccessorDescriptor, toolcraftDataDescriptor,
} from "./toolcraft-flow-property-descriptors.mjs";

const MAX_LITERAL_STATES = 32;
const EMPTY_ITEMS = Object.freeze([]);

export function createToolcraftFlowLiteralValues({
  evaluateExpression, frames, index, memory, primitive, propertyCopy, truth, ts,
}) {
  function staticName(name) {
    if (ts.isIdentifier(name) || ts.isStringLiteralLike(name) ||
      ts.isNumericLiteral(name)) return name.text;
  }

  function keyOutcomes(property, state, depth, calls) {
    if (!property.name || !ts.isComputedPropertyName(property.name)) {
      const value = property.name ? staticName(property.name) : undefined;
      const keyFact = value === undefined
        ? Object.freeze({ alternatives: Object.freeze([]),
            coverage: memory.propertyKeys.coverageForSource(),
            kind: "PropertyKeyFact", unbounded: true })
        : memory.propertyKeys.staticFact(value);
      return [{ key: toolcraftEvaluatedKey(
        keyFact.alternatives[0], property.name, keyFact,
      ), state }];
    }
    const outcomes = evaluateExpression(
      property.name.expression, state, depth + 1, calls,
    );
    return outcomes.flatMap(({ fact, state: next }) => {
      const keyFact = memory.propertyKeys.fromFact(
        fact, property.name.expression,
      );
      const keys = keyFact.alternatives.length > 0
        ? keyFact.alternatives : [undefined];
      return keys.map((propertyKey) => ({
        key: toolcraftEvaluatedKey(
          propertyKey, property.name.expression, keyFact,
        ), state: next,
      }));
    });
  }

  function copyEffects(depth, calls) {
    return Object.freeze({
      applyCandidate: (candidate, facts, state) => frames.apply(
        candidate, facts, state, depth + 1, calls,
      ),
    });
  }

  function objectPropertyOutcomes(property, item, depth, calls) {
    if (item.state.exit !== "normal") return [item];
    if (ts.isSpreadAssignment(property)) {
      return evaluateExpression(
        property.expression, item.state, depth + 1, calls,
      ).flatMap((outcome) => outcome.state.exit !== "normal"
        ? [{ members: [...item.members, toolcraftEvaluatedLiteralMember({
            completion: outcome.state.exit, kind: "spread",
            order: item.members.length, source: property,
            value: outcome.evaluatedValue ?? { fact: outcome.fact },
          })], state: outcome.state }]
        : propertyCopy.evaluatedOwnDescriptors(
            outcome.fact, outcome.state, copyEffects(depth, calls),
          ).map(({ descriptors, propertyRemainder, state }) => ({
            members: [...item.members, toolcraftEvaluatedLiteralMember({
              descriptors: Object.freeze([...descriptors]),
              kind: "spread", order: item.members.length, source: property,
              propertyRemainder,
              value: outcome.evaluatedValue ?? { fact: outcome.fact },
            })],
            state,
          }))
      );
    }
    return keyOutcomes(property, item.state, depth, calls).flatMap(
      ({ key, state: keyed }) => {
        if (keyed.exit !== "normal") return [{
          members: [...item.members, toolcraftEvaluatedLiteralMember({
            completion: keyed.exit, key, kind: "abrupt",
            order: item.members.length, source: property,
          })], state: keyed,
        }];
        if (ts.isMethodDeclaration(property) ||
          ts.isGetAccessorDeclaration(property) ||
          ts.isSetAccessorDeclaration(property)) {
          const captured = memory.captureClosure(property, keyed);
          const accessor = ts.isGetAccessorDeclaration(property) ||
            ts.isSetAccessorDeclaration(property);
          const descriptor = accessor ? toolcraftAccessorDescriptor({
            getFact: ts.isGetAccessorDeclaration(property)
              ? captured.fact : undefined,
            setFact: ts.isSetAccessorDeclaration(property)
              ? captured.fact : undefined,
          }) : toolcraftDataDescriptor(captured.fact);
          return [{ members: [...item.members, toolcraftEvaluatedLiteralMember({
            callable: captured.fact, descriptor, key,
            kind: ts.isMethodDeclaration(property) ? "method"
              : ts.isGetAccessorDeclaration(property) ? "get" : "set",
            order: item.members.length, source: property,
            value: toolcraftEvaluatedValue({ callable: property,
              candidates: memory.callableAt(captured.fact.values[0], captured.state),
              fact: captured.fact, objectRef: property, source: property }),
          })], state: captured.state }];
        }
        const expression = ts.isPropertyAssignment(property)
          ? property.initializer
          : ts.isShorthandPropertyAssignment(property) ? property.name : undefined;
        if (!expression) return [{ members: [...item.members,
          toolcraftEvaluatedLiteralMember({ key, kind: "unknown",
            order: item.members.length, source: property })], state: keyed }];
        return evaluateExpression(expression, keyed, depth + 1, calls).map(
          (outcome) => ({
            members: [...item.members, toolcraftEvaluatedLiteralMember({
              completion: outcome.state.exit,
              descriptor: toolcraftDataDescriptor(outcome.fact),
              key, kind: "data", order: item.members.length, source: property,
              value: outcome.evaluatedValue ?? toolcraftEvaluatedValue({
                fact: outcome.fact, objectRef: expression, source: expression,
              }),
            })],
            state: outcome.state,
          }),
        );
      },
    );
  }

  function bounded(items, state, overflow = { members: EMPTY_ITEMS }) {
    if (items.length <= MAX_LITERAL_STATES) return items;
    return [{ ...overflow,
      state: updateState(items[0]?.state ?? state, { overflow: true }) }];
  }

  function objectOutcomes(node, state, depth, calls) {
    let items = [{ members: EMPTY_ITEMS, state }];
    for (const property of node.properties) items = bounded(items.flatMap(
      (item) => objectPropertyOutcomes(property, item, depth + 1, calls),
    ), state);
    return items.map(({ members, state: ready }) => {
      const fact = exact([node]);
      const evaluatedValue = toolcraftEvaluatedValue({
        evaluatedMembers: members, fact, objectRef: node, source: node,
      });
      return { evaluatedMembers: evaluatedValue.evaluatedMembers,
        evaluatedValue, fact,
        state: memory.commitEvaluatedLiteral(evaluatedValue, ready),
        truth: "true" };
    });
  }

  function shapeFromOutcome(outcome) {
    return outcome.evaluatedValue?.positionalShape ??
      memory.positionalShapeFromFact(outcome.fact, outcome.state);
  }

  function appendArray(item, element, outcome) {
    const spread = ts.isSpreadElement(element);
    const shape = spread ? shapeFromOutcome(outcome) : undefined;
    const unresolved = spread && (!shape || shape.evidence.length > 0);
    const slots = spread
      ? unresolved ? item.items : [...item.items, ...shape.slots]
      : item.tailItems.length > 0 ? item.items : [...item.items, outcome.fact];
    const tails = spread
      ? unresolved ? [...item.tailItems, element.expression]
        : [...item.tailItems, ...shape.tails]
      : item.tailItems.length > 0 ? [...item.tailItems, element] : item.tailItems;
    return {
      evidence: unresolved ? [...item.evidence, "unknown-length"] : item.evidence,
      items: slots,
      members: [...item.members, toolcraftEvaluatedLiteralMember({
        completion: outcome.state.exit,
        evidence: unresolved ? ["unknown-length"] : [],
        kind: spread ? "spread" : "element", order: item.members.length,
        source: element, value: outcome.evaluatedValue ??
          toolcraftEvaluatedValue({ fact: outcome.fact,
            objectRef: spread ? element.expression : element,
            source: spread ? element.expression : element }),
      })],
      state: outcome.state,
      tailItems: tails,
    };
  }

  function arrayOutcomes(node, state, depth, calls) {
    let items = [{ evidence: EMPTY_ITEMS, items: EMPTY_ITEMS,
      members: EMPTY_ITEMS, state, tailItems: EMPTY_ITEMS }];
    for (const element of node.elements) {
      if (ts.isOmittedExpression(element)) {
        items = items.map((item) => item.state.exit !== "normal" ? item : ({
          ...item,
          items: item.tailItems.length > 0 ? item.items : [...item.items, ABSENT],
          members: [...item.members, toolcraftEvaluatedLiteralMember({
            kind: "hole", order: item.members.length, source: element,
          })],
          tailItems: item.tailItems.length > 0
            ? [...item.tailItems, element] : item.tailItems,
        }));
        continue;
      }
      const expression = ts.isSpreadElement(element)
        ? element.expression : element;
      items = bounded(items.flatMap((item) => item.state.exit !== "normal"
        ? [item] : evaluateExpression(
            expression, item.state, depth + 1, calls,
          ).map((outcome) => appendArray(item, element, outcome))), state, {
        evidence: ["overflow-span"], items: EMPTY_ITEMS,
        members: EMPTY_ITEMS, tailItems: [node],
      });
    }
    return items.map(({ evidence, items: slots, members, state: ready,
      tailItems: tails }) => {
      const positionalShape = Object.freeze({
        evidence: Object.freeze(slots.length > MAX_POSITIONAL_SLOTS
          ? [...evidence, "overflow-span"] : evidence),
        slots: Object.freeze(slots.slice(0, MAX_POSITIONAL_SLOTS)),
        tails: Object.freeze(tails),
      });
      const fact = exact([node]);
      const evaluatedValue = toolcraftEvaluatedValue({ evaluatedMembers: members,
        fact, objectRef: node, positionalShape, source: node });
      return { evaluatedMembers: evaluatedValue.evaluatedMembers,
        evaluatedValue, fact,
        state: memory.commitEvaluatedLiteral(evaluatedValue, ready),
        truth: truth(fact) };
    });
  }

  return Object.freeze({ arrayOutcomes, objectOutcomes });
}
