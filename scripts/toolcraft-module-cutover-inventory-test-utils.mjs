import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createToolcraftConstructorBindingContext } from "./toolcraft-product-constructor-boundary.mjs";
import {
  loadToolcraftLocalModuleAliases,
  resolveToolcraftLocalDependency,
  toolcraftModuleExtensions,
} from "./toolcraft-product-dependency-resolution.mjs";
import { collectToolcraftSourceInventorySync } from "./toolcraft-source-inventory.mjs";
import { parseToolcraftTypeScriptSource } from "./toolcraft-typescript-source-evidence.mjs";

const compilerSourcePattern = /\.[cm]?tsx?$/u;
const compatibilityFixturePatterns = [
  /(?:^|\/)app\/acceptance\/capability-proofs\/legacy-wrapper-delegation\.test\.ts$/u,
];
const testFilePatterns = [/(?:^|\/)[^/]+\.(?:test|spec)\.[cm]?[jt]sx?$/u];
const testSupportPatterns = [
  /(?:^|\/)e2e\//u,
  /(?:^|\/)test-evidence\//u,
  /(?:^|\/)generate-test-dependency-sandbox\.mjs$/u,
  /(?:^|\/)generate-test-integrity-ownership-assertions\.mjs$/u,
  /(?:^|\/)generate-test-renderer-provider-doc-assertions\.mjs$/u,
  /(?:^|\/)packaged-template-fallback-helpers\.mjs$/u,
  /(?:^|\/)[^/]*(?:fixtures|test-support|test-utils)\.[cm]?[jt]sx?$/u,
];

function compareCodeUnits(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function toPosixPath(value) {
  return value.split(path.sep).join("/");
}

function workspaceSourceLayout() {
  const starterRoot = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
  );
  const workspaceRoot = path.resolve(starterRoot, "..");
  const workspaceRuntimeRoot = path.join(
    workspaceRoot,
    "packages/toolcraft-runtime/src",
  );
  if (
    starterRoot === path.join(workspaceRoot, "starter") &&
    fs.existsSync(workspaceRuntimeRoot)
  ) {
    return {
      kind: "workspace",
      packageDirectories: ["packages/toolcraft-runtime", "packages/ui"],
      projectRoot: workspaceRoot,
      runtimeSourceRoot: workspaceRuntimeRoot,
      scopePrefixes: [
        ["runtime", "packages/toolcraft-runtime/src/"],
        ["starter", "starter/"],
        ["cli", "cli/"],
        ["website", "apps/website/"],
      ],
      sourceRoots: [
        "packages/toolcraft-runtime/src",
        "starter/src",
        "starter/e2e",
        "cli/bin",
        "cli/scripts",
        "cli/src",
        "cli/fixtures",
        "apps/website/src",
      ],
      tsconfigPaths: [
        {
          importerPrefix: "packages/toolcraft-runtime/",
          path: "packages/toolcraft-runtime/tsconfig.json",
        },
        { importerPrefix: "starter/", path: "starter/tsconfig.json" },
        { importerPrefix: "apps/website/", path: "apps/website/tsconfig.json" },
      ],
    };
  }
  return {
    kind: "standalone",
    packageDirectories: [],
    projectRoot: starterRoot,
    runtimeSourceRoot: path.join(starterRoot, "src/toolcraft/runtime"),
    scopePrefixes: [
      ["runtime", "src/toolcraft/runtime/"],
      ["starter", "src/"],
      ["starter", "e2e/"],
    ],
    sourceRoots: ["src", "e2e"],
    tsconfigPaths: ["tsconfig.json"],
  };
}

function getScope(repoPath, scopePrefixes) {
  return (
    scopePrefixes.find(([, prefix]) => repoPath.startsWith(prefix))?.[0] ??
    "product"
  );
}

function isCompatibilityFixture(repoPath) {
  return compatibilityFixturePatterns.some((pattern) => pattern.test(repoPath));
}

function readLocalPackages(projectRoot, packageDirectories) {
  return packageDirectories.flatMap((relativeDirectory) => {
    const packageDirectory = path.resolve(projectRoot, relativeDirectory);
    try {
      const manifest = JSON.parse(
        fs.readFileSync(path.join(packageDirectory, "package.json"), "utf8"),
      );
      if (typeof manifest.name !== "string") return [];
      const exportKeys =
        manifest.exports && typeof manifest.exports === "object"
          ? Object.keys(manifest.exports)
          : manifest.exports
            ? ["."]
            : [];
      return [
        {
          directory: packageDirectory,
          exportedSpecifiers: new Set(
            exportKeys.map((key) =>
              key === "."
                ? manifest.name
                : `${manifest.name}/${key.replace(/^\.\//u, "")}`,
            ),
          ),
          moduleInternalRoot: path.join(packageDirectory, "src/modules"),
          name: manifest.name,
        },
      ];
    } catch {
      return [];
    }
  });
}

