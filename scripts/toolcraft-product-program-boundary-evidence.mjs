import path from "node:path";

import { inspectToolcraftProductSource } from
  "./toolcraft-product-boundary-ast.mjs";
import { createToolcraftStaticStringResolver } from
  "./toolcraft-static-string.mjs";
import { createToolcraftTypeScriptBoundaryProgram } from
  "./toolcraft-typescript-boundary-program.mjs";
import { createToolcraftCssModuleFactResolver } from
  "./toolcraft-css-module-fact-graph.mjs";

function getNodeLocation(sourceFile, node) {
  const location = sourceFile.getLineAndCharacterOfPosition(
    node.getStart(sourceFile),
  );
  return { column: location.character + 1, line: location.line + 1 };
}

export function collectToolcraftProductProgramBoundaryEvidence({
  aliases,
  entries,
  inspectedEntries,
  moduleImports,
  rootDir,
  sourceRecords,
}) {
  const sources = new Map(entries.flatMap((entry) => {
    const rawSource = sourceRecords.get(entry.repoPath)?.rawSource;
    return typeof rawSource === "string" &&
      /\.[cm]?[jt]sx?$/u.test(entry.repoPath)
      ? [[entry.repoPath, rawSource]]
      : [];
  }));
  const program = createToolcraftTypeScriptBoundaryProgram({
    aliases,
    rootDir,
    sources,
  });
  const resolveCssModuleClass = createToolcraftCssModuleFactResolver({
    moduleImports,
    sourceRecords,
  });
  return new Map(inspectedEntries.map((entry) => {
    const sourceFile = program.sourceFiles.get(entry.repoPath);
    if (!sourceFile) {
      throw new Error(
        `Product source is missing from the shared Program: ${entry.repoPath}`,
      );
    }
    return [entry.repoPath, inspectToolcraftProductSource({
      absolutePath: path.resolve(rootDir, entry.repoPath),
      checker: program.checker,
      getNodeLocation,
      repoPath: entry.repoPath,
      resolveCssModuleClass,
      resolveStaticString: createToolcraftStaticStringResolver(
        sourceFile,
        program.checker,
      ),
      rootDir,
      sourceFile,
    })];
  }));
}
