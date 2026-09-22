#!/usr/bin/env node

import { realpath, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { withJournalRun } from "./toolcraft-journal-runs.mjs";

import { TOOLCRAFT_BROWSER_PROOF_TIMEOUT_MS } from "../src/app/acceptance/browser-proof-policy.mjs";
import {
  ensureToolcraftChromium,
  captureToolcraftProofIpcProcess,
  getToolcraftBinaryPath,
  runToolcraftProofProcess,
} from "./toolcraft-proof-process.mjs";
import {
  revalidateToolcraftFeaturePlaywrightAuthoritySeal,
  validateToolcraftFeaturePlaywrightAuthority,
  validateToolcraftFeaturePlaywrightPreflightAuthority,
} from "./toolcraft-feature-playwright-authority.mjs";

const FEATURE_PROCESS_ALLOWANCE_MS = 20_000;

const modulePath = fileURLToPath(import.meta.url);
const defaultProjectDir = path.resolve(path.dirname(modulePath), "..");
const proofAuthorityEnvironmentNames = Object.freeze([
  "TOOLCRAFT_BROWSER_EXECUTION_LEDGER_DIRECTORY",
  "TOOLCRAFT_BROWSER_EXECUTION_LEDGER_NONCE",
  "TOOLCRAFT_KERNEL_BENCHMARK_REPORT_NONCE",
  "TOOLCRAFT_KERNEL_BENCHMARK_REPORT_PATH",
  "TOOLCRAFT_KERNEL_BENCHMARK_SOURCE_HASH",
  "TOOLCRAFT_PERFORMANCE_FIXTURE_RESOLUTION_MODE",
  "TOOLCRAFT_PERFORMANCE_FIXTURE_SELECTOR",
  "TOOLCRAFT_PERFORMANCE_REPORT_NONCE",
  "TOOLCRAFT_PERFORMANCE_REPORT_PATH",
  "TOOLCRAFT_PERFORMANCE_REPORT_SOURCE_HASH",
  "TOOLCRAFT_PERFORMANCE_REQUEST_AUTHORITY_HASH",
  "TOOLCRAFT_TARGETED_PERFORMANCE_PASS_IDS",
  "TOOLCRAFT_TARGETED_PERFORMANCE_PATH_IDS",
  "TOOLCRAFT_TARGETED_PERFORMANCE_REPORT_NONCE",
  "TOOLCRAFT_TARGETED_PERFORMANCE_REPORT_PATH",
  "TOOLCRAFT_TARGETED_PERFORMANCE_REPORT_SOURCE_HASH",
  "TOOLCRAFT_FEATURE_VERIFICATION_PLAN",
  "TOOLCRAFT_FEATURE_VERIFICATION_REQUEST",
]);

const compareCodeUnits = (left, right) =>
  left < right ? -1 : left > right ? 1 : 0;

function getFeatureVerificationEnvironment(env) {
  const sanitized = { ...env };
  for (const name of proofAuthorityEnvironmentNames) delete sanitized[name];
  return sanitized;
}

export function parseToolcraftFeatureVerificationArguments(arguments_) {
  if (!Array.isArray(arguments_)) {
    throw new Error(
      "Toolcraft feature verification requires one or more acceptance ids or --all.",
    );
  }
  const normalizedArguments =
    arguments_[0] === "--" ? arguments_.slice(1) : arguments_;
  if (normalizedArguments.length === 0) {
    throw new Error(
      "Toolcraft feature verification requires one or more acceptance ids or --all.",
    );
  }
  if (
    normalizedArguments.length === 1 &&
    normalizedArguments[0] === "--all"
  ) {
    return Object.freeze({ mode: "all", version: 1 });
  }
  if (
    normalizedArguments.some(
      (argument) =>
        typeof argument !== "string" ||
        argument.length === 0 ||
        argument.trim() !== argument ||
        argument.startsWith("--"),
    )
  ) {
    throw new Error(
      "Toolcraft feature verification accepts only trimmed acceptance ids or the sole --all flag.",
    );
  }
  if (new Set(normalizedArguments).size !== normalizedArguments.length) {
    throw new Error(
      "Toolcraft feature verification acceptance ids must be unique.",
    );
  }
  return Object.freeze({
    acceptanceIds: Object.freeze(
      [...normalizedArguments].sort(compareCodeUnits),
    ),
    mode: "ids",
    version: 1,
  });
}

function createDefaultDependencies(onOutput) {
  return Object.freeze({
    async ensureChromium({ projectDir }) {
      await ensureToolcraftChromium({
        playwright: await import("@playwright/test"),
        projectDir,
        runProcess: (command, args, options) => runToolcraftProofProcess(command, args, { ...options, onOutput }),
      });
    },
    getBinaryPath: getToolcraftBinaryPath,
    loadFeaturePlan: async (input) => (await import("./toolcraft-feature-source-loader.mjs"))
      .loadToolcraftFeatureVerificationPlanInIsolatedProcess({ ...input, dependencies: {
        runIpcProcess: (command, args, options) => captureToolcraftProofIpcProcess(command, args, { ...options, onOutput }),
      } }),
    runProcess: runToolcraftProofProcess,
    validatePlaywrightAuthority: validateToolcraftFeaturePlaywrightAuthority,
    validatePlaywrightPreflightAuthority: validateToolcraftFeaturePlaywrightPreflightAuthority,
    revalidatePlaywrightAuthoritySeal: revalidateToolcraftFeaturePlaywrightAuthoritySeal,
    writeOutput: (source) => process.stdout.write(source),
  });
}

async function requireSelectedBrowserFiles(projectDir, files) {
  let realProjectDir;
  try {
    realProjectDir = await realpath(projectDir);
  } catch (error) {
    throw new Error(
      `Toolcraft feature verification project root must be a real directory: ${projectDir}.`,
      { cause: error },
    );
  }

  for (const file of files) {
    const absoluteFile = path.resolve(projectDir, file);
    let fileStat;
    let realFile;
    try {
      fileStat = await stat(absoluteFile);
      realFile = await realpath(absoluteFile);
    } catch (error) {
      throw new Error(
        `Toolcraft selected browser file must be a real file within the project root: ${file}.`,
        { cause: error },
      );
    }
    const relativeRealFile = path.relative(realProjectDir, realFile);
    if (
      !fileStat.isFile() ||
      relativeRealFile === "" ||
      relativeRealFile.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relativeRealFile)
    ) {
      throw new Error(
        `Toolcraft selected browser file must be a real file within the project root: ${file}.`,
      );
    }
  }
}

