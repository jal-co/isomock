import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

import { defineToolcraft, mediaSourceModule } from "@/toolcraft/runtime";
import { validateContractAcceptance } from "../../app-acceptance.contract-fixtures";
import { createFileDropAcceptance } from "../../app-acceptance.media-upload.fixtures";
import type { ToolcraftProductReadiness } from "../types";
import {
  createPersistentMediaSchema,
  createRuntimeAcceptance,
} from "./test-proof-fixtures";

type CanonicalCall = Readonly<{
  declarationName: string;
  declarationPath: string;
  expectedCallerPath: string;
}>;

const productReadiness: ToolcraftProductReadiness = {
  exportIntent: {
    image: {
      evidence: {
        source: "user-message",
        messageRef: "test://pipeline-request",
        messageText: "Remove image export from this pipeline fixture.",
        quote: "Remove image export",
      },
      mode: "user-removed",
    },
    svg: { mode: "not-requested" },
    video: { mode: "not-requested" },
  },
  interactionOwnership: [],
  mode: "product",
  productName: "Capability pipeline fixture",
  productSummary: "A fixture for the atomic capability proof pipeline.",
  requestedBehavior: "Validate the exact resolved capability plan once.",
  viewInteraction: {
    mode: "non-spatial",
    reason: "The pipeline fixture has no spatial view.",
  },
};

function createStarterProgram(): ts.Program {
  const configPath = fileURLToPath(
    new URL("../../../../tsconfig.json", import.meta.url),
  );
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
    undefined,
    configPath,
  );
  if (parsed.errors.length > 0) {
    throw new Error(
      parsed.errors
        .map(({ messageText }) =>
          ts.flattenDiagnosticMessageText(messageText, "\n"),
        )
        .join("\n"),
    );
  }
  return ts.createProgram({
    options: parsed.options,
    rootNames: parsed.fileNames,
  });
}

function getSourceFile(
  program: ts.Program,
  relativePath: string,
): ts.SourceFile {
  const absolutePath = fileURLToPath(new URL(relativePath, import.meta.url));
  const sourceFile = program.getSourceFile(absolutePath);
  if (!sourceFile) {
    throw new Error(`Missing source file ${relativePath}.`);
  }
  return sourceFile;
}

function getFunctionSymbol(
  program: ts.Program,
  relativePath: string,
  functionName: string,
): ts.Symbol {
  const sourceFile = getSourceFile(program, relativePath);
  const declaration = sourceFile.statements.find(
    (statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === functionName,
  );
  const symbol = declaration?.name
    ? program.getTypeChecker().getSymbolAtLocation(declaration.name)
    : undefined;
  if (!symbol) {
    throw new Error(`Missing canonical function ${functionName}.`);
  }
  return symbol;
}

function resolveSymbol(
  checker: ts.TypeChecker,
  identifier: ts.Identifier,
): ts.Symbol | undefined {
  const symbol = checker.getSymbolAtLocation(identifier);
  return symbol && (symbol.flags & ts.SymbolFlags.Alias) !== 0
    ? checker.getAliasedSymbol(symbol)
    : symbol;
}

function getProductionAcceptanceSources(program: ts.Program): ts.SourceFile[] {
  return program.getSourceFiles().filter(({ fileName }) => {
    const normalized = fileName.replaceAll("\\", "/");
    return (
      normalized.includes("/src/app/acceptance/") &&
      !normalized.includes(".test.") &&
      !normalized.includes("/test-") &&
      !normalized.includes("test-utils")
    );
  });
}

function getDirectCanonicalCalls(
  program: ts.Program,
  canonicalSymbol: ts.Symbol,
): ts.CallExpression[] {
  const checker = program.getTypeChecker();
  const calls: ts.CallExpression[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isIdentifier(node) &&
      resolveSymbol(checker, node) === canonicalSymbol &&
      ts.isCallExpression(node.parent) &&
      node.parent.expression === node
    ) {
      calls.push(node.parent);
    }
    ts.forEachChild(node, visit);
  };
  for (const sourceFile of getProductionAcceptanceSources(program)) {
    visit(sourceFile);
  }
  return calls;
}

function expectOneCanonicalCall(
  program: ts.Program,
  call: CanonicalCall,
): void {
  const symbol = getFunctionSymbol(
    program,
    call.declarationPath,
    call.declarationName,
  );
  const calls = getDirectCanonicalCalls(program, symbol);
  expect(calls, call.declarationName).toHaveLength(1);
  expect(
    calls[0]
      .getSourceFile()
      .fileName.replaceAll("\\", "/")
      .endsWith(call.expectedCallerPath),
  ).toBe(true);
}

