import path from "node:path";

import {
  collectToolcraftPlaywrightTestTitles,
  getToolcraftPlaywrightExactGrepPattern,
  resolveToolcraftPlaywrightTestTitles,
} from "./playwright-test-title-selection.mjs";
import {
  getToolcraftDeliveryPlanError,
} from "./toolcraft-delivery-plan.mjs";
import {
  getToolcraftExecutionEvidenceError,
} from "./toolcraft-delivery-evidence.mjs";
import {
  createToolcraftPlanExecutionAuthorityRegistry,
} from "./toolcraft-plan-execution-authority.mjs";
import {
  captureToolcraftProofProcess,
  ensureToolcraftChromium,
  getToolcraftBinaryPath,
  getToolcraftFrozenInstallCommand,
  runToolcraftProofPackageScript,
  runToolcraftProofProcess,
} from "./toolcraft-proof-process.mjs";
import {
  executeToolcraftTargetedPerformanceVerification,
} from "./toolcraft-targeted-performance-execution.mjs";
import {
  collectToolcraftVerificationInputs,
} from "./toolcraft-verification-inventory.mjs";
import {
  getToolcraftProductTestProcessArgs,
  getToolcraftProductTestProcessEnvironment,
} from "./toolcraft-vitest-runtime-contract.mjs";
import {
  runToolcraftProtectedBrowserBuild,
} from "./toolcraft-protected-browser-build.mjs";

const operationNames = Object.freeze({
  build: "runBuild",
  "browser-functional": "runBrowserFunctional",
  "browser-performance": "runBrowserPerformance",
  "code-health": "runCodeHealth",
  dependencies: "runDependencies",
  docs: "runDocs",
  "product-tests": "runProductTests",
});
const proofOperationNames = new Set([
  "collectInventory",
  ...Object.values(operationNames),
]);

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

function assertOperations(operations) {
  if (
    typeof operations !== "object" ||
    operations === null ||
    !Object.isFrozen(operations) ||
    Object.keys(operations).length !== proofOperationNames.size ||
    !Object.keys(operations).every(
      (name) =>
        proofOperationNames.has(name) &&
        typeof operations[name] === "function",
    )
  ) {
    throw new Error(
      "Toolcraft delivery execution requires explicit frozen proof operations.",
    );
  }
}

function stepEvidence(step, operationResult) {
  if (step.kind === "dependencies") {
    return { kind: step.kind, packageManager: step.packageManager };
  }
  if (step.kind === "product-tests") {
    return { files: step.files, kind: step.kind };
  }
  if (step.kind === "browser-functional") {
    return { kind: step.kind, testNames: step.testNames };
  }
  if (step.kind === "browser-performance") {
    return {
      kind: step.kind,
      passIds: step.passIds,
      pathIds: step.pathIds,
      report: operationResult.report,
      evidenceHash: operationResult.evidenceHash,
      testEvidence: operationResult.testEvidence,
      testNames: step.testNames,
    };
  }
  return { kind: step.kind };
}

async function executeStep(step, operations, plan, projectDir) {
  const operation = operations[operationNames[step.kind]];
  const common = { plan, projectDir, serverMode: "preview", step };
  let result;
  if (step.kind === "browser-functional") {
    result = await operation({ ...common, testNames: step.testNames });
  } else {
    result = await operation(common);
  }
  return stepEvidence(step, result);
}

async function runStage(kinds, plan, operations, projectDir, evidenceByKind) {
  const steps = plan.steps.filter((step) => kinds.includes(step.kind));
  const settlements = await Promise.allSettled(
    steps.map((step) =>
      executeStep(step, operations, plan, projectDir),
    ),
  );
  const failure = settlements.find(({ status }) => status === "rejected");
  if (failure) throw failure.reason;
  const evidence = settlements.map(({ value }) => value);
  evidence.forEach((entry) => evidenceByKind.set(entry.kind, entry));
}

export async function executeToolcraftDeliveryPlanCore({
  operations,
  plan,
  projectDir,
}) {
  const planError = getToolcraftDeliveryPlanError(plan);
  if (planError) throw new Error(planError);
  assertOperations(operations);
  const evidenceByKind = new Map();
  await runStage(
    ["dependencies"],
    plan,
    operations,
    projectDir,
    evidenceByKind,
  );
  await runStage(
    ["docs", "code-health"],
    plan,
    operations,
    projectDir,
    evidenceByKind,
  );
  await runStage(
    ["product-tests", "build"],
    plan,
    operations,
    projectDir,
    evidenceByKind,
  );
  await runStage(
    ["browser-functional"],
    plan,
    operations,
    projectDir,
    evidenceByKind,
  );
  await runStage(
    ["browser-performance"],
    plan,
    operations,
    projectDir,
    evidenceByKind,
  );
  const finalInventory = await operations.collectInventory(projectDir);
  const evidence = plan.steps.map((step) => evidenceByKind.get(step.kind));
  const evidenceError = getToolcraftExecutionEvidenceError({
    evidence,
    finalInventory,
    plan,
  });
  if (evidenceError) throw new Error(evidenceError);
  return deepFreeze({ evidence, finalInventory });
}

