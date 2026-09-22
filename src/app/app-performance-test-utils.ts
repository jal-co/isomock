import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

import { collectToolcraftSourceInventorySync } from "../../scripts/toolcraft-source-inventory.mjs";
import {
  collectToolcraftTypeScriptCallTargets,
  collectToolcraftTypeScriptModuleBindings,
  createToolcraftTypeScriptChecker,
  getToolcraftTypeScriptImportedCallTarget,
  unwrapToolcraftTypeScriptExpression,
} from "../../scripts/toolcraft-typescript-analysis.mjs";

import { compositionHasProductCanvasSurface } from "./app-acceptance.composition-test-utils";
import { appComposition } from "./app-composition";
import { appSchema } from "./app-schema";

export const appDir = dirname(fileURLToPath(import.meta.url));
export const srcDir = join(appDir, "..");
export const routesDir = join(appDir, "../routes");
export const e2eDir = join(appDir, "../../e2e");
export const projectDir = join(appDir, "../..");

export function createToolcraftTypeScriptSourceAnalysis(
  source: string,
  fileName: string,
) {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const checker = createToolcraftTypeScriptChecker(sourceFile, ts);
  const bindings = collectToolcraftTypeScriptModuleBindings(
    sourceFile,
    ts,
    checker,
  );
  const callTargets = collectToolcraftTypeScriptCallTargets({
    bindings,
    checker,
    sourceFile,
    ts,
  });
  const importedCalls: Array<
    Readonly<{
      call: ts.CallExpression;
      target: Readonly<{
        importedName: string;
        memberPath: string;
        specifier: string;
      }>;
    }>
  > = [];
  function visit(node: ts.Node): void {
    if (ts.isCallExpression(node)) {
      const target = getToolcraftTypeScriptImportedCallTarget({
        bindings,
        checker,
        expression: node.expression,
        ts,
      });
      if (target) importedCalls.push(Object.freeze({ call: node, target }));
    }
    ts.forEachChild(node, visit);
  }
  visit(sourceFile);
  return Object.freeze({
    bindings,
    callTargets,
    checker,
    importedCalls: Object.freeze(importedCalls),
    sourceFile,
  });
}

type ToolcraftTypeScriptSourceAnalysis = ReturnType<
  typeof createToolcraftTypeScriptSourceAnalysis
>;

export function getToolcraftImportedBinding(
  analysis: ToolcraftTypeScriptSourceAnalysis,
  expression: ts.Expression | undefined,
): Readonly<{ importedName: string; specifier: string }> | undefined {
  if (!expression) return undefined;
  const normalized = unwrapToolcraftTypeScriptExpression(expression, ts);
  if (!ts.isIdentifier(normalized)) return undefined;
  const symbol =
    normalized.parent && ts.isShorthandPropertyAssignment(normalized.parent)
      ? analysis.checker.getShorthandAssignmentValueSymbol(normalized.parent)
      : analysis.checker.getSymbolAtLocation(normalized);
  return analysis.bindings.importedBindingSymbols.find(
    (candidate: { symbol: ts.Symbol }) => candidate.symbol === symbol,
  )?.binding;
}

export function toolcraftExpressionReferencesImport(
  analysis: ToolcraftTypeScriptSourceAnalysis,
  expression: ts.Expression | undefined,
  expected: Readonly<{ importedName: string; specifier: string }>,
): boolean {
  if (!expression) return false;
  let found = false;
  function visit(node: ts.Node): void {
    if (found) return;
    const binding = ts.isIdentifier(node)
      ? getToolcraftImportedBinding(analysis, node)
      : undefined;
    found =
      binding?.importedName === expected.importedName &&
      binding.specifier === expected.specifier;
    if (!found) ts.forEachChild(node, visit);
  }
  visit(expression);
  return found;
}

export function playwrightConfigForbidsFocusedTests(): boolean {
  const sourceFile = ts.createSourceFile(
    "playwright.config.ts",
    readFileSync(join(projectDir, "playwright.config.ts"), "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  return sourceFile.statements.some((statement) => {
    if (
      !ts.isExportAssignment(statement) ||
      !ts.isCallExpression(statement.expression)
    ) {
      return false;
    }

    const config = statement.expression.arguments[0];
    if (!config || !ts.isObjectLiteralExpression(config)) {
      return false;
    }

    return config.properties.some(
      (property) =>
        ts.isPropertyAssignment(property) &&
        ((ts.isIdentifier(property.name) && property.name.text === "forbidOnly") ||
          (ts.isStringLiteralLike(property.name) && property.name.text === "forbidOnly")) &&
        property.initializer.kind === ts.SyntaxKind.TrueKeyword,
    );
  });
}

