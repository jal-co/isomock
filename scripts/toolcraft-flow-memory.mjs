import {
  ABSENT, OVERFLOW, UNKNOWN, exact, mergeFacts, objectFact,
  objectFactFromDescriptors, toolcraftEmptyPropertyRemainder, withCallable,
  withObject,
} from "./toolcraft-flow-facts.mjs";
import {
  assignToolcraftBinding, captureToolcraftEnvironment, hasToolcraftBinding,
  readToolcraftBinding,
} from "./toolcraft-flow-environments.mjs";
import { createToolcraftFlowPropertyMemory } from "./toolcraft-flow-property-memory.mjs";
import { createToolcraftFlowPropertyKeys } from "./toolcraft-flow-property-keys.mjs";
import { joinToolcraftDescriptors, mergeToolcraftAccessorDescriptor,
  overlayToolcraftDescriptor, toolcraftDataDescriptor,
  toolcraftUncertainDescriptor, withToolcraftDescriptorWriteOrder } from
  "./toolcraft-flow-property-descriptors.mjs";
const MAX_FLOW_DEPTH = 24;
export function createToolcraftFlowMemory({
  checker, index, resolveStaticString, ts,
}) {
  const closureIdentities = new WeakMap();
  const objectIdentities = new WeakMap(), referenceIdentities = new WeakSet();
  const symbolIdentities = new WeakMap();
  let closureSequence = 0, objectSequence = 0, symbolSequence = 0;
  function closureIdentity(fn, state, category) {
    let identities = closureIdentities.get(fn);
    if (!identities) {
      identities = new Map();
      closureIdentities.set(fn, identities);
    }
    const environment = [...state.environment].map(([symbol, cell]) => {
      let symbolIdentity = symbolIdentities.get(symbol);
      if (!symbolIdentity) {
        symbolIdentity = symbolSequence += 1;
        symbolIdentities.set(symbol, symbolIdentity);
      }
      return `${symbolIdentity}:${cell.id}`;
    }).sort().join(",");
    let identity = identities.get(environment);
    if (!identity) {
      identity = ts.factory.createIdentifier(
        `__toolcraft_${category}_${closureSequence += 1}`,
      );
      referenceIdentities.add(identity); identities.set(environment, identity);
    }
    return identity;
  }
  function syntheticObjectIdentity(owner, category) {
    const node = index.unwrap(owner);
    let identities = objectIdentities.get(node);
    if (!identities) {
      identities = new Map();
      objectIdentities.set(node, identities);
    }
    let identity = identities.get(category);
    if (!identity) {
      identity = ts.factory.createIdentifier(
        `__toolcraft_${category}_${objectSequence += 1}`,
      );
      referenceIdentities.add(identity); identities.set(category, identity);
    }
    return identity;
  }
  function declarePattern(name, state) {
    const node = index.unwrap(name);
    if (ts.isIdentifier(node)) {
      const symbol = checker.getSymbolAtLocation(node);
      return hasToolcraftBinding(state, symbol) ? state
        : assignToolcraftBinding(state, symbol, ABSENT);
    }
    return (node.elements ?? []).reduce((current, element) =>
      ts.isOmittedExpression(element)
        ? current : declarePattern(element.name, current), state);
  }
  let propertyMemory;
  const propertyKeys = createToolcraftFlowPropertyKeys({ checker, index, ts });
  function materialize(expression, state, depth = 0) {
    if (!expression || depth >= MAX_FLOW_DEPTH || state.overflow) {
      return { fact: state.overflow ? OVERFLOW : UNKNOWN, state };
    }
    const node = index.unwrap(expression);
    if (node.kind === ts.SyntaxKind.ThisKeyword) {
      return { fact: state.thisFact?.kind === "absent" ? UNKNOWN
        : state.thisFact ?? UNKNOWN, state };
    }
    if (ts.isIdentifier(node)) {
      const symbol = node.parent && ts.isShorthandPropertyAssignment(node.parent)
        ? checker.getShorthandAssignmentValueSymbol(node.parent)
        : checker.getSymbolAtLocation(node);
      return { fact: readToolcraftBinding(state, symbol) ?? exact([node]), state };
    }
    if (ts.isObjectLiteralExpression(node) || ts.isArrayLiteralExpression(node))
      return { fact: exact([node]), state };
    if (ts.isPropertyAccessExpression(node) ||
      ts.isElementAccessExpression(node)) {
      const reference = index.reference(node);
      const root = index.unwrap(node.expression);
      return root.kind === ts.SyntaxKind.ThisKeyword ||
        reference?.symbol && hasToolcraftBinding(state, reference.symbol)
        ? propertyMemory.propertyValue(node, state, depth + 1)
        : { fact: exact([node]), state };
    }
    return { fact: exact([node]), state };
  }
  propertyMemory = createToolcraftFlowPropertyMemory({
    checker, index, materialize, propertyKeys, ts,
  });
  function positionalShapeFromFact(fact, state) {
    if (fact?.kind !== "exact") return undefined;
    const shapes = fact.values.map((node) =>
      state.objects.get(index.unwrap(node))?.array
    );
    return shapes.every(Boolean) && shapes.length === 1 ? shapes[0] : undefined;
  }
  function positionalFact(identity, slots, state) {
    return {
      fact: exact([identity]),
      state: withObject(state, identity, objectFact(new Map(), { array: {
        evidence: [], slots, tails: [],
      } })),
    };
  }
  function callableAt(expression, state) {
    const identity = index.unwrap(expression);
    return state.callables.has(identity) ? state.callables.get(identity) : undefined;
  }
  function captureCallable(identity, candidates, state) {
    const key = index.unwrap(identity);
    return withCallable(state, key, candidates.map((candidate) => ({
      ...candidate, identity: key,
    })));
  }
  function captureClosure(fn, state) {
    const identity = closureIdentity(fn, state, "closure");
    const captured = captureCallable(identity, [{
      bound: [],
      capturedEnvironment: captureToolcraftEnvironment(state),
      fn,
    }], state);
    return {
      fact: exact([identity]),
      state: withObject(captured, identity, objectFact()),
    };
  }
  function captureDeclaration(fn, state) {
    if (!fn.name) return state;
    const identity = closureIdentity(fn, state, "declaration");
    const declared = assignBinding(fn.name, exact([identity]), state);
    const captured = captureCallable(identity, [{
      bound: [],
      capturedEnvironment: captureToolcraftEnvironment(declared),
      fn,
    }], declared);
    return withObject(captured, identity, objectFact());
  }
  function assignBinding(node, fact, state) {
    return assignToolcraftBinding(
      state, checker.getSymbolAtLocation(node), fact ?? UNKNOWN,
    );
  }
  function projectIndex(fact, position, state) {
    const shapes = fact?.kind === "exact" && fact.values.map((value) =>
      state.objects.get(index.unwrap(value))?.array
    );
    return shapes && shapes.every(Boolean)
      ? mergeFacts(shapes.map((shape) => shape.slots[position] ??
        (shape.tails.length > 0 ? UNKNOWN : ABSENT))) : UNKNOWN;
  }
  function projectRest(fact, projection, state, target) {
    if (fact?.kind !== "exact") return { fact: UNKNOWN, state };
    const objects = fact.values.map((value) =>
      state.objects.get(index.unwrap(value))
    );
    if (objects.length !== 1 || !objects[0]) return { fact: UNKNOWN, state };
    const identity = index.unwrap(target);
    const [object] = objects;
    if (projection.kind === "array") {
      if (!object.array) return { fact: UNKNOWN, state };
      const array = Object.freeze({
        ...object.array,
        slots: Object.freeze(object.array.slots.slice(projection.index)),
      });
      return {
        fact: exact([identity]),
        state: withObject(state, identity, objectFact(new Map(), { array })),
      };
    }
    const excluded = new Set(projection.excluded);
    const propertyDescriptors = new Map([...object.propertyDescriptors]
      .filter(([name]) =>
      !excluded.has(name)
    ));
    return {
      fact: exact([identity]),
      state: withObject(state, identity, objectFactFromDescriptors(
        propertyDescriptors, { propertyRemainder: object.propertyRemainder,
          prototypeFact: object.prototypeFact },
      )),
    };
  }
  function commitEvaluatedLiteral(value, state) {
    const identity = index.unwrap(value.objectRef ?? value.source);
    if (!identity) return state;
    const descriptors = new Map();
    let propertyRemainder = toolcraftEmptyPropertyRemainder(), writeOrder = 0;
    const ordered = (descriptor, inserted) => withToolcraftDescriptorWriteOrder(descriptor, ++writeOrder, inserted ?? writeOrder);
    const addRemainder = (incoming) => {
      if (!incoming) return;
      const coverage = propertyKeys.mergeCoverage(
        propertyRemainder.coverage, incoming.coverage,
      );
      const entries = [...(propertyRemainder.entries ?? []),
        ...(incoming.entries ?? []).map((entry) => Object.freeze({ ...entry,
          descriptor: ordered(entry.descriptor), order: writeOrder }))];
      const next = { coverage, entries: Object.freeze(entries) };
      for (const domain of ["string", "symbol"]) {
        const represented = incoming.coverage[domain].unbounded ||
          incoming.coverage[domain].finiteTypes.length > 0;
        next[domain] = represented ? joinToolcraftDescriptors([
          propertyRemainder[domain], incoming[domain],
        ], mergeFacts, ABSENT) : propertyRemainder[domain];
      }
      propertyRemainder = Object.freeze(next);
    };
    for (const member of value.evaluatedMembers ?? []) {
      if (member.kind === "spread") {
        const remainder = member.propertyRemainder;
        const entryPresent = remainder?.entries?.some(({ descriptor }) =>
          descriptor.alternatives.some(({ kind }) => kind !== "absent"));
        if (entryPresent || ["string", "symbol"].some((domain) =>
          remainder?.[domain]?.alternatives.some(({ kind }) => kind !== "absent"))) {
          for (const [name, descriptor] of descriptors) descriptors.set(
            name, toolcraftUncertainDescriptor(descriptor),
          );
          addRemainder(remainder);
        }
        for (const [name, descriptor] of member.descriptors ?? []) {
          descriptors.set(name, overlayToolcraftDescriptor(descriptors.get(name),
            ordered(descriptor, descriptors.get(name)?.insertionOrder), mergeFacts, ABSENT));
        }
      } else if (member.descriptor) {
        if (member.key?.propertyKey) {
          const key = member.key.propertyKey.kind === "string"
            ? member.key.propertyKey.value : member.key.propertyKey;
          const previous = descriptors.get(key);
          const descriptor = member.kind === "get" || member.kind === "set"
            ? mergeToolcraftAccessorDescriptor(previous, member.descriptor)
            : member.descriptor;
          descriptors.set(key, ordered(descriptor, previous?.insertionOrder));
        }
        if (propertyKeys.hasCoverage(member.key?.keyFact)) {
          const empty = toolcraftEmptyPropertyRemainder();
          addRemainder(Object.freeze({ ...empty, entries: Object.freeze([
            Object.freeze({ coverage: member.key.keyFact.coverage, descriptor:
              member.descriptor, id: member.key.keyFact.dynamicId ??
              `literal-entry:${writeOrder + 1}`, order: writeOrder + 1 }),
          ]) }));
        }
      }
    }
    return withObject(state, identity, objectFactFromDescriptors(
      descriptors, { array: value.positionalShape, propertyRemainder },
    ));
  }
  return Object.freeze({ ...propertyMemory, assignBinding, callableAt, captureCallable,
    captureClosure, captureDeclaration, commitEvaluatedLiteral, declarePattern,
    isReferenceIdentity: (value) => referenceIdentities.has(index.unwrap(value)), materialize, positionalFact,
    positionalShapeFromFact, projectIndex, projectRest, propertyKeys,
    syntheticObjectIdentity });
}
