import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { sourceLayout, workspaceRoot } from "./toolcraft-module-cutover-test-layout.mjs";

import ts from "typescript";

import {
  createToolcraftConstructorBindingContext,
  getCanonicalToolcraftConstructorName,
} from "./toolcraft-product-constructor-boundary.mjs";

const baselineCommit = "978770e0";
const sourcePattern = /\.[cm]?tsx?$/u;
const deletedBaselineAuthors = new Set([
  "packages/toolcraft-runtime/src/react/app-shell/toolcraft-root-persistence-migration.test.tsx",
  "packages/toolcraft-runtime/src/state/persistence-legacy-section-collapse.test.ts",
  "packages/toolcraft-runtime/src/state/persistence-media-migration.test.ts",
  "starter/src/app/acceptance/capability-proofs/legacy-wrapper-delegation.test.ts",
]);
const renamedBaselineAuthors = new Map([
  [
    "packages/toolcraft-runtime/src/react/controls-panel/__tests__/controls-panel.section-navigation.test.tsx",
    "packages/toolcraft-runtime/src/react/controls-panel/testing/controls-panel-section-navigation-test-utils.ts",
  ],
  [
    "packages/toolcraft-runtime/src/react/orientation-gizmo/orientation-gizmo-test-harness.tsx",
    "packages/toolcraft-runtime/src/react/orientation-gizmo/orientation-gizmo.test-support.tsx",
  ],
  [
    "packages/toolcraft-runtime/src/source-assets/source-asset-coordinator.test.ts",
    "packages/toolcraft-runtime/src/source-assets/source-asset-coordinator-test-support.ts",
  ],
  [
    "packages/toolcraft-runtime/src/schema/controls-panel-section-roundtrip.test.ts",
    "packages/toolcraft-runtime/src/schema/controls-panel-normalization-idempotency.test.ts",
  ],
]);
const baselineGroups = Object.freeze([
  Object.freeze({
    calls: 420,
    files: 144,
    id: "runtime",
    roots: ["packages/toolcraft-runtime/src"],
  }),
  Object.freeze({
    calls: 27,
    files: 14,
    id: "starter",
    roots: ["starter/src"],
  }),
  Object.freeze({
    calls: 1,
    files: 1,
    id: "cli",
    roots: ["cli/fixtures/generated-product/src/app/app-schema.ts"],
  }),
  Object.freeze({
    calls: 9,
    files: 9,
    id: "website",
    roots: ["apps/website/src/examples/toolcraft-components"],
  }),
]);
const e2eBaseline = Object.freeze({
  calls: 16,
  files: 9,
  roots: ["starter/e2e"],
});

function parseSource(filePath, source) {
  return ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

function collectDefineNodes(filePath, source) {
  const sourceFile = parseSource(filePath, source);
  const calls = [];
  let definitionCount = 0;
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "defineToolcraft"
    ) {
      calls.push(node);
    }
    if (
      ts.isFunctionDeclaration(node) &&
      node.name?.text === "defineToolcraft"
    ) {
      definitionCount += 1;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return { calls, count: calls.length + definitionCount, sourceFile };
}

function listBaselineFiles(roots) {
  return execFileSync(
    "git",
    ["ls-tree", "-r", "--name-only", baselineCommit, "--", ...roots],
    { cwd: workspaceRoot, encoding: "utf8", maxBuffer: 20_000_000 },
  )
    .trim()
    .split("\n")
    .filter((filePath) => sourcePattern.test(filePath));
}

function readBaselineFile(filePath) {
  return execFileSync("git", ["show", `${baselineCommit}:${filePath}`], {
    cwd: workspaceRoot,
    encoding: "utf8",
    maxBuffer: 20_000_000,
  });
}

function walkSources(root) {
  if (!fs.existsSync(root)) return [];
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const absolutePath = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...walkSources(absolutePath));
    else if (entry.isFile() && sourcePattern.test(entry.name))
      files.push(absolutePath);
  }
  return files.sort();
}

function currentFilesForRoots(roots) {
  return roots.flatMap((root) => {
    const absolutePath = path.join(sourceLayout.projectRoot, root);
    return fs.statSync(absolutePath).isDirectory()
      ? walkSources(absolutePath)
      : [absolutePath];
  });
}

function createCurrentAuthorProgram(roots) {
  return createToolcraftConstructorBindingContext({
    projectRoot: sourceLayout.projectRoot,
    rootNames: currentFilesForRoots(roots),
    runtimeSourceRoot: sourceLayout.runtimeSourceRoot,
  });
}