export function stripJsComments(source: string): string {
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    false,
    ts.LanguageVariant.JSX,
    source,
  );
  const chunks: string[] = [];
  let token = scanner.scan();
  while (token !== ts.SyntaxKind.EndOfFileToken) {
    if (
      token !== ts.SyntaxKind.SingleLineCommentTrivia &&
      token !== ts.SyntaxKind.MultiLineCommentTrivia
    ) {
      chunks.push(scanner.getTokenText());
    }
    token = scanner.scan();
  }
  return chunks.join("");
}

export function readFiles(rootDir: string, matcher: RegExp): string {
  const inventory = collectToolcraftSourceInventorySync({
    frameworkPathPrefixes: [],
    ignoredFilePatterns: [
      /(?:^|\/)(?:dist|node_modules)(?:\/|$)/u,
      /^toolcraft(?:\/|$)/u,
    ],
    rootDir,
    sourceRoots: ["."],
  });
  if (inventory.filesystemViolations.length > 0) {
    throw new Error(
      inventory.filesystemViolations
        .map((violation) => `${violation.repoPath}: ${violation.reason}`)
        .join("\n"),
    );
  }

  return inventory.entries
    .filter((entry) => entry.role === "production")
    .filter((entry) => {
      const fileName = entry.repoPath.split("/").at(-1) ?? entry.repoPath;
      if (
        /^(?:starter-|app-)(?:acceptance|performance)(?:[.-].*)?\.ts$/u.test(
          fileName,
        )
      ) {
        return false;
      }
      matcher.lastIndex = 0;
      return matcher.test(fileName);
    })
    .map((entry) => readFileSync(entry.absolutePath, "utf8"))
    .join("\n");
}

export function readMarkdownFiles(rootDir: string): string {
  if (!existsSync(rootDir)) {
    return "";
  }

  const chunks: string[] = [];

  function visit(currentDir: string) {
    for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
      const filePath = join(currentDir, entry.name);

      if (entry.isDirectory()) {
        if (!["dist", "node_modules", "toolcraft"].includes(entry.name)) {
          visit(filePath);
        }
        continue;
      }

      if (entry.isFile() && /\.mdx?$/i.test(entry.name)) {
        chunks.push(readFileSync(filePath, "utf8"));
      }
    }
  }

  visit(rootDir);
  return chunks.join("\n");
}

export function readProjectDecisionSources(): string {
  return stripJsComments(
    [
      readMarkdownFiles(join(projectDir, "docs")),
      readMarkdownFiles(join(projectDir, "specs")),
      readMarkdownFiles(join(projectDir, "plans")),
    ].join("\n"),
  );
}

export function sourceUsesCustomRenderer(): boolean {
  const appSources = stripJsComments(readFiles(srcDir, /\.(ts|tsx)$/));

  return (
    compositionHasProductCanvasSurface(appComposition) ||
    /useToolcraft(Value)?\(/.test(appSources) ||
    /getContext\(["']2d["']\)|webgl|webgpu|OffscreenCanvas|ImageData/.test(appSources)
  );
}

export function sourceUsesHardcodedOutputBackgroundColor(
  source = stripJsComments(readFiles(srcDir, /\.(ts|tsx|css)$/)),
): boolean {
  const canvasFillPattern =
    /(?:ctx|context|canvasContext)\.fillStyle\s*=\s*["']#[0-9a-fA-F]{3,8}["'][\s\S]{0,240}\.fillRect\s*\(/;
  const outputCssBackgroundPattern =
    /\.(?:[a-z0-9_-]*(?:canvas|renderer|preview|output|product)[a-z0-9_-]*)\s*{[^}]*background(?:-color)?\s*:\s*#[0-9a-fA-F]{3,8}/i;

  return canvasFillPattern.test(source) || outputCssBackgroundPattern.test(source);
}

export function schemaHasOutputBackgroundColorControl(): boolean {
  return (appSchema.panels.controls?.sections ?? []).some((section) =>
    Object.values(section.controls).some((control) => {
      if (control.type !== "color") {
        return false;
      }

      const searchText = [
        section.title,
        typeof control.label === "string" ? control.label : "",
        control.target,
      ].join(" ");

      return /\b(background|backdrop|scene|canvas)\b/i.test(searchText);
    }),
  );
}

export function projectDocsIncludeFixedBackgroundDecision(): boolean {
  return /fixedBackgroundReason|fixed background|non-editable background|not user-editable background|reference-defined background|product-defined background/i.test(
    readProjectDecisionSources(),
  );
}
