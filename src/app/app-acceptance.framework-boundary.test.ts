import { readFileSync } from "node:fs";
import {
  basename,
  dirname,
  join,
  relative,
} from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";
import { describe, expect, it } from "vitest";

const currentFileName = basename(fileURLToPath(import.meta.url));
const appDir = dirname(fileURLToPath(import.meta.url));
const acceptancePrefix = currentFileName.startsWith("app-acceptance")
  ? "app-acceptance"
  : "app-acceptance";
const pureValidatorPath = join(appDir, "acceptance", "validate-coverage.ts");
const sourceExtensions = [
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
];

const productGateRoles = new Set([
  "base-coverage.test.ts",
  "product-output-export.test.ts",
  "product-readiness.test.ts",
  "test-coverage.test.ts",
  "product-worklog.test.ts",
]);

const forbiddenProductModules = new Set([
  join(appDir, `${acceptancePrefix}.ts`),
  join(appDir, `${acceptancePrefix}-data.ts`),
  join(
    appDir,
    acceptancePrefix === "app-acceptance" ? "app-schema.ts" : "app-schema.ts",
  ),
]);

function isProductGateTestFile(filePath: string): boolean {
  const fileName = basename(filePath);
  const rolePrefix = `${acceptancePrefix}.`;
  const role = fileName.startsWith(rolePrefix)
    ? fileName.slice(rolePrefix.length)
    : null;

  return role !== null && productGateRoles.has(role);
}

function loadCompilerOptions(): ts.CompilerOptions {
  const configPath = ts.findConfigFile(appDir, ts.sys.fileExists, "tsconfig.json");
  if (!configPath) {
    throw new Error(`Unable to find tsconfig.json from ${appDir}.`);
  }

  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error) {
    throw new Error(
      ts.flattenDiagnosticMessageText(config.error.messageText, "\n"),
    );
  }

  const parsed = ts.parseJsonConfigFileContent(
    config.config,
    ts.sys,
    dirname(configPath),
  );
  if (parsed.errors.length > 0) {
    throw new Error(
      parsed.errors
        .map((error) => ts.flattenDiagnosticMessageText(error.messageText, "\n"))
        .join("\n"),
    );
  }

  return parsed.options;
}

const compilerOptions = loadCompilerOptions();

function listSourceFiles(directory: string): string[] {
  return ts.sys.readDirectory(directory, sourceExtensions);
}

function getModuleSpecifiersFromSource(
  filePath: string,
  source: string,
): string[] {
  const sourceFile = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const moduleSpecifiers: string[] = [];

  function visit(node: ts.Node): void {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier) &&
      node.moduleSpecifier.text.length > 0
    ) {
      moduleSpecifiers.push(node.moduleSpecifier.text);
    }

    if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      node.moduleReference.expression &&
      ts.isStringLiteralLike(node.moduleReference.expression)
    ) {
      moduleSpecifiers.push(node.moduleReference.expression.text);
    }

    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length >= 1 &&
      ts.isStringLiteralLike(node.arguments[0]) &&
      node.arguments[0].text.length > 0
    ) {
      moduleSpecifiers.push(node.arguments[0].text);
    }

    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "require" &&
      node.arguments.length >= 1 &&
      ts.isStringLiteralLike(node.arguments[0]) &&
      node.arguments[0].text.length > 0
    ) {
      moduleSpecifiers.push(node.arguments[0].text);
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return moduleSpecifiers;
}

function getModuleSpecifiers(filePath: string): string[] {
  return getModuleSpecifiersFromSource(
    filePath,
    readFileSync(filePath, "utf8"),
  );
}

function resolveLocalModule(
  sourceFiles: ReadonlySet<string>,
  fromFile: string,
  moduleSpecifier: string,
  options: ts.CompilerOptions = compilerOptions,
): string | null {
  const resolvedModule = ts.resolveModuleName(
    moduleSpecifier,
    fromFile,
    options,
    ts.sys,
  ).resolvedModule;

  return resolvedModule && sourceFiles.has(resolvedModule.resolvedFileName)
    ? resolvedModule.resolvedFileName
    : null;
}

function createLocalImportGraph(
  sourceFiles: readonly string[],
): Map<string, string[]> {
  const sourceFileSet = new Set(sourceFiles);

  return new Map(
    sourceFiles.map((filePath) => [
      filePath,
      getModuleSpecifiers(filePath).flatMap((moduleSpecifier) => {
        const resolvedModule = resolveLocalModule(
          sourceFileSet,
          filePath,
          moduleSpecifier,
        );

        return resolvedModule ? [resolvedModule] : [];
      }),
    ]),
  );
}