describe("Toolcraft acceptance capability pipeline integration", () => {
  it("has one product dispatcher and one canonical call site per grouped owner", () => {
    const program = createStarterProgram();
    const calls: readonly CanonicalCall[] = [
      {
        declarationName: "validateToolcraftCapabilityProofs",
        declarationPath: "./validate-capability-proofs.ts",
        expectedCallerPath: "/src/app/acceptance/validate-coverage.ts",
      },
      {
        declarationName: "dispatchToolcraftCapabilityProofOwners",
        declarationPath: "./owner-dispatch.ts",
        expectedCallerPath:
          "/src/app/acceptance/capability-proofs/validate-capability-proofs.ts",
      },
      ...[
        [
          "getToolcraftExportArtifactProofErrors",
          "../export-artifact-coverage.ts",
        ],
        [
          "getToolcraftCanvasEditingProofErrors",
          "../canvas-handle-acceptance.ts",
        ],
        ["getToolcraftLayerCoverageErrors", "../runtime-coverage.ts"],
        ["getToolcraftMasksProofErrors", "./masks.ts"],
        ["getToolcraftMediaSourceProofErrors", "../media-upload.ts"],
        ["getToolcraftModel3dProofErrors", "../model-import-coverage.ts"],
        [
          "getToolcraftOrientationGizmoCoverageErrors",
          "../control-acceptance-coverage.ts",
        ],
        [
          "getToolcraftTimelinePlaybackCoverageErrors",
          "../runtime-coverage.ts",
        ],
        [
          "getToolcraftTimelineKeyframeCoverageErrors",
          "../runtime-coverage.ts",
        ],
      ].map(([declarationName, declarationPath]) => ({
        declarationName,
        declarationPath,
        expectedCallerPath:
          "/src/app/acceptance/capability-proofs/validate-capability-proofs.ts",
      })),
      {
        declarationName: "getToolcraftPersistenceCoverageResult",
        declarationPath: "../runtime-coverage.ts",
        expectedCallerPath: "/src/app/acceptance/validate-coverage.ts",
      },
    ];

    for (const call of calls) {
      expectOneCanonicalCall(program, call);
    }
  }, 20_000);

  it("shares one failed persistence fact with Media Source without duplicates", () => {
    const schema = createPersistentMediaSchema();
    if (schema.persistence.storage !== "localStorage") {
      throw new Error("Expected local persistence.");
    }
    const persistenceAcceptance = createRuntimeAcceptance(
      "persistence.reload",
      {
        componentType: "persistence",
        evidence: "persistence-state",
        persistenceCoverage: "reload",
        persistenceSlices: schema.persistence.include.filter(
          (slice) => slice !== "media",
        ),
      },
    );
    const acceptance = [
      createFileDropAcceptance({
        automatedTestName: "media lifecycle",
        browserProofTestName: "browser: media lifecycle",
        expectedObservable: "Media lifecycle updates the source output.",
        fixture: "image source",
        mediaLifecycleCoverage: [
          "upload",
          "remove",
          "reset",
          "rotate",
          "flip",
          "transform-output",
        ],
        userAction: "Upload, transform, remove, and reset the source.",
      }),
      persistenceAcceptance,
    ];

    const diagnostics = validateContractAcceptance({
      acceptance,
      productReadiness,
      schema,
    });

    expect(
      diagnostics.filter((diagnostic) => diagnostic.includes("missing media")),
    ).toHaveLength(1);
    expect(diagnostics.join("\n")).not.toContain(
      "media.source requires the prevalidated persistence reload fact",
    );
  });

  it("deliberately skips capability recipes for the neutral starter", () => {
    const neutralSchema = defineToolcraft({
      base: {
        canvas: {
          enabled: true,
          sizing: { mode: "editable-output" },
          upload: true,
        },
        identity: {
          id: "neutral-capability-pipeline",
          title: "Neutral capability pipeline",
        },
        panels: { controls: { sections: [], title: "Controls" } },
      },
      modules: [mediaSourceModule()],
    });
    if (neutralSchema.persistence.storage !== "localStorage") {
      throw new Error("Expected local persistence.");
    }
    const neutralAcceptance = [
      createRuntimeAcceptance("persistence.reload", {
        componentType: "persistence",
        evidence: "persistence-state",
        persistenceCoverage: "reload",
        persistenceSlices: neutralSchema.persistence.include,
      }),
    ];
    const neutralDiagnostics = validateContractAcceptance({
      acceptance: neutralAcceptance,
      schema: neutralSchema,
    });
    const productDiagnostics = validateContractAcceptance({
      acceptance: neutralAcceptance,
      productReadiness,
      schema: neutralSchema,
    });

    expect(neutralDiagnostics).toEqual([]);
    expect(neutralDiagnostics.join("\n")).not.toContain("media.source");
    expect(productDiagnostics).toContain(
      "media.source requires a fileDrop acceptance row proving its media lifecycle.",
    );
  });
});