function assertExplicitProductDefinition(filePath, sourceFile, call, checker) {
  const input = call.arguments[0];
  const location = sourceFile.getLineAndCharacterOfPosition(
    call.getStart(sourceFile),
  );
  const label = `${filePath}:${location.line + 1}`;
  const precedingLine = sourceFile.text
    .slice(0, call.getStart(sourceFile))
    .trimEnd()
    .split("\n")
    .at(-1);
  if (
    precedingLine?.includes("@ts-expect-error") ||
    call.getFullText(sourceFile).includes("@ts-expect-error")
  )
    return;
  if (!ts.isObjectLiteralExpression(input)) {
    assert.ok(input, `${label} must pass a product definition`);
    assert.ok(
      ts.isIdentifier(input) || ts.isCallExpression(input),
      `${label} helper input must be an explicit typed product definition`,
    );
  }
  assert.deepEqual(
    checker
      .getPropertiesOfType(checker.getTypeAtLocation(input))
      .map(({ name }) => name)
      .filter(
        (name) =>
          name !== "authoredStateMigration" && name !== "defaults",
      )
      .sort(),
    ["base", "modules"],
    `${label} input must be exactly the public product definition`,
  );
  const signature = checker.getResolvedSignature(call);
  const parameter = signature?.getParameters()[0];
  assert.ok(signature && parameter, `${label} must resolve the public signature`);
  assert.equal(
    checker.isTypeAssignableTo(
      checker.getTypeAtLocation(input),
      checker.getTypeOfSymbolAtLocation(parameter, call),
    ),
    true,
    `${label} argument must satisfy the public product definition`,
  );
}

function inspectCurrentAuthors(roots, context) {
  const authors = [];
  for (const absolutePath of currentFilesForRoots(roots)) {
    const relativePath = path
      .relative(sourceLayout.projectRoot, absolutePath)
      .split(path.sep)
      .join("/");
    const sourceFile = context.program.getSourceFile(absolutePath);
    assert.ok(sourceFile, `${relativePath} must belong to the cutover program`);
    const calls = [];
    let definitionCount = 0;
    const visit = (node) => {
      if (ts.isCallExpression(node)) {
        const constructorName = getCanonicalToolcraftConstructorName(
          context,
          node.expression,
        );
        if (constructorName) {
          assert.ok(
            ts.isIdentifier(node.expression) &&
              node.expression.text === constructorName,
            `${relativePath} must call public ${constructorName} directly without aliases`,
          );
          if (constructorName === "defineToolcraft") calls.push(node);
        } else if (
          ts.isIdentifier(node.expression) &&
          (node.expression.text === "defineToolcraft" ||
            node.expression.text === "composeToolcraftApp")
        ) {
          assert.fail(
            `${relativePath} shadows public constructor ${node.expression.text}`,
          );
        }
      }
      if (
        ts.isFunctionDeclaration(node) &&
        node.name?.text === "defineToolcraft"
      ) {
        assert.equal(
          getCanonicalToolcraftConstructorName(context, node.name),
          "defineToolcraft",
          `${relativePath} shadows public constructor defineToolcraft`,
        );
        definitionCount += 1;
      }
      ts.forEachChild(node, visit);
    };
    visit(sourceFile);
    for (const call of calls) {
      assertExplicitProductDefinition(
        relativePath,
        sourceFile,
        call,
        context.checker,
      );
    }
    const count = calls.length + definitionCount;
    if (count > 0) authors.push({ count, path: relativePath });
  }
  return authors;
}

function assertDirectConstructor(
  context,
  filePath,
  exportName,
  constructorName,
) {
  const sourceFile = context.program.getSourceFile(filePath);
  assert.ok(sourceFile, `${filePath} must belong to the cutover program`);
  let found = false;
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (
        !ts.isIdentifier(declaration.name) ||
        declaration.name.text !== exportName
      )
        continue;
      found = true;
      assert.ok(
        declaration.initializer &&
          ts.isCallExpression(declaration.initializer) &&
          ts.isIdentifier(declaration.initializer.expression) &&
          declaration.initializer.expression.text === constructorName &&
          getCanonicalToolcraftConstructorName(
            context,
            declaration.initializer.expression,
          ) === constructorName,
        `${filePath} must create ${exportName} directly with ${constructorName}`,
      );
    }
  }
  assert.equal(found, true, `${filePath} must export ${exportName}`);
}

