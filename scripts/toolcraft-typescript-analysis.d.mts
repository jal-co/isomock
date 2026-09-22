import type ts from "typescript";

export type ToolcraftTypeScriptImportedBinding = Readonly<{
  importedName: string;
  localName: string;
  specifier: string;
}>;

export type ToolcraftTypeScriptImportedCallTarget = Readonly<{
  callerCallableId: string | null;
  callerExportNames: readonly string[];
  importedName: string;
  localName: string;
  memberPath: string;
  operation: string;
  specifier: string;
}>;

export type ToolcraftTypeScriptModuleBindings = Readonly<{
  callables: unknown;
  exportedCallableBindings: readonly Readonly<{
    callableId: string;
    exportedName: string;
  }>[];
  exportedRuntimeBindings: readonly string[];
  importedBindingSymbols: readonly Readonly<{
    binding: ToolcraftTypeScriptImportedBinding;
    symbol: ts.Symbol;
  }>[];
  importedRuntimeBindings: readonly ToolcraftTypeScriptImportedBinding[];
}>;

export function createToolcraftTypeScriptChecker(
  sourceFile: ts.SourceFile,
  typescript: typeof ts,
): ts.TypeChecker;

export function collectToolcraftTypeScriptModuleBindings(
  sourceFile: ts.SourceFile,
  typescript: typeof ts,
  checker?: ts.TypeChecker,
  callables?: unknown,
): ToolcraftTypeScriptModuleBindings;

export function collectToolcraftTypeScriptCallTargets(input: Readonly<{
  bindings: ToolcraftTypeScriptModuleBindings;
  checker: ts.TypeChecker;
  sourceFile: ts.SourceFile;
  ts: typeof ts;
}>): Readonly<{
  importedCallTargets: readonly ToolcraftTypeScriptImportedCallTarget[];
  localCallTargets: readonly Readonly<{
    calleeCallableId: string;
    callerCallableId: string;
  }>[];
}>;

export function getToolcraftTypeScriptImportedCallTarget(input: Readonly<{
  bindings: ToolcraftTypeScriptModuleBindings;
  checker: ts.TypeChecker;
  expression: ts.Expression;
  ts: typeof ts;
}>):
  | Omit<
      ToolcraftTypeScriptImportedCallTarget,
      "callerCallableId" | "callerExportNames"
    >
  | undefined;

export function unwrapToolcraftTypeScriptExpression(
  node: ts.Expression,
  typescript: typeof ts,
): ts.Expression;
