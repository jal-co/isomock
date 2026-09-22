#!/usr/bin/env node

import crypto from "node:crypto";
import { realpathSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateIntegrityManifest } from "./toolcraft-integrity-manifest.mjs";
import { getToolcraftContractDocIntegrityFailures } from "./toolcraft-contract-doc-integrity.mjs";
import {
  requiredPackageScriptNames,
  requiredProtectedTrustRootFilePaths,
  reservedGeneratedVerificationConfigPatterns,
} from "./toolcraft-integrity-policy.mjs";
import {
  assertToolcraftVerificationInventoryProvenance,
  collectToolcraftVerificationInputs,
} from "./toolcraft-verification-inventory.mjs";

const appRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const manifestRepoPath = "src/toolcraft/.toolcraft-manifest.json";

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

async function hashFile(filePath) {
  return sha256(await fs.readFile(filePath));
}

function reportIntegrityFailures(failures) {
  console.error("Toolcraft generated app integrity check failed.");
  console.error(
    "Do not edit src/toolcraft or framework-owned verification infrastructure in generated apps.",
  );
  console.error(
    "Fix the source runtime in the monorepo, generate a fresh app folder, then move product-owned app source deliberately.",
  );

  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
}

async function collectToolcraftInventory(rootDir) {
  const files = [];
  const unsupportedEntries = [];

  async function visit(currentDir) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const filePath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        await visit(filePath);
        continue;
      }

      if (entry.isFile() && entry.name !== ".toolcraft-manifest.json") {
        files.push(path.relative(rootDir, filePath).split(path.sep).join("/"));
        continue;
      }

      if (!entry.isFile()) {
        unsupportedEntries.push(
          path.relative(rootDir, filePath).split(path.sep).join("/"),
        );
      }
    }
  }

  await visit(rootDir);
  return {
    files: files.sort(),
    unsupportedEntries: unsupportedEntries.sort(),
  };
}

async function collectIntegrityFailures({ platformOnly, rootDir }) {
  const toolcraftRoot = path.join(rootDir, "src/toolcraft");
  const manifestPath = path.join(rootDir, ...manifestRepoPath.split("/"));

  if (!(await pathExists(toolcraftRoot))) {
    return {
      failures: ["Missing generated Toolcraft source tree src/toolcraft."],
    };
  }

  if (!(await pathExists(manifestPath))) {
    return {
      failures: [
        "Missing src/toolcraft/.toolcraft-manifest.json; generated apps must preserve the integrity manifest.",
      ],
    };
  }

  const manifestBuffer = await fs.readFile(manifestPath);
  const manifestHash = sha256(manifestBuffer);
  const manifest = JSON.parse(manifestBuffer.toString("utf8"));
  const manifestValidation = validateIntegrityManifest({
    appRoot: rootDir,
    manifest,
    requiredPackageScriptNames,
    requiredProtectedTrustRootFilePaths,
    toolcraftRoot,
  });

  if (manifestValidation.failures.length > 0) {
    return {
      failures: manifestValidation.failures,
      manifestHash,
    };
  }

  const {
    expectedPackageScripts,
    resolvedExpectedFiles,
    resolvedProtectedFiles,
  } = manifestValidation;

  const toolcraftInventory = await collectToolcraftInventory(toolcraftRoot);
  const actualFiles = toolcraftInventory.files;
  const actualFileSet = new Set(actualFiles);
  const failures = toolcraftInventory.unsupportedEntries.map(
    (relativePath) => `unsupported Toolcraft entry ${relativePath}`,
  );

  const rootEntries = await fs.readdir(rootDir, { withFileTypes: true });
  for (const entry of rootEntries) {
    if (
      reservedGeneratedVerificationConfigPatterns.some((pattern) =>
        pattern.test(entry.name),
      ) &&
      !resolvedProtectedFiles.has(entry.name)
    ) {
      failures.push(`unapproved verification config ${entry.name}`);
    }
  }

  try {
    const packageJson = JSON.parse(
      await fs.readFile(path.join(rootDir, "package.json"), "utf8"),
    );
    const actualPackageScripts = packageJson.scripts ?? {};

    for (const [scriptName, expectedCommand] of expectedPackageScripts) {
      if (actualPackageScripts[scriptName] !== expectedCommand) {
        failures.push(`modified package script ${scriptName}`);
      }
    }

    for (const scriptName of Object.keys(actualPackageScripts)) {
      const lifecycleTarget = scriptName.startsWith("pre")
        ? scriptName.slice("pre".length)
        : scriptName.startsWith("post")
          ? scriptName.slice("post".length)
          : "";

      if (
        expectedPackageScripts.has(lifecycleTarget) &&
        !expectedPackageScripts.has(scriptName)
      ) {
        failures.push(`added package lifecycle script ${scriptName}`);
      }
    }
  } catch {
    failures.push("missing or invalid package.json");
  }

  if (!platformOnly) {
    const {
      evaluateToolcraftProductBoundary,
      printToolcraftProductBoundaryResult,
      toolcraftProductBoundaryPassed,
    } = await import("./toolcraft-product-boundary.mjs");
    const productBoundaryResult = await evaluateToolcraftProductBoundary({
      protectedFilePaths: [...resolvedProtectedFiles.keys()],
      rootDir,
    });

    if (!toolcraftProductBoundaryPassed(productBoundaryResult)) {
      const boundaryMessages = [];
      printToolcraftProductBoundaryResult(productBoundaryResult, {
        error(message) {
          boundaryMessages.push(message.replace(/^- /u, ""));
        },
      });
      failures.push(...boundaryMessages);
    }
  }

  for (const [
    relativePath,
    { expectedHash, filePath },
  ] of resolvedExpectedFiles) {
    if (!actualFileSet.has(relativePath)) {
      failures.push(`deleted ${relativePath}`);
      continue;
    }

    const actualHash = await hashFile(filePath);

    if (actualHash !== expectedHash) {
      failures.push(`modified ${relativePath}`);
    }
  }

  for (const relativePath of actualFiles) {
    if (!resolvedExpectedFiles.has(relativePath)) {
      failures.push(`added ${relativePath}`);
    }
  }

  for (const [
    relativePath,
    { expectedHash, filePath },
  ] of resolvedProtectedFiles) {
    if (!(await pathExists(filePath))) {
      failures.push(`deleted ${relativePath}`);
      continue;
    }

    if ((await hashFile(filePath)) !== expectedHash) {
      failures.push(`modified ${relativePath}`);
    }
  }

  failures.push(
    ...(await getToolcraftContractDocIntegrityFailures({
      appRoot: rootDir,
      protectedRelativePaths: resolvedProtectedFiles.keys(),
    })),
  );

  return { failures, manifestHash };
}

