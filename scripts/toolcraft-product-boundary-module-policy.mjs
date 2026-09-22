import path from "node:path";

import { getToolcraftProductExportModuleKind } from "./toolcraft-product-export-boundary.mjs";
import { isToolcraftPrivateControlImplementationModule } from "./toolcraft-product-control-boundary.mjs";

const workspaceUiModule = ["@", "repo/ui"].join("");

function toPosixPath(value) {
  return value.split(path.sep).join("/");
}

function resolveSpecifierPath(sourceFilePath, moduleSpecifier, rootDir) {
  if (moduleSpecifier.startsWith("@/") || moduleSpecifier.startsWith("#/")) {
    return toPosixPath(path.resolve(rootDir, "src", moduleSpecifier.slice(2)));
  }
  if (moduleSpecifier.startsWith("/")) {
    return toPosixPath(path.resolve(rootDir, moduleSpecifier.slice(1)));
  }
  if (moduleSpecifier.startsWith(".")) {
    return toPosixPath(
      path.resolve(path.dirname(sourceFilePath), moduleSpecifier),
    );
  }
  return null;
}

export function getToolcraftSensitiveModuleKind({
  moduleSpecifier,
  resolvedRepoPath,
  rootDir,
  sourceFilePath,
}) {
  const normalizedSpecifier = moduleSpecifier.replaceAll("\\", "/");
  const resolvedSpecifier = resolvedRepoPath
    ? resolvedRepoPath.replaceAll("\\", "/")
    : resolveSpecifierPath(sourceFilePath, normalizedSpecifier, rootDir);
  const exportModuleKind = getToolcraftProductExportModuleKind(
    normalizedSpecifier,
    resolvedSpecifier,
  );
  if (exportModuleKind) return exportModuleKind;

  if (
    /^@repo\/toolcraft-runtime\/(?:modules|schema\/resolve-toolcraft-product-definition)(?:\/|$)/u.test(
      normalizedSpecifier,
    ) ||
    /^[#@]\/toolcraft\/runtime\/(?:modules|schema\/resolve-toolcraft-product-definition)(?:\/|$)/u.test(
      normalizedSpecifier,
    ) ||
    resolvedSpecifier?.includes("/src/toolcraft/runtime/modules/") ||
    resolvedSpecifier?.includes(
      "/src/toolcraft/runtime/schema/resolve-toolcraft-product-definition",
    )
  ) {
    return "runtime-product-module-internal";
  }

  if (
    isToolcraftPrivateControlImplementationModule({
      moduleSpecifier: normalizedSpecifier,
      resolvedSpecifier,
    })
  ) {
    return "ui-control-implementation";
  }

  if (
    /^@repo\/ui\//u.test(normalizedSpecifier) ||
    /^[#@]\/toolcraft\/ui\//u.test(normalizedSpecifier) ||
    resolvedSpecifier?.includes("/packages/ui/src/")
  ) {
    return "ui-private-implementation";
  }

  if (
    normalizedSpecifier === "@base-ui/react" ||
    normalizedSpecifier.startsWith("@base-ui/react/")
  ) return "ui-base-implementation";

  if (
    /^@repo\/toolcraft-runtime\/react\/model-rendering(?:\/|$)/u.test(
      normalizedSpecifier,
    ) ||
    /^[#@]\/toolcraft\/runtime\/react\/model-rendering(?:\/|$)/u.test(
      normalizedSpecifier,
    ) ||
    resolvedSpecifier?.includes("/src/toolcraft/runtime/react/model-rendering")
  ) {
    return "runtime-model-presentation";
  }

  if (
    /^three\/(?:addons|examples\/jsm)\/loaders(?:\/|$)/u.test(
      normalizedSpecifier,
    ) ||
    /^@gltf-transform(?:\/|$)/u.test(normalizedSpecifier) ||
    /^@repo\/toolcraft-runtime\/model-import(?:\/|$)/u.test(
      normalizedSpecifier,
    ) ||
    /^[#@]\/toolcraft\/runtime\/model-import(?:\/|$)/u.test(
      normalizedSpecifier,
    ) ||
    resolvedSpecifier?.includes("/src/toolcraft/runtime/model-import")
  ) {
    return "runtime-model-import";
  }

  if (
    /^@repo\/toolcraft-runtime\/react(?:\/|$)/u.test(normalizedSpecifier) ||
    /^[#@]\/toolcraft\/runtime\/react(?:\/|$)/u.test(normalizedSpecifier) ||
    resolvedSpecifier?.includes("/src/toolcraft/runtime/react")
  ) {
    return "runtime-react";
  }

  if (
    /^@repo\/ui(?:\/controls(?:\/|$)|$)/u.test(normalizedSpecifier) ||
    /^[#@]\/toolcraft\/ui(?:\/components\/controls(?:\/|$)|\/controls(?:\/|$)|$)/u.test(
      normalizedSpecifier,
    ) ||
    resolvedSpecifier?.includes("/src/toolcraft/ui/components/controls") ||
    /\/src\/toolcraft\/ui$/u.test(resolvedSpecifier ?? "")
  ) {
    return "ui-controls";
  }

  return null;
}

export function getToolcraftResolvedUiModuleKind({
  moduleSpecifier,
  resolvedRepoPath,
}) {
  const normalizedSpecifier = moduleSpecifier.replaceAll("\\", "/");
  const normalizedTarget = resolvedRepoPath
    ? resolvedRepoPath.replaceAll("\\", "/")
    : "";
  if (normalizedSpecifier === workspaceUiModule) {
    return "ui-private-implementation";
  }
  if (!/^src\/toolcraft\/ui(?:\/|$)/u.test(normalizedTarget)) return null;
  const publicTarget = /^src\/toolcraft\/ui\/index\.[cm]?[jt]sx?$/u.test(
    normalizedTarget,
  );
  return publicTarget ? null : "ui-private-implementation";
}
