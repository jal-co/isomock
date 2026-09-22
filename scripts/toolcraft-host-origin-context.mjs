import { toolcraftHostTypeMemberPresence as typeMemberPresence } from
  "./toolcraft-host-origin-values.mjs";

const MAX_CONTEXT_BINDINGS = 32;
const MAX_CONTEXT_DEPTH = 12;

export const emptyToolcraftHostOriginContext = Object.freeze({
  bindings: Object.freeze([]),
  depth: 0,
});

function propertyName(node, resolveStaticString, ts) {
  if (ts.isIdentifier(node) || ts.isStringLiteralLike(node) ||
    ts.isNumericLiteral(node)) return node.text;
  return ts.isComputedPropertyName(node)
    ? resolveStaticString(node.expression)
    : undefined;
}

function reference(expression, context, path = [], options = {}) {
  return Object.freeze({
    arrayOffset: options.arrayOffset,
    context,
    excluded: Object.freeze(options.excluded ?? []),
    expression,
    path: Object.freeze(path),
    possible: options.possible === true,
    restIndex: options.restIndex,
  });
}

export function createToolcraftHostCallContext({
  arguments: callArguments,
  checker,
  declaration,
  parentContext,
  resolveStaticString,
  ts,
}) {
  if (!declaration.parameters || parentContext.depth >= MAX_CONTEXT_DEPTH) {
    return undefined;
  }
  const bindings = [];
  function addBinding(name, references) {
    if (!ts.isIdentifier(name) || bindings.length >= MAX_CONTEXT_BINDINGS) return;
    const symbol = checker.getSymbolAtLocation(name);
    if (symbol) bindings.push(Object.freeze({
      references: Object.freeze(references),
      symbol,
    }));
  }
  function bindPattern(name, references) {
    if (ts.isIdentifier(name)) {
      addBinding(name, references);
      return;
    }
    for (const [index, element] of name.elements.entries()) {
      if (ts.isOmittedExpression(element)) continue;
      const fallback = element.initializer
        ? [reference(element.initializer, parentContext)] : [];
      if (ts.isObjectBindingPattern(name)) {
        const key = element.propertyName
          ? propertyName(element.propertyName, resolveStaticString, ts)
          : ts.isIdentifier(element.name) ? element.name.text : undefined;
        if (element.dotDotDotToken) {
          const excluded = name.elements.flatMap((sibling) => {
            if (sibling === element || ts.isOmittedExpression(sibling)) return [];
            const siblingName = sibling.propertyName
              ? propertyName(sibling.propertyName, resolveStaticString, ts)
              : ts.isIdentifier(sibling.name) ? sibling.name.text : undefined;
            return siblingName === undefined ? [] : [siblingName];
          });
          bindPattern(element.name, references.map((item) => reference(
            item.expression,
            item.context,
            item.path,
            { excluded },
          )));
        } else if (key !== undefined) {
          const actual = references.flatMap((item) => {
            let type = checker.getTypeAtLocation(item.expression);
            for (const member of item.path) {
              const property = checker.getPropertyOfType(type, member);
              type = property
                ? checker.getTypeOfSymbolAtLocation(
                  property,
                  property.valueDeclaration ?? item.expression,
                )
                : checker.getIndexTypeOfType(
                  type,
                  /^\d+$/u.test(member)
                    ? ts.IndexKind.Number : ts.IndexKind.String,
                );
              if (!type) break;
            }
            const presence = type ? typeMemberPresence(
              type,
              key,
              checker,
              ts,
            ) : "absent";
            return presence === "absent" ? [] : [reference(
              item.expression,
              item.context,
              [...item.path, key],
              { possible: item.possible || presence === "possible" },
            )];
          });
          const actualMayBeAbsent = actual.length === 0 || actual.some(
            (item) => item.possible
          );
          bindPattern(element.name, [
            ...actual,
            ...(actualMayBeAbsent ? fallback.map((item) => reference(
              item.expression,
              item.context,
              item.path,
              { possible: actual.length > 0 },
            )) : []),
          ]);
        }
        continue;
      }
      if (element.dotDotDotToken) {
        bindPattern(element.name, references.map((item) => reference(
          item.expression,
          item.context,
          item.path,
          { arrayOffset: index },
        )));
      } else {
        bindPattern(element.name, [
          ...references.map((item) => reference(
            item.expression,
            item.context,
            [...item.path, String(index)],
          )),
          ...fallback,
        ]);
      }
    }
  }

  for (const [index, parameter] of declaration.parameters.entries()) {
    const expressions = parameter.dotDotDotToken
      ? callArguments.slice(index)
      : callArguments[index]
        ? [callArguments[index]]
        : parameter.initializer ? [parameter.initializer] : [];
    const references = expressions.map((expression, restIndex) =>
      reference(expression, parentContext, [], {
        restIndex: parameter.dotDotDotToken ? restIndex : undefined,
      })
    );
    bindPattern(parameter.name, references);
  }
  return Object.freeze({
    bindings: Object.freeze([
      ...bindings,
      ...parentContext.bindings,
    ].slice(0, MAX_CONTEXT_BINDINGS)),
    depth: parentContext.depth + 1,
  });
}

export function getToolcraftHostBoundReferences(context, symbol, members = []) {
  const binding = context.bindings.find((candidate) =>
    candidate.symbol === symbol
  );
  if (!binding) return undefined;
  return Object.freeze(binding.references.flatMap((item) => {
    let requested = members;
    if (item.restIndex !== undefined && /^\d+$/u.test(members[0] ?? "")) {
      if (Number(members[0]) !== item.restIndex) return [];
      requested = members.slice(1);
    }
    if (item.arrayOffset !== undefined && /^\d+$/u.test(members[0] ?? "")) {
      requested = [
        String(item.arrayOffset + Number(members[0])),
        ...members.slice(1),
      ];
    }
    if (item.excluded.includes(requested[0])) return [];
    return [Object.freeze({
      context: item.context,
      expression: item.expression,
      path: Object.freeze([...item.path, ...requested]),
      possible: item.possible,
    })];
  }));
}
