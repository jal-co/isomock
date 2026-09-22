import path from "node:path";

import { createToolcraftTypeScriptProgram } from
  "./toolcraft-typescript-analysis.mjs";
import {
  getToolcraftTypeScriptCompiler,
  parseToolcraftTypeScriptSource,
} from
  "./toolcraft-typescript-source-evidence.mjs";

function absoluteSourcePath(rootDir, sourcePath) {
  return path.resolve(rootDir, sourcePath);
}

function compilerPaths(aliases) {
  const paths = {};
  for (const alias of aliases) {
    if (alias.importerPrefix || typeof alias.match !== "string" ||
      typeof alias.replacement !== "string") continue;
    paths[alias.match] ??= [];
    if (!paths[alias.match].includes(alias.replacement)) {
      paths[alias.match].push(alias.replacement);
    }
  }
  return paths;
}

export function createToolcraftTypeScriptBoundaryProgram({
  aliases = [],
  rootDir,
  sources,
}) {
  const ts = getToolcraftTypeScriptCompiler();
  if (!ts) {
    throw new Error(
      "TypeScript is required to evaluate the Toolcraft source boundary.",
    );
  }
  const virtualSources = new Map(
    [...sources].map(([sourcePath, rawSource]) => [
      absoluteSourcePath(rootDir, sourcePath),
      rawSource,
    ]),
  );
  const virtualDirectories = new Set();
  for (const sourcePath of virtualSources.keys()) {
    let directory = path.dirname(sourcePath);
    while (!virtualDirectories.has(directory)) {
      virtualDirectories.add(directory);
      const parent = path.dirname(directory);
      if (parent === directory) break;
      directory = parent;
    }
  }
  const compilerOptions = {
    allowJs: true,
    allowSyntheticDefaultImports: true,
    baseUrl: rootDir,
    checkJs: true,
    esModuleInterop: true,
    jsx: ts.JsxEmit.ReactJSX,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    noEmit: true,
    paths: compilerPaths(aliases),
    skipLibCheck: true,
    target: ts.ScriptTarget.ES2022,
  };
  const defaultHost = ts.createCompilerHost(compilerOptions, true);
  const sourceFileCache = new Map();
  const host = {
    ...defaultHost,
    directoryExists(directoryName) {
      return virtualDirectories.has(path.resolve(directoryName)) ||
        defaultHost.directoryExists?.(directoryName) === true;
    },
    fileExists(fileName) {
      return virtualSources.has(path.resolve(fileName)) ||
        defaultHost.fileExists(fileName);
    },
    getSourceFile(fileName, languageVersion, onError, createNew) {
      const absolutePath = path.resolve(fileName);
      const rawSource = virtualSources.get(absolutePath);
      if (rawSource === undefined) {
        return defaultHost.getSourceFile(
          fileName,
          languageVersion,
          onError,
          createNew,
        );
      }
      if (!createNew && sourceFileCache.has(absolutePath)) {
        return sourceFileCache.get(absolutePath);
      }
      const sourceFile = parseToolcraftTypeScriptSource({
        absolutePath,
        rawSource,
      }).sourceFile;
      sourceFileCache.set(absolutePath, sourceFile);
      return sourceFile;
    },
    readFile(fileName) {
      return virtualSources.get(path.resolve(fileName)) ??
        defaultHost.readFile(fileName);
    },
    realpath(fileName) {
      const absolutePath = path.resolve(fileName);
      return virtualSources.has(absolutePath)
        ? absolutePath
        : (defaultHost.realpath?.(fileName) ?? absolutePath);
    },
    writeFile() {},
  };
  const program = createToolcraftTypeScriptProgram({
    host,
    options: compilerOptions,
    rootNames: [...virtualSources.keys()],
    ts,
  });
  const sourceFiles = new Map(
    [...sources.keys()].map((sourcePath) => [
      sourcePath,
      program.getSourceFile(absoluteSourcePath(rootDir, sourcePath)),
    ]),
  );
  const sourcePathByAbsolutePath = new Map(
    [...sources.keys()].map((sourcePath) => [
      absoluteSourcePath(rootDir, sourcePath),
      sourcePath,
    ]),
  );
  return Object.freeze({
    checker: program.getTypeChecker(),
    program,
    resolveModuleSourcePath({ sourceFile, specifier }) {
      const resolved = ts.resolveModuleName(
        specifier,
        sourceFile.fileName,
        compilerOptions,
        host,
      ).resolvedModule?.resolvedFileName;
      return resolved && sourcePathByAbsolutePath.get(path.resolve(resolved));
    },
    sourcePathOf(sourceFile) {
      const relativePath = path.relative(rootDir, sourceFile.fileName)
        .replaceAll(path.sep, "/");
      return relativePath.startsWith("../") ? undefined : relativePath;
    },
    sourceFiles,
    ts,
  });
}
