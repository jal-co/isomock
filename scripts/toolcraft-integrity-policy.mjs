import { toolcraftContractManifest } from "./toolcraft-contract-manifest.mjs";

export const requiredPackageScriptNames = [
  "ai:check",
  "build",
  "dev",
  "dev:restart",
  "docs:check",
  "preview",
  "preview:restart",
  "reference:study",
  "test",
  "test:browser",
  "test:feature",
  "typecheck",
  "verify:delivery",
  "verify:kernel",
  "verify:perf",
  "verify:receipt",
];

const requiredMotionReferenceTrustRootFilePaths = [
  "scripts/create-toolcraft-motion-reference-study.mjs",
  "src/app/acceptance/motion-reference-evidence.d.mts",
  "src/app/acceptance/motion-reference-evidence.mjs",
];

export const reservedGeneratedVerificationConfigPatterns = [
  /^playwright\.config\.[cm]?[jt]s$/u,
  /^vite\.config\.[cm]?[jt]s$/u,
  /^vitest\.config\.[cm]?[jt]s$/u,
  /^vitest\.workspace\.[cm]?[jt]s$/u,
];

export const requiredProtectedTrustRootFilePaths = [
  "AGENTS.md",
  "docs/toolcraft/workflow.md",
  "e2e/app-browser-runtime-evidence.spec.ts",
  "e2e/app-performance.spec.ts",
  "e2e/browser-performance-report.ts",
  "e2e/browser-runtime-evidence-reporter.ts",
  "e2e/browser-runtime-evidence-requirements.ts",
  "e2e/toolcraft-feature-verification-reporter.ts",
  "e2e/performance-pipeline-evidence.ts",
  "e2e/toolcraft-product-test.ts",
  "playwright.config.ts",
  "scripts/check-toolcraft-code-health.mjs",
  "scripts/check-toolcraft-integrity.mjs",
  "scripts/run-browser-performance.mjs",
  "scripts/run-delivery-verification.mjs",
  "scripts/run-kernel-benchmarks.mjs",
  "scripts/run-feature-verification.mjs",
  "scripts/toolcraft-integrity-manifest.mjs",
  "scripts/toolcraft-integrity-policy.mjs",
  "scripts/toolcraft-renderer-provider-typecheck.mjs",
  "scripts/toolcraft-product-boundary.mjs",
  "scripts/toolcraft-performance-receipt-policy.mjs",
  "scripts/toolcraft-verification-inventory.mjs",
  "scripts/toolcraft-verification-receipt.mjs",
  "scripts/toolcraft-source-ownership.mjs",
  "scripts/toolcraft-vitest-runtime-contract.mjs",
  "scripts/toolcraft-vitest-runtime-evidence-reporter.mjs",
  "scripts/toolcraft-workflow-routes.mjs",
  "src/app/acceptance/validation-pipeline.ts",
  "src/app/app-automated-runtime-evidence.test.ts",
  "vite.config.ts",
  ...requiredMotionReferenceTrustRootFilePaths,
];

export const runtimeSurfaceComponentNames = Object.freeze([
  ...toolcraftContractManifest.runtimeSurfaceComponentNames,
]);

export const builtInControlExportNames = Object.freeze([
  ...toolcraftContractManifest.protectedControlExportNames,
]);

export const builtInControlComponentNames = Object.freeze(
  builtInControlExportNames.filter((name) => name.endsWith("Control")),
);
