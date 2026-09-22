import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  parseToolcraftTypeScriptSource,
} from "./toolcraft-typescript-source-evidence.mjs";

async function findRuntimeAppSource(starterRoot) {
  const candidates = [
    path.resolve(
      starterRoot,
      "src/toolcraft/runtime/react/app-shell/toolcraft-app.tsx",
    ),
    path.resolve(
      starterRoot,
      "../packages/toolcraft-runtime/src/react/app-shell/toolcraft-app.tsx",
    ),
  ];
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  assert.fail("Expected a standalone or workspace Toolcraft runtime source.");
}

test("prefers the copied standalone runtime when a workspace runtime is also visible", async (t) => {
  const repoRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "toolcraft-route-runtime-"),
  );
  t.after(() => fs.rm(repoRoot, { force: true, recursive: true }));
  const standaloneRoot = path.join(repoRoot, "generated-app");
  const copiedRuntime = path.join(
    standaloneRoot,
    "src/toolcraft/runtime/react/app-shell/toolcraft-app.tsx",
  );
  const workspaceRuntime = path.join(
    repoRoot,
    "packages/toolcraft-runtime/src/react/app-shell/toolcraft-app.tsx",
  );
  await Promise.all([
    fs.mkdir(path.dirname(copiedRuntime), { recursive: true }),
    fs.mkdir(path.dirname(workspaceRuntime), { recursive: true }),
  ]);
  await Promise.all([
    fs.writeFile(copiedRuntime, "copied"),
    fs.writeFile(workspaceRuntime, "workspace"),
  ]);

  assert.equal(await findRuntimeAppSource(standaloneRoot), copiedRuntime);
});

async function parseSource(filePath) {
  const parsed = parseToolcraftTypeScriptSource({
    absolutePath: filePath,
    rawSource: await fs.readFile(filePath, "utf8"),
  });
  assert.ok(parsed, "TypeScript is required to verify the signed Toolcraft route.");
  return parsed;
}

function readPropertyName(name, ts) {
  assert.ok(
    ts.isIdentifier(name) || ts.isStringLiteralLike(name),
    "ToolcraftAppComposition properties must use static names.",
  );
  return name.text;
}

function collectCompositionKeys(sourceFile, ts) {
  const declarations = sourceFile.statements.filter(
    (statement) =>
      ts.isTypeAliasDeclaration(statement) &&
      statement.name.text === "ToolcraftAppComposition",
  );
  assert.equal(declarations.length, 1, "Expected one ToolcraftAppComposition type.");
  const declaration = declarations[0];
  const compositionType =
    ts.isTypeReferenceNode(declaration.type) &&
    ts.isIdentifier(declaration.type.typeName) &&
    declaration.type.typeName.text === "Readonly" &&
    declaration.type.typeArguments?.length === 1
      ? declaration.type.typeArguments[0]
      : declaration.type;
  assert.ok(
    ts.isTypeLiteralNode(compositionType),
    "ToolcraftAppComposition must remain a closed Readonly type literal.",
  );
  const keys = compositionType.members.map((member) => {
    assert.ok(
      ts.isPropertySignature(member) && member.name,
      "ToolcraftAppComposition must contain only named properties.",
    );
    return readPropertyName(member.name, ts);
  });
  assert.equal(new Set(keys).size, keys.length, "Composition keys must be unique.");
  return keys;
}

function findCompositionBinding(sourceFile, ts) {
  const imports = sourceFile.statements.filter(
    (statement) =>
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteralLike(statement.moduleSpecifier) &&
      /\.\.\/app\/(?:starter|app)-composition$/u.test(
        statement.moduleSpecifier.text,
      ),
  );
  assert.equal(imports.length, 1, "Expected one signed composition import.");
  const bindings = imports[0].importClause?.namedBindings;
  assert.ok(
    bindings && ts.isNamedImports(bindings) && bindings.elements.length === 1,
    "The signed route must import one named composition binding.",
  );
  return bindings.elements[0].name.text;
}

function findToolcraftAppElement(sourceFile, ts) {
  const elements = [];
  const visit = (node) => {
    if (
      ts.isJsxSelfClosingElement(node) &&
      ts.isIdentifier(node.tagName) &&
      node.tagName.text === "ToolcraftApp"
    ) {
      elements.push(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  assert.equal(elements.length, 1, "Expected one signed ToolcraftApp host.");
  return elements[0];
}

test("forwards every ToolcraftAppComposition property through the signed route", async () => {
  const starterRoot = path.resolve(import.meta.dirname, "..");
  const runtimePath = await findRuntimeAppSource(starterRoot);
  const routePath = path.join(starterRoot, "src/routes/index.tsx");
  const runtime = await parseSource(runtimePath);
  const route = await parseSource(routePath);
  const compositionKeys = collectCompositionKeys(runtime.sourceFile, runtime.ts);
  const compositionBinding = findCompositionBinding(route.sourceFile, route.ts);
  const appElement = findToolcraftAppElement(route.sourceFile, route.ts);
  const forwardedKeys = [];
  const hostKeys = [];

  for (const attribute of appElement.attributes.properties) {
    assert.ok(
      route.ts.isJsxAttribute(attribute),
      "The signed route must forward composition fields explicitly without JSX spread.",
    );
    assert.ok(
      route.ts.isIdentifier(attribute.name),
      "ToolcraftApp props must use static names.",
    );
    const propName = attribute.name.text;
    if (route.ts.isStringLiteral(attribute.initializer)) {
      hostKeys.push(propName);
      continue;
    }
    assert.ok(
      attribute.initializer &&
        route.ts.isJsxExpression(attribute.initializer) &&
        attribute.initializer.expression &&
        route.ts.isPropertyAccessExpression(attribute.initializer.expression),
      `ToolcraftApp prop "${propName}" must directly read the signed composition.`,
    );
    const expression = attribute.initializer.expression;
    assert.ok(
      route.ts.isIdentifier(expression.expression) &&
        expression.expression.text === compositionBinding,
      `ToolcraftApp prop "${propName}" must read ${compositionBinding}.`,
    );
    assert.equal(
      expression.name.text,
      propName,
      `ToolcraftApp prop "${propName}" must forward the same-named composition field.`,
    );
    forwardedKeys.push(propName);
  }

  assert.deepEqual(hostKeys, ["className"]);
  assert.deepEqual(forwardedKeys, compositionKeys);
});
