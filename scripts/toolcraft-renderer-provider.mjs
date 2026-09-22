#!/usr/bin/env node

import { execFile } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { activateLatestRendererProvider } from "./toolcraft-renderer-activation.mjs";

import { enableRendererProvider } from "../src/toolcraft/renderer-providers/provider-config.mjs";

const execFileAsync = promisify(execFile);
const defaultAppRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

async function runPlatformIntegrity(appRoot) {
  await execFileAsync(
    process.execPath,
    [path.join(appRoot, "scripts/check-toolcraft-integrity.mjs"), "--platform-only"],
    { cwd: appRoot },
  );
}

function createStagingPath(packageJsonPath) {
  return path.join(
    path.dirname(packageJsonPath),
    `.${path.basename(packageJsonPath)}.toolcraft-renderer-provider-${process.pid}-${crypto.randomUUID()}`,
  );
}

export async function configureRendererProvider({
  appRoot = defaultAppRoot,
  beforeCommit = () => {},
  fileOperations = fs,
  providerId,
}) {
  const resolvedAppRoot = path.resolve(appRoot);
  await runPlatformIntegrity(resolvedAppRoot);

  const catalogPath = path.join(
    resolvedAppRoot,
    "src/toolcraft/renderer-providers/catalog.json",
  );
  const packageJsonPath = path.join(resolvedAppRoot, "package.json");
  const [catalogSource, originalPackageBuffer, packageStat] = await Promise.all([
    fileOperations.readFile(catalogPath, "utf8"),
    fileOperations.readFile(packageJsonPath),
    fileOperations.stat(packageJsonPath),
  ]);
  const catalog = JSON.parse(catalogSource);
  if (catalog.schemaVersion === 3) {
    if (providerId !== "vgpu") throw new TypeError(`Unknown renderer provider "${providerId}".`);
    return activateLatestRendererProvider({ appRoot: resolvedAppRoot, catalog });
  }
  const result = enableRendererProvider({
    catalog: JSON.parse(catalogSource),
    packageJson: JSON.parse(originalPackageBuffer.toString("utf8")),
    providerId,
  });

  if (!result.changed) {
    return Object.freeze({ changed: false, installCommand: "npm install" });
  }

  const stagingPath = createStagingPath(packageJsonPath);
  let stagingFile;
  let ownsStagingPath = false;
  let failure;
  let hasFailure = false;
  const recordFailure = (error) => {
    if (!hasFailure) {
      failure = error;
      hasFailure = true;
    }
  };
  try {
    stagingFile = await fileOperations.open(stagingPath, "wx", packageStat.mode);
    ownsStagingPath = true;
    await stagingFile.writeFile(`${JSON.stringify(result.packageJson, null, 2)}\n`);
    await stagingFile.sync();
    await stagingFile.close();
    stagingFile = undefined;
    await beforeCommit();
    const currentPackageBuffer = await fileOperations.readFile(packageJsonPath);
    if (!currentPackageBuffer.equals(originalPackageBuffer)) {
      throw new Error(
        "package.json changed concurrently; retry renderer provider activation.",
      );
    }
    await fileOperations.rename(stagingPath, packageJsonPath);
    ownsStagingPath = false;
  } catch (error) {
    recordFailure(error);
  }

  try {
    if (stagingFile) {
      try {
        await stagingFile.close();
      } catch (error) {
        recordFailure(error);
      }
    }
  } finally {
    if (ownsStagingPath) {
      try {
        await fileOperations.rm(stagingPath, { force: true });
      } catch (error) {
        recordFailure(error);
      }
    }
  }
  if (hasFailure) {
    throw failure;
  }

  return Object.freeze({ changed: true, installCommand: "npm install" });
}

async function runCli() {
  const rawArguments = process.argv.slice(2);
  const argumentsWithoutSeparator =
    rawArguments[0] === "--" ? rawArguments.slice(1) : rawArguments;
  const [command, providerId, ...remaining] = argumentsWithoutSeparator;
  if (command !== "enable" || providerId !== "vgpu" || remaining.length > 0) {
    throw new TypeError("Usage: npm run toolcraft:renderer -- enable vgpu");
  }

  const result = await configureRendererProvider({ providerId });
  console.log(
    result.changed
      ? 'Renderer provider "vgpu" enabled.'
      : 'Renderer provider "vgpu" already enabled.',
  );
  if (result.version) console.log(`VGPU ${result.version}: exact dependencies installed and compatibility verified.`);
  if (result.installCommand) console.log(result.installCommand);
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
