export function createToolcraftHostCallOrigin({
  checker,
  flowValues,
  importedOperation,
  mergeFacts,
  operations,
  resolveStaticString,
  targetOf,
  ts,
}) {
  return function callOrigin(call, visited, context) {
    if (visited.has(call)) return [{ kind: "unknown", overflow: true }];
    visited = new Set(visited).add(call);
    const callee = call.expression;
    const requireDeclarations = ts.isIdentifier(callee) && callee.text === "require"
      ? checker.getSymbolAtLocation(callee)?.declarations ?? [] : undefined;
    const moduleLoad = callee.kind === ts.SyntaxKind.ImportKeyword ||
      requireDeclarations?.every((declaration) => declaration.getSourceFile().isDeclarationFile);
    const specifier = moduleLoad && call.arguments[0] && resolveStaticString(call.arguments[0]);
    if (specifier) return [{ kind: "import", importedName: "*", members: [], sourceFiles: [], specifier }];
    const wrappers = operations.originOf(
      call.expression,
      new Set(visited),
      context,
    );
    const wrapper = wrappers.find((origin) => origin.kind === "import" &&
      origin.specifier === "react" &&
      ["forwardRef", "memo"].includes(importedOperation(origin)));
    if (wrapper && call.arguments[0]) {
      const direct = operations.originOf(
        call.arguments[0],
        new Set(visited),
        context,
      );
      if (direct.some(({ kind }) => kind !== "unknown")) return direct;
      const captured = operations.possibleImportsIn(
        call.arguments[0],
        visited,
        context,
      );
      if (captured.length > 0) return mergeFacts(captured);
    }

    const result = flowValues.resultAt(call, call);
    if (result.kind === "overflow") return [{ kind: "unknown", overflow: true }];
    const possible = result.kind === "exact" ? result.values
      : result.possibleValues ?? [];
    const resolved = possible.filter((value) => value !== call).flatMap((value) =>
      operations.originOf(value, new Set(visited), context)
    );
    if (resolved.length > 0) {
      return mergeFacts(result.kind === "unknown" ? resolved.map((fact) =>
        fact.kind === "import" ? { ...fact, possible: true } : fact
      ) : resolved);
    }
    return [{ kind: "unknown" }];
  };
}
