export type ToolcraftImportedRuntimeBinding = Readonly<{
  importedName: string;
  localName: string;
  specifier: string;
}>;

export type ToolcraftImportedCallTarget = Readonly<{
  callerCallableId: string | null;
  callerExportNames: readonly string[];
  importedName: string;
  localName: string;
  memberPath: string;
  operation: string;
  specifier: string;
}>;

export type ToolcraftLocalCallTarget = Readonly<{
  calleeCallableId: string;
  callerCallableId: string;
}>;

export type ToolcraftTypeScriptSemanticFacts = Readonly<{
  exportedCallableBindings: readonly Readonly<{
    callableId: string;
    exportedName: string;
  }>[];
  exportedRuntimeBindings: readonly string[];
  identifiers: readonly string[];
  importedCallTargets: readonly ToolcraftImportedCallTarget[];
  importedRuntimeBindings: readonly ToolcraftImportedRuntimeBinding[];
  localCallTargets: readonly ToolcraftLocalCallTarget[];
  moduleShape:
    | "behavior"
    | "empty"
    | "forwarding-facade"
    | "identity-facade"
    | "reexport-only";
  staticStrings: readonly string[];
}>;

export type ToolcraftTypeScriptImportFact = Readonly<{
  category: string;
  column: number;
  line: number;
  specifier: string | null;
  typeOnly: boolean;
}>;

export type ToolcraftTypeScriptSourceRecord = Readonly<{
  boundaryEvidence: Readonly<{
    moduleLoadingViolations: readonly Readonly<Record<string, unknown>>[];
    playwrightAuthorityViolations:
      readonly Readonly<Record<string, unknown>>[];
    productSourceViolations: readonly Readonly<Record<string, unknown>>[];
    reservedEvidenceViolations:
      readonly Readonly<Record<string, unknown>>[];
  }>;
  imports: readonly ToolcraftTypeScriptImportFact[];
  rawSource: string;
  semanticFacts: ToolcraftTypeScriptSemanticFacts;
}>;

export function getToolcraftTypeScriptCompiler():
  | typeof import("typescript")
  | undefined;

export function isToolcraftTypeScriptCompilerAvailable(): boolean;

export function isToolcraftPackageRootOrSubpath(
  specifier: string | null | undefined,
  packageName: string,
): boolean;

export function collectToolcraftTypeScriptImportFacts(options: Readonly<{
  absolutePath: string;
  rawSource: string;
}>): readonly ToolcraftTypeScriptImportFact[];

export function createToolcraftTypeScriptSourceRecord(
  options: Readonly<{
    absolutePath: string;
    rawSource: string;
    repoPath: string;
    rootDir: string;
  }>,
): Promise<ToolcraftTypeScriptSourceRecord>;