function getSelectedPlaywrightArguments(projectDir, featurePlan) {
  const files = Object.freeze(
    [...new Set(featurePlan.scenarios.map(({ file }) => file))].sort(
      compareCodeUnits,
    ),
  );
  const fileFilters = Object.freeze(
    files.map((file) => {
      const escapedAbsoluteFile = path
        .resolve(projectDir, file)
        .replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
      return `/^${escapedAbsoluteFile}$/`;
    }),
  );
  const timeoutMs = Math.max(
    ...featurePlan.scenarios.map(
      ({ budget }) => TOOLCRAFT_BROWSER_PROOF_TIMEOUT_MS[budget],
    ),
  );
  return {
    arguments_: [
      "test",
      ...fileFilters,
      `--timeout=${timeoutMs}`,
      "--workers=1",
    ],
    files,
  };
}

async function executeFeatureVerification({
  dependencies,
  env = process.env,
  projectDir = defaultProjectDir,
  request,
  journal,
}) {
  const resolvedProjectDir = path.resolve(projectDir);
  const sanitizedEnv = getFeatureVerificationEnvironment(env);
  await journal.stage("authority-preflight", { request });
  const preflight = await dependencies.validatePlaywrightPreflightAuthority?.({ projectDir: resolvedProjectDir });
  if (preflight) await dependencies.revalidatePlaywrightAuthoritySeal?.(preflight.seal);
  await journal.stage("load-feature-plan");
  const featurePlan = await dependencies.loadFeaturePlan({
    env: sanitizedEnv,
    projectDir: resolvedProjectDir,
    request,
  });
  if (preflight) await dependencies.revalidatePlaywrightAuthoritySeal?.(preflight.seal);
  const planSource = JSON.stringify(featurePlan);
  const { arguments_: playwrightArguments, files } =
    getSelectedPlaywrightArguments(resolvedProjectDir, featurePlan);
  await requireSelectedBrowserFiles(resolvedProjectDir, files);
  const authoritySeal = await dependencies.validatePlaywrightAuthority({
    files,
    projectDir: resolvedProjectDir,
  });
  await journal.source([...files, ...(authoritySeal?.seal?.files ?? []).map((file) => file.filePath)]);

  dependencies.writeOutput(
    `[toolcraft] Focused feature verification: ${featurePlan.acceptanceIds.join(", ")}\n`,
  );
  dependencies.writeOutput(
    `[toolcraft] Browser scenarios: ${featurePlan.scenarios
      .map(({ testName }) => testName)
      .join(" | ")}\n`,
  );
  await journal.stage("chromium-readiness");
  await dependencies.ensureChromium({ projectDir: resolvedProjectDir });
  const playwrightBin = dependencies.getBinaryPath(
    resolvedProjectDir,
    "playwright",
  );
  if (preflight) await dependencies.revalidatePlaywrightAuthoritySeal?.(preflight.seal);
  await dependencies.revalidatePlaywrightAuthoritySeal?.(authoritySeal?.seal);
  await journal.stage("browser-checks", { acceptanceIds: featurePlan.acceptanceIds, scenarios: featurePlan.scenarios,
    command: playwrightBin, arguments: playwrightArguments });
  await dependencies.runProcess(playwrightBin, playwrightArguments, {
    onOutput: journal.output,
    cwd: resolvedProjectDir,
    deadlineMs:
      FEATURE_PROCESS_ALLOWANCE_MS +
      featurePlan.scenarios.reduce(
        (total, { budget }) =>
          total + TOOLCRAFT_BROWSER_PROOF_TIMEOUT_MS[budget],
        0,
      ),
    env: {
      ...sanitizedEnv,
      TOOLCRAFT_BROWSER_SERVER_MODE: "dev",
      TOOLCRAFT_FEATURE_VERIFICATION_PLAN: planSource,
    },
  });
  return featurePlan;
}

