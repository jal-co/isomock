export function unwrapToolcraftHostExpression(node, ts) {
  let current = node;
  while (
    ts.isAsExpression(current) || ts.isNonNullExpression(current) ||
    ts.isParenthesizedExpression(current) || ts.isSatisfiesExpression(current) ||
    ts.isTypeAssertionExpression(current)
  ) current = current.expression;
  return current;
}

function moduleSpecifierOf(declaration, ts) {
  for (let current = declaration; current; current = current.parent) {
    if (
      (ts.isImportDeclaration(current) || ts.isExportDeclaration(current)) &&
      current.moduleSpecifier && ts.isStringLiteralLike(current.moduleSpecifier)
    ) return current.moduleSpecifier.text;
    if (ts.isSourceFile(current)) return undefined;
  }
  return undefined;
}

export function toolcraftHostImportOrigin(declaration, ts) {
  const specifier = moduleSpecifierOf(declaration, ts);
  if (!specifier) return undefined;
  if (ts.isImportSpecifier(declaration) || ts.isExportSpecifier(declaration)) {
    return {
      importedName: declaration.propertyName?.text ?? declaration.name.text,
      kind: "import",
      members: [],
      sourceFiles: [],
      specifier,
    };
  }
  if (ts.isNamespaceImport(declaration)) {
    return {
      importedName: "*",
      kind: "import",
      members: [],
      sourceFiles: [],
      specifier,
    };
  }
  if (ts.isNamespaceExport?.(declaration)) {
    return {
      importedName: "*",
      kind: "import",
      members: [],
      sourceFiles: [],
      specifier,
    };
  }
  if (ts.isImportClause(declaration) && declaration.name) {
    return {
      importedName: "default",
      kind: "import",
      members: [],
      sourceFiles: [],
      specifier,
    };
  }
  return undefined;
}

export function toolcraftHostStaticMemberName(node, resolveStaticString, ts) {
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  if (node.argumentExpression && ts.isNumericLiteral(node.argumentExpression)) {
    return node.argumentExpression.text;
  }
  return node.argumentExpression
    ? resolveStaticString(node.argumentExpression)
    : undefined;
}

export function toolcraftHostTypeMemberPresence(type, member, checker, ts) {
  const candidates = type.isUnionOrIntersection?.() ? type.types : [type];
  const mayContain = candidates.some((candidate) =>
    (candidate.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) !== 0 ||
    Boolean(checker.getPropertyOfType(candidate, member)) ||
    Boolean(checker.getIndexTypeOfType(candidate, ts.IndexKind.String))
  );
  if (!mayContain) return "absent";
  const property = checker.getPropertyOfType(type, member);
  return property && (property.flags & ts.SymbolFlags.Optional) === 0
    ? "required" : "possible";
}

export function toolcraftHostSpreadMemberPresence(
  expression, member, checker, ts,
) {
  return toolcraftHostTypeMemberPresence(
    checker.getTypeAtLocation(expression),
    member,
    checker,
    ts,
  );
}

export function toolcraftHostBindingMember(
  declaration,
  resolveStaticString,
  ts,
) {
  if (ts.isArrayBindingPattern(declaration.parent)) {
    const index = declaration.parent.elements.indexOf(declaration);
    return index < 0 ? undefined : String(index);
  }
  const key = declaration.propertyName ?? declaration.name;
  if (ts.isIdentifier(key) || ts.isStringLiteralLike(key)) return key.text;
  return ts.isComputedPropertyName(key)
    ? resolveStaticString(key.expression)
    : undefined;
}

export function toolcraftHostBindingPath(
  declaration,
  resolveStaticString,
  ts,
) {
  const path = [];
  for (let current = declaration; ts.isBindingElement(current);) {
    if (!current.dotDotDotToken) {
      const member = toolcraftHostBindingMember(
        current,
        resolveStaticString,
        ts,
      );
      if (!member) return undefined;
      path.unshift(member);
    }
    const pattern = current.parent;
    const owner = pattern.parent;
    if (!ts.isBindingElement(owner)) break;
    current = owner;
  }
  return path;
}

export function toolcraftHostBindingInitializer(declaration, ts) {
  for (let current = declaration.parent; current; current = current.parent) {
    if (ts.isVariableDeclaration(current)) return current.initializer;
    if (ts.isParameter(current)) return current.initializer;
    if (ts.isStatement(current)) return undefined;
  }
  return undefined;
}

export function toolcraftHostBindingRoot(declaration, ts) {
  for (let current = declaration.parent; current; current = current.parent) {
    if (ts.isVariableDeclaration(current) || ts.isParameter(current)) {
      return current;
    }
    if (ts.isStatement(current)) return undefined;
  }
  return undefined;
}

export function isToolcraftHostDeclarationName(node, ts) {
  const parent = node.parent;
  return (ts.isImportClause(parent) && parent.name === node) ||
    ts.isImportSpecifier(parent) || ts.isNamespaceImport(parent) ||
    (ts.isVariableDeclaration(parent) && parent.name === node) ||
    (ts.isBindingElement(parent) && parent.name === node) ||
    (ts.isParameter(parent) && parent.name === node);
}

export function isToolcraftTypeOnlyReference(node, ts) {
  for (let current = node; current; current = current.parent) {
    if (ts.isImportSpecifier(current) && current.isTypeOnly) return true;
    if (ts.isExportSpecifier(current) && current.isTypeOnly) return true;
    if (ts.isImportClause(current) && current.isTypeOnly) return true;
    if (ts.isExportDeclaration(current) && current.isTypeOnly) return true;
    if (ts.isTypeNode(current)) return true;
    if (ts.isStatement(current) || ts.isSourceFile(current)) return false;
  }
  return false;
}

export function toolcraftHostLiteralStrings(type, ts) {
  if (!type) return [];
  if ((type.flags & ts.TypeFlags.StringLiteral) !== 0) return [type.value];
  if (!type.isUnion?.()) return [];
  return type.types.every((member) =>
    (member.flags & ts.TypeFlags.StringLiteral) !== 0
  ) ? type.types.map((member) => member.value) : [];
}

export function toolcraftHostImportedOperation(origin) {
  if (origin.kind !== "import") return undefined;
  return origin.importedName === "*" || origin.importedName === "default"
    ? origin.members[0]
    : origin.importedName;
}

export function toolcraftHostCallArgument(call, invocation, index, ts) {
  if (!invocation) return call.arguments[index];
  if (invocation === "call") return call.arguments[index + 1];
  const values = call.arguments[1] &&
    unwrapToolcraftHostExpression(call.arguments[1], ts);
  return values && ts.isArrayLiteralExpression(values)
    ? values.elements[index]
    : undefined;
}