export class ToolcraftIntegrityError extends Error {
  constructor(failures) {
    super(failures.join("\n"));
    this.failures = Object.freeze([...failures]);
    this.name = "ToolcraftIntegrityError";
  }
}

export async function evaluateToolcraftIntegrity({
  inventory,
  platformOnly = false,
  rootDir = appRoot,
}) {
  const resolvedRoot = path.resolve(rootDir);
  try {
    assertToolcraftVerificationInventoryProvenance({
      inventory,
      rootDir: resolvedRoot,
    });
  } catch (error) {
    throw new ToolcraftIntegrityError([
      error instanceof Error ? error.message : String(error),
    ]);
  }
  const result = await collectIntegrityFailures({
    platformOnly,
    rootDir: resolvedRoot,
  });
  if (result.failures.length > 0) {
    throw new ToolcraftIntegrityError(result.failures);
  }
  const manifestInventoryEntry = inventory.entries.find(
    (entry) => entry.path === manifestRepoPath,
  );
  if (
    manifestInventoryEntry === undefined ||
    manifestInventoryEntry.sha256 !== result.manifestHash
  ) {
    throw new ToolcraftIntegrityError([
      "Toolcraft integrity manifest does not match the authoritative verification inventory.",
    ]);
  }
  return Object.freeze({
    manifestHash: result.manifestHash,
    sourceHash: inventory.sourceHash,
  });
}

async function runCli() {
  let inventory;
  try {
    inventory = await collectToolcraftVerificationInputs(appRoot);
  } catch (error) {
    throw new ToolcraftIntegrityError([
      error instanceof Error ? error.message : String(error),
    ]);
  }
  await evaluateToolcraftIntegrity({
    inventory,
    platformOnly: process.argv.includes("--platform-only"),
  });
  const toolcraftFileCount = inventory.entries.filter(
    (entry) =>
      entry.path.startsWith("src/toolcraft/") &&
      entry.path !== manifestRepoPath,
  ).length;
  console.log(
    `Toolcraft integrity check passed (${toolcraftFileCount} files).`,
  );
}

function isDirectCliInvocation(argvEntry) {
  if (!argvEntry) return false;
  try {
    return (
      realpathSync(path.resolve(argvEntry)) ===
      realpathSync(fileURLToPath(import.meta.url))
    );
  } catch {
    return false;
  }
}

if (isDirectCliInvocation(process.argv[1])) {
  runCli().catch((error) => {
    if (error instanceof ToolcraftIntegrityError) {
      reportIntegrityFailures(error.failures);
    } else {
      console.error(error instanceof Error ? error.message : error);
    }
    process.exitCode = 1;
  });
}