export async function runToolcraftFeatureVerificationCore({ dependencies,
  env = process.env, projectDir = defaultProjectDir, request }) {
  return withJournalRun({ projectDir, kind: "feature", command: "test:feature",
    arguments_: request.mode === "all" ? ["--all"] : [...request.acceptanceIds],
    changeId: env.TOOLCRAFT_CHANGE_ID ?? null, retryOf: env.TOOLCRAFT_RETRY_OF ?? null }, async (journal) => {
    const resolvedDependencies = dependencies ?? createDefaultDependencies(journal.output);
    resolvedDependencies.writeOutput?.(`[toolcraft] Text journal run: ${journal.runId}\n`);
    const observedDependencies = { ...resolvedDependencies, writeOutput(source) {
      journal.output("stdout", source);
      resolvedDependencies.writeOutput(source);
    } };
    return executeFeatureVerification({ dependencies: observedDependencies, env, projectDir, request, journal });
  });
}

export async function runToolcraftFeatureVerification({
  arguments_ = process.argv.slice(2),
  env = process.env,
  projectDir = defaultProjectDir,
} = {}) {
  return runToolcraftFeatureVerificationCore({
    env,
    projectDir,
    request: parseToolcraftFeatureVerificationArguments(arguments_),
  });
}

async function isDirectExecution() {
  if (!process.argv[1]) return false;
  try {
    return (await realpath(process.argv[1])) === (await realpath(modulePath));
  } catch {
    return path.resolve(process.argv[1]) === modulePath;
  }
}

if (await isDirectExecution()) await runToolcraftFeatureVerification();