async function createInventory(layout) {
  const sourceInventory = collectToolcraftSourceInventorySync({
    frameworkPathPrefixes: [],
    rootDir: layout.projectRoot,
    sourceRoots: layout.sourceRoots,
    testFilePatterns,
    testSupportPatterns,
  });
  const allEntries = sourceInventory.entries.map((entry) => ({
    ...entry,
    scope: getScope(entry.repoPath, layout.scopePrefixes),
  }));
  const compatibilityFixtureEntries = allEntries.filter(({ repoPath }) =>
    isCompatibilityFixture(repoPath),
  );
  const entries = allEntries.filter(
    ({ repoPath, role }) =>
      toolcraftModuleExtensions.includes(path.extname(repoPath)) &&
      (role === "production" || isCompatibilityFixture(repoPath)),
  );
  const compilerEntries = entries.filter(({ repoPath }) =>
    compilerSourcePattern.test(repoPath),
  );
  const context = createToolcraftConstructorBindingContext({
    projectRoot: layout.projectRoot,
    rootNames: compilerEntries.map(({ absolutePath }) => absolutePath),
    runtimeSourceRoot: layout.runtimeSourceRoot,
  });
  const aliases = await loadToolcraftLocalModuleAliases({
    packageDirectories: layout.packageDirectories,
    rootDir: layout.projectRoot,
    tsconfigPaths: layout.tsconfigPaths,
  });
  const localPackages = readLocalPackages(
    layout.projectRoot,
    layout.packageDirectories,
  );
  return {
    ...layout,
    aliases,
    allEntries,
    compatibilityFixtureEntries,
    compilerEntries,
    context,
    entries,
    entryByAbsolutePath: new Map(
      allEntries.map((entry) => [path.resolve(entry.absolutePath), entry]),
    ),
    localPackages,
  };
}

export async function createToolcraftCutoverCompilerInventory(
  layout = workspaceSourceLayout(),
) {
  return createInventory(layout);
}

export async function createToolcraftCutoverFixtureInventory(context, files) {
  const rootDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "toolcraft-cutover-absence-"),
  );
  context.after(() => fs.rmSync(rootDir, { force: true, recursive: true }));
  for (const [repoPath, source] of Object.entries(files)) {
    const absolutePath = path.join(rootDir, repoPath);
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, source);
  }
  const sourcePaths = Object.keys(files).filter((repoPath) =>
    toolcraftModuleExtensions.includes(path.extname(repoPath)),
  );
  const topLevelRoots = [
    ...new Set(
      sourcePaths.map((repoPath) =>
        repoPath.includes("/") ? repoPath.slice(0, repoPath.indexOf("/")) : ".",
      ),
    ),
  ];
  const tsconfigPaths = Object.keys(files).filter((repoPath) =>
    /(?:^|\/)tsconfig(?:\.[^/]*)?\.json$/u.test(repoPath),
  );
  const packageDirectories = Object.keys(files)
    .filter((repoPath) => path.posix.basename(repoPath) === "package.json")
    .map((repoPath) => path.posix.dirname(repoPath));
  const baseLayout = workspaceSourceLayout();
  return createInventory({
    kind: "fixture",
    packageDirectories,
    projectRoot: rootDir,
    runtimeSourceRoot: baseLayout.runtimeSourceRoot,
    scopePrefixes: [
      ["website", "apps/website/"],
      ["cli", "cli/"],
      ["runtime", "src/toolcraft/runtime/"],
      ["product", "src/"],
    ],
    sourceRoots: topLevelRoots,
    tsconfigPaths,
  });
}

export function getToolcraftInventorySourceFile(inventory, entry) {
  const compilerSource = inventory.context.program.getSourceFile(
    entry.absolutePath,
  );
  if (compilerSource) return compilerSource;
  const parsed = parseToolcraftTypeScriptSource({
    absolutePath: entry.absolutePath,
    rawSource: fs.readFileSync(entry.absolutePath, "utf8"),
  });
  if (!parsed)
    throw new Error(
      "TypeScript compiler is required for cutover inventory tests.",
    );
  return parsed.sourceFile;
}

export function resolveToolcraftInventoryReference(
  inventory,
  entry,
  specifier,
) {
  if (!specifier) return { resolution: "non-static" };
  const resolvedPath = resolveToolcraftLocalDependency({
    aliases: inventory.aliases,
    allowUnscanned: true,
    entryByAbsolutePath: inventory.entryByAbsolutePath,
    importer: entry,
    rootDir: inventory.projectRoot,
    specifier,
  });
  const localPackage = inventory.localPackages.find(
    ({ name }) => specifier === name || specifier.startsWith(`${name}/`),
  );
  const resolvedEntry = resolvedPath
    ? inventory.entryByAbsolutePath.get(path.resolve(resolvedPath))
    : undefined;
  return {
    localPackage,
    resolution: resolvedEntry
      ? "resolved"
      : resolvedPath
        ? "outside-inventory"
        : localPackage
          ? "unexported-local-package"
          : "external",
    resolvedEntry,
    resolvedPath,
    specifier,
  };
}

export function isToolcraftInventoryModuleInternal(inventory, reference) {
  if (!reference.resolvedPath) {
    return Boolean(
      reference.localPackage &&
      !reference.localPackage.exportedSpecifiers.has(reference.specifier),
    );
  }
  const resolvedPath = path.resolve(reference.resolvedPath);
  if (
    resolvedPath ===
    path.resolve(inventory.runtimeSourceRoot, "modules/public.ts")
  ) {
    return false;
  }
  return (
    resolvedPath.startsWith(
      `${path.resolve(inventory.runtimeSourceRoot, "modules")}${path.sep}`,
    ) ||
    inventory.localPackages.some(({ moduleInternalRoot }) =>
      resolvedPath.startsWith(`${path.resolve(moduleInternalRoot)}${path.sep}`),
    )
  );
}

export { compareCodeUnits, toPosixPath };
