import {
  ABSENT, HOLE, UNKNOWN, exact, uncertain, updateState,
} from "./toolcraft-flow-facts.mjs";
import { activateToolcraftEnvironment } from
  "./toolcraft-flow-environments.mjs";

export function createToolcraftFlowActivation({
  assignPattern, checker, memory, ts,
}) {
  function bindingSymbols(name, symbols) {
    if (ts.isIdentifier(name)) {
      const symbol = checker.getSymbolAtLocation(name);
      if (symbol) symbols.add(symbol);
      return;
    }
    for (const element of name.elements ?? []) {
      if (!ts.isOmittedExpression(element)) bindingSymbols(element.name, symbols);
    }
  }

  function localSymbols(fn) {
    const symbols = new Set();
    for (const parameter of fn.parameters ?? []) {
      bindingSymbols(parameter.name, symbols);
    }
    function visit(node) {
      if (node !== fn.body && ts.isFunctionLike(node)) {
        if (ts.isFunctionDeclaration(node) && node.name) {
          bindingSymbols(node.name, symbols);
        }
        return;
      }
      if (ts.isVariableDeclaration(node)) bindingSymbols(node.name, symbols);
      if (ts.isCatchClause(node) && node.variableDeclaration) {
        bindingSymbols(node.variableDeclaration.name, symbols);
      }
      ts.forEachChild(node, visit);
    }
    if (fn.body) visit(fn.body);
    return symbols;
  }

  function parameterUnknown(parameter) {
    function typeNodes(typeNode, visited = new Set()) {
      if (!typeNode) return [];
      if (ts.isTypeQueryNode(typeNode)) return [typeNode.exprName];
      if (ts.isUnionTypeNode(typeNode) || ts.isIntersectionTypeNode(typeNode)) {
        return typeNode.types.flatMap((member) => typeNodes(member, visited));
      }
      if (ts.isParenthesizedTypeNode(typeNode) || ts.isArrayTypeNode(typeNode)) {
        return typeNodes(typeNode.type, visited);
      }
      if (!ts.isTypeReferenceNode(typeNode)) return [];
      const symbol = checker.getSymbolAtLocation(typeNode.typeName);
      if (!symbol || visited.has(symbol)) return [];
      const next = new Set(visited).add(symbol);
      return (symbol.declarations ?? []).flatMap((declaration) =>
        ts.isTypeAliasDeclaration(declaration)
          ? typeNodes(declaration.type, next) : []
      );
    }
    const type = checker.getTypeAtLocation(parameter.name);
    const variants = type?.isUnionOrIntersection?.() ? type.types
      : type ? [type] : [];
    const values = variants.flatMap((variant) => {
      const symbol = variant.aliasSymbol ?? variant.symbol;
      return (symbol?.declarations ?? []).flatMap((declaration) =>
        declaration.name ? [declaration.name] : []
      );
    });
    values.push(...typeNodes(parameter.type));
    return values.length > 0 ? uncertain(exact(values)) : UNKNOWN;
  }

  function activate(candidate, argumentFacts, state, depth, calls) {
    const fn = candidate.construction?.constructor ?? candidate.fn;
    const callerEnvironment = state.environment;
    const activated = updateState(activateToolcraftEnvironment(
      state, candidate.capturedEnvironment, fn ? localSymbols(fn) : new Set(),
    ), { returnFact: ABSENT, thisFact: candidate.thisFact ?? ABSENT });
    const supplied = [...candidate.bound, ...argumentFacts];
    let frames = [activated];
    for (const [position, parameter] of (fn?.parameters ?? []).entries()) {
      frames = frames.flatMap((frame) => {
        let suppliedFact = supplied[position] === HOLE
          ? ABSENT : supplied[position] ?? ABSENT;
        if (parameter.dotDotDotToken) {
          const rest = memory.positionalFact(
            parameter, supplied.slice(position), frame,
          );
          frame = rest.state;
          suppliedFact = rest.fact;
        }
        if (suppliedFact.kind === "absent" && !parameter.initializer) {
          suppliedFact = parameterUnknown(parameter);
        }
        return assignPattern(parameter, suppliedFact, frame, depth + 1, calls);
      });
    }
    return { callerEnvironment, frames, supplied };
  }

  return Object.freeze({ activate });
}
