import { resolveRendererProviderDefinition, rendererProviderDependencyNames } from "../src/toolcraft/renderer-providers/provider-resolution.mjs";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { parseRendererProviderCatalog } from "../src/toolcraft/renderer-providers/provider-config.mjs";

const execFileAsync = promisify(execFile);
const supportedProviderId = "vgpu";

function assertRecord(value, field) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${field} must be an object.`);
  }
}

async function executeTypecheck({ appRoot, projectPath }) {
  const requireFromApp = createRequire(path.join(appRoot, "package.json"));
  const tscPath = requireFromApp.resolve("typescript/bin/tsc");
  await execFileAsync(process.execPath, [tscPath, "-p", projectPath, "--noEmit"], {
    cwd: appRoot,
  });
}

export async function runRendererProviderTypecheck({
  appRoot = process.cwd(),
  executeTypecheck: execute = executeTypecheck,
} = {}) {
  const resolvedAppRoot = path.resolve(appRoot);
  const [catalogSource, packageSource] = await Promise.all([
    fs.readFile(
      path.join(
        resolvedAppRoot,
        "src/toolcraft/renderer-providers/catalog.json",
      ),
      "utf8",
    ),
    fs.readFile(path.join(resolvedAppRoot, "package.json"), "utf8"),
  ]);
  const catalog = parseRendererProviderCatalog(JSON.parse(catalogSource));
  const packageJson = JSON.parse(packageSource);
  assertRecord(packageJson, "packageJson");
  const dependencies = packageJson.dependencies ?? {};
  assertRecord(dependencies, "packageJson.dependencies");
  const descriptor = catalog.providers[supportedProviderId];
  if (!descriptor) {
    throw new TypeError(`Provider catalog must define "${supportedProviderId}".`);
  }

  const provider = resolveRendererProviderDefinition(descriptor, packageJson);
  const hasProviderDependency = rendererProviderDependencyNames.some((name) =>
    Object.hasOwn(dependencies, name),
  );
  if (!hasProviderDependency) {
    return Object.freeze({ providerId: null, status: "skipped" });
  }
  if (provider.dependencies.length === 0) throw new Error("VGPU dependencies require verified app-local resolution; run toolcraft:renderer enable vgpu.");
  for (const dependency of provider.dependencies) {
    if (dependencies[dependency.name] !== dependency.version) {
      throw new TypeError(
        `Renderer provider "${supportedProviderId}" requires packageJson.dependencies.${dependency.name} to equal "${dependency.version}".`,
      );
    }
  }

  await execute({
    appRoot: resolvedAppRoot,
    projectPath: path.join(
      resolvedAppRoot,
      "toolcraft/renderer-providers/vgpu/tsconfig.json",
    ),
  });
  return Object.freeze({ providerId: supportedProviderId, status: "passed" });
}

async function runCli() {
  const result = await runRendererProviderTypecheck();
  console.log(
    result.status === "passed"
      ? 'Renderer provider "vgpu" public API typecheck passed.'
      : "Renderer provider public API typecheck skipped (no provider enabled).",
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runCli().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