test("accounts for the immutable 457/168 cutover baseline and the 16/9 e2e scope", () => {
  if (sourceLayout.kind === "standalone") return;
  const baselineAuthors = [];
  for (const group of baselineGroups) {
    const authors = listBaselineFiles(group.roots).flatMap((filePath) => {
      const count = collectDefineNodes(
        filePath,
        readBaselineFile(filePath),
      ).count;
      return count === 0 ? [] : [{ count, path: filePath }];
    });
    assert.equal(
      authors.length,
      group.files,
      `${group.id} baseline file count drifted`,
    );
    assert.equal(
      authors.reduce((total, author) => total + author.count, 0),
      group.calls,
      `${group.id} baseline call count drifted`,
    );
    baselineAuthors.push(...authors);
  }
  assert.equal(baselineAuthors.length, 168);
  assert.equal(
    baselineAuthors.reduce((total, author) => total + author.count, 0),
    457,
  );

  for (const author of baselineAuthors) {
    const currentPath = renamedBaselineAuthors.get(author.path) ?? author.path;
    const absolutePath = path.join(workspaceRoot, currentPath);
    if (deletedBaselineAuthors.has(author.path)) {
      assert.equal(
        fs.existsSync(absolutePath),
        false,
        `${author.path} must stay deleted`,
      );
      continue;
    }
    assert.equal(
      fs.existsSync(absolutePath),
      true,
      `${author.path} was omitted from the cutover`,
    );
    assert.ok(
      collectDefineNodes(currentPath, fs.readFileSync(absolutePath, "utf8"))
        .count > 0,
      `${currentPath} must remain an accounted defineToolcraft author`,
    );
  }

  const e2eAuthors = listBaselineFiles(e2eBaseline.roots).flatMap(
    (filePath) => {
      const count = collectDefineNodes(
        filePath,
        readBaselineFile(filePath),
      ).count;
      return count === 0 ? [] : [{ count, path: filePath }];
    },
  );
  assert.equal(e2eAuthors.length, e2eBaseline.files);
  assert.equal(
    e2eAuthors.reduce((total, author) => total + author.count, 0),
    e2eBaseline.calls,
  );
});

test("every current author uses the closed product definition", () => {
  const roots = sourceLayout.kind === "workspace"
    ? [
        ...baselineGroups.flatMap((group) => group.roots),
        ...e2eBaseline.roots,
      ]
    : ["src/app", "e2e"];
  const context = createCurrentAuthorProgram(roots);
  if (sourceLayout.kind === "standalone") {
    inspectCurrentAuthors(roots, context);
    return;
  }
  const authors = baselineGroups.flatMap((group) =>
    inspectCurrentAuthors(group.roots, context),
  );
  assert.equal(authors.length, 226);
  assert.equal(
    authors.reduce((total, author) => total + author.count, 0),
    565,
  );
  const e2eAuthors = inspectCurrentAuthors(e2eBaseline.roots, context);
  assert.equal(e2eAuthors.length, 23);
  assert.equal(
    e2eAuthors.reduce((total, author) => total + author.count, 0),
    31,
  );
});

test("rejects constructor alias, shadow, and argument-shape bypasses", (context) => {
  const fixtureRoot = fs.mkdtempSync(
    path.join(sourceLayout.projectRoot, ".toolcraft-module-cutover-"),
  );
  context.after(() => fs.rmSync(fixtureRoot, { force: true, recursive: true }));
  const cases = Object.freeze([
    Object.freeze({
      expected: /must call public defineToolcraft directly without aliases/u,
      name: "alias.ts",
      source: `
        import { defineToolcraft as constructProduct } from "${sourceLayout.publicRuntimeSpecifier}";
        constructProduct({ base: {}, modules: [] });
      `,
    }),
    Object.freeze({
      expected: /shadows public constructor defineToolcraft/u,
      name: "shadow.ts",
      source: `
        function defineToolcraft(input: unknown) { return input; }
        defineToolcraft({ base: {}, modules: [] });
      `,
    }),
    Object.freeze({
      expected: /input must be exactly the public product definition/u,
      name: "argument-bypass.ts",
      source: `
        import { defineToolcraft } from "${sourceLayout.publicRuntimeSpecifier}";
        const product = { base: {}, escape: true, modules: [] };
        defineToolcraft(product);
      `,
    }),
  ]);
  for (const fixture of cases) {
    const filePath = path.join(fixtureRoot, fixture.name);
    fs.writeFileSync(filePath, fixture.source);
    const relativePath = path.relative(sourceLayout.projectRoot, filePath);
    const bindingContext = createCurrentAuthorProgram([relativePath]);
    assert.throws(
      () => inspectCurrentAuthors([relativePath], bindingContext),
      fixture.expected,
    );
  }
});

test("signed starter and CLI entry points use the public constructors", () => {
  const signedEntries = sourceLayout.kind === "workspace"
    ? [
        ["starter/src/app/app-schema.ts", "appSchema", "defineToolcraft"],
        ["starter/src/app/app-composition.tsx", "appComposition", "composeToolcraftApp"],
        ["cli/fixtures/generated-product/src/app/app-schema.ts", "appSchema", "defineToolcraft"],
        ["cli/fixtures/generated-product/src/app/app-composition.tsx", "appComposition", "composeToolcraftApp"],
      ]
    : [
        ["src/app/app-schema.ts", "appSchema", "defineToolcraft"],
        ["src/app/app-composition.tsx", "appComposition", "composeToolcraftApp"],
      ];
  const roots = signedEntries.map(([filePath]) => filePath);
  const context = createCurrentAuthorProgram(roots);
  for (const [filePath, exportName, constructorName] of signedEntries) {
    assertDirectConstructor(
      context,
      path.join(sourceLayout.projectRoot, filePath),
      exportName,
      constructorName,
    );
  }
});