function findForbiddenDependencyPath(
  graph: ReadonlyMap<string, readonly string[]>,
  rootFile: string,
): string[] | null {
  const queue: string[][] = [[rootFile]];
  const visited = new Set([rootFile]);

  while (queue.length > 0) {
    const path = queue.shift();
    if (!path) {
      continue;
    }

    const currentFile = path.at(-1);
    if (!currentFile) {
      continue;
    }

    for (const dependency of graph.get(currentFile) ?? []) {
      const dependencyPath = [...path, dependency];

      if (forbiddenProductModules.has(dependency)) {
        return dependencyPath;
      }

      if (!visited.has(dependency)) {
        visited.add(dependency);
        queue.push(dependencyPath);
      }
    }
  }

  return null;
}

describe("Toolcraft framework acceptance boundary", () => {
  it("resolves configured app aliases as local module dependencies", () => {
    const sourceFiles = new Set(listSourceFiles(appDir));
    const aliasedFacadePath = join(appDir, `${acceptancePrefix}.ts`);
    const aliasedDataPath = join(appDir, `${acceptancePrefix}-data.ts`);
    const fixtureSource = [
      `export * from "@/app/${acceptancePrefix}";`,
      `import acceptanceFacade = require("@/app/${acceptancePrefix}");`,
      `const acceptanceData = import("#/app/${acceptancePrefix}-data", { with: { type: "json" } });`,
      `const requiredAcceptance = require("@/app/${acceptancePrefix}");`,
    ].join("\n");

    expect(
      getModuleSpecifiersFromSource(
        join(appDir, "acceptance-alias-fixture.ts"),
        fixtureSource,
      ),
    ).toEqual([
      `@/app/${acceptancePrefix}`,
      `@/app/${acceptancePrefix}`,
      `#/app/${acceptancePrefix}-data`,
      `@/app/${acceptancePrefix}`,
    ]);
    expect(
      resolveLocalModule(
        sourceFiles,
        join(appDir, "acceptance-alias-fixture.ts"),
        `@/app/${acceptancePrefix}`,
      ),
    ).toBe(aliasedFacadePath);
    expect(
      resolveLocalModule(
        sourceFiles,
        join(appDir, "acceptance-alias-fixture.ts"),
        `#/app/${acceptancePrefix}-data`,
      ),
    ).toBe(aliasedDataPath);
    expect(
      resolveLocalModule(
        sourceFiles,
        join(appDir, "acceptance-alias-fixture.ts"),
        `$/app/${acceptancePrefix}`,
        {
          ...compilerOptions,
          paths: {
            ...compilerOptions.paths,
            "$/*": ["./src/*"],
          },
        },
      ),
    ).toBe(aliasedFacadePath);
  });

  it("grants product-gate access only to exact acceptance test roles", () => {
    expect(
      isProductGateTestFile(
        join(appDir, `${acceptancePrefix}.product-output-export.test.ts`),
      ),
    ).toBe(true);
    expect(
      isProductGateTestFile(
        join(appDir, `${acceptancePrefix}.synthetic-product-output-export.test.ts`),
      ),
    ).toBe(false);
  });

  it("keeps the acceptance validator independent from mutable product modules", () => {
    const source = readFileSync(pureValidatorPath, "utf8");

    expect(source).not.toMatch(/(?:starter|app)-(?:acceptance-data|schema)/);
  });

  it("keeps synthetic framework contract tests independent from mutable product state", () => {
    const sourceFiles = listSourceFiles(appDir);
    const graph = createLocalImportGraph(sourceFiles);
    const errors = sourceFiles
      .filter((filePath) => dirname(filePath) === appDir)
      .filter((filePath) => basename(filePath).startsWith(`${acceptancePrefix}.`))
      .filter((filePath) => /\.(?:spec|test)\.[cm]?[jt]sx?$/.test(filePath))
      .filter((filePath) => basename(filePath) !== currentFileName)
      .filter((filePath) => !isProductGateTestFile(filePath))
      .flatMap((filePath) => {
        const dependencyPath = findForbiddenDependencyPath(graph, filePath);

        return dependencyPath
          ? [dependencyPath.map((entry) => relative(appDir, entry)).join(" -> ")]
          : [];
      });

    expect(
      errors,
      "Synthetic framework contract tests must not reach mutable product modules through any local import path.",
    ).toEqual([]);
  });
});