function createToolcraftProofOperations() {
  let availableTitlesPromise;
  async function getAvailableTitles(projectDir) {
    availableTitlesPromise ??= captureToolcraftProofProcess(
      getToolcraftBinaryPath(projectDir, "playwright"),
      ["test", "--list", "--reporter=json"],
      { cwd: projectDir },
    ).then((output) =>
      collectToolcraftPlaywrightTestTitles(JSON.parse(output)),
    );
    return availableTitlesPromise;
  }
  async function getSelections(projectDir, testNames) {
    const selections = resolveToolcraftPlaywrightTestTitles(
      await getAvailableTitles(projectDir),
      testNames,
    );
    return [...selections].sort((left, right) =>
      left.fullTitle < right.fullTitle
        ? -1
        : left.fullTitle > right.fullTitle
          ? 1
          : 0,
    );
  }
  async function prepareBrowser(projectDir) {
    await ensureToolcraftChromium({
      playwright: await import("@playwright/test"),
      projectDir,
    });
  }
  async function runBrowser(projectDir, testNames) {
    await prepareBrowser(projectDir);
    const selections = await getSelections(projectDir, testNames);
    await runToolcraftProofProcess(
      getToolcraftBinaryPath(projectDir, "playwright"),
      [
        "test",
        "--grep",
        getToolcraftPlaywrightExactGrepPattern(selections),
        "--workers=1",
      ],
      {
        cwd: projectDir,
        env: {
          ...process.env,
          TOOLCRAFT_BROWSER_SERVER_MODE: "preview",
        },
      },
    );
  }
  return Object.freeze({
    collectInventory: collectToolcraftVerificationInputs,
    runBrowserFunctional: ({ projectDir, testNames }) =>
      runBrowser(projectDir, testNames),
    async runBrowserPerformance({ plan, projectDir, step }) {
      if (plan.kind !== "performance-iteration") {
        throw new Error(
          "Toolcraft browser performance execution requires a performance-iteration plan.",
        );
      }
      await prepareBrowser(projectDir);
      const selections = await getSelections(projectDir, step.testNames);
      return executeToolcraftTargetedPerformanceVerification({
        fixtureResolutionMode: "strict-development",
        performanceComparison: plan.performanceComparison,
        performancePassIds: step.passIds,
        performancePathIds: step.pathIds,
        performanceSelections: selections,
        performanceTestNames: step.testNames,
        playwrightBin: getToolcraftBinaryPath(projectDir, "playwright"),
        projectDir,
        requestAuthorityHash: plan.requestAuthorityHash,
        sourceHash: plan.sourceHash,
      });
    },
    runBuild: ({ projectDir }) =>
      runToolcraftProtectedBrowserBuild({ projectDir }),
    runCodeHealth: ({ projectDir }) =>
      runToolcraftProofPackageScript(projectDir, "ai:check"),
    async runDependencies({ projectDir, step }) {
      const command = getToolcraftFrozenInstallCommand(step.packageManager);
      await runToolcraftProofProcess(command.command, command.args, {
        cwd: projectDir,
      });
    },
    runDocs: ({ projectDir }) =>
      runToolcraftProofPackageScript(projectDir, "docs:check"),
    runProductTests: ({ projectDir, step }) =>
      runToolcraftProofProcess(
        getToolcraftBinaryPath(projectDir, "vitest"),
        getToolcraftProductTestProcessArgs(step.files),
        {
          cwd: projectDir,
          env: getToolcraftProductTestProcessEnvironment(step.acceptanceIds),
        },
      ),
  });
}

const authorityRegistry = createToolcraftPlanExecutionAuthorityRegistry(
  ({ plan, projectDir }) =>
    executeToolcraftDeliveryPlanCore({
      operations: createToolcraftProofOperations(),
      plan,
      projectDir: path.resolve(projectDir),
    }),
);

export const executeToolcraftDeliveryPlan = authorityRegistry.execute;
export const finalizeToolcraftPlanExecutionAuthority =
  authorityRegistry.finalize;
export const releaseToolcraftPlanExecutionAuthority =
  authorityRegistry.release;
export const reserveToolcraftPlanExecutionAuthority =
  authorityRegistry.reserve;
