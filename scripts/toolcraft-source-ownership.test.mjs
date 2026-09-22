import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  collectToolcraftFrameworkOwnedGeneratedPaths,
  collectToolcraftFrameworkOwnedLocalPaths,
  isToolcraftFrameworkOwnedPath,
  toToolcraftGeneratedPath,
  toolcraftFrameworkOwnedRootFiles,
  toolcraftProductOwnedGeneratedPaths,
} from "./toolcraft-source-ownership.mjs";
import { requiredProtectedTrustRootFilePaths } from "./toolcraft-integrity-policy.mjs";

const starterRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

test("maps starter facade names to generated paths", () => {
  assert.equal(
    toToolcraftGeneratedPath("src/app/app-composition.tsx"),
    "src/app/app-composition.tsx",
  );
  assert.equal(
    toToolcraftGeneratedPath("src/app/acceptance/validation-pipeline.ts"),
    "src/app/acceptance/validation-pipeline.ts",
  );
});

test("classifies framework infrastructure and product extension points", () => {
  assert.equal(
    isToolcraftFrameworkOwnedPath("src/app/acceptance/actions.ts"),
    true,
  );
  assert.equal(
    isToolcraftFrameworkOwnedPath("src/app/app-composition.tsx"),
    false,
  );
  assert.equal(
    isToolcraftFrameworkOwnedPath("src/app/app-composition.tsx"),
    false,
  );
  assert.equal(isToolcraftFrameworkOwnedPath("src/features/product.ts"), false);
  assert.equal(isToolcraftFrameworkOwnedPath("src/app/app-defaults.json"), false);
  assert.equal(isToolcraftFrameworkOwnedPath("scripts/toolcraft-app-defaults-plugin.mjs"), true);
});

test("collects the same ownership policy for starter-local and generated paths", async () => {
  const localPaths = await collectToolcraftFrameworkOwnedLocalPaths(starterRoot);
  const generatedPaths =
    await collectToolcraftFrameworkOwnedGeneratedPaths(starterRoot);

  assert.deepEqual(
    generatedPaths,
    [...new Set(localPaths.map(toToolcraftGeneratedPath))].sort(),
  );
  assert.ok(localPaths.includes("src/app/acceptance/actions.ts"));
  for (const vectorProofPath of [
    "src/app/acceptance/vector-screen-motion.ts",
    "e2e/browser-vector-screen-motion.ts",
    "e2e/browser-vector-marker.ts",
    "e2e/browser-vector-screen-motion-fixture.tsx",
    "e2e/browser-vector-shader-fixture.ts",
    "docs/toolcraft/vector-controls.md",
  ]) {
    assert.ok(localPaths.includes(vectorProofPath), `Vector direction authority must be signed: ${vectorProofPath}`);
    assert.ok(generatedPaths.includes(vectorProofPath));
  }
  assert.equal(
    localPaths.filter(
      (relativePath) =>
        toToolcraftGeneratedPath(relativePath) ===
        "src/app/app-automated-runtime-evidence.test.ts",
    ).length,
    1,
  );
  assert.ok(!localPaths.includes("src/app/app-composition.tsx"));

  for (const relativePath of toolcraftFrameworkOwnedRootFiles) {
    assert.ok(localPaths.includes(relativePath));
  }
  for (const relativePath of toolcraftProductOwnedGeneratedPaths) {
    assert.ok(!generatedPaths.includes(relativePath));
  }
});

test("keeps the signed-manifest trust root unique and inside canonical ownership", async () => {
  const generatedPaths =
    await collectToolcraftFrameworkOwnedGeneratedPaths(starterRoot);
  const generatedPathSet = new Set(generatedPaths);

  assert.ok(requiredProtectedTrustRootFilePaths.length > 0);
  assert.equal(
    new Set(requiredProtectedTrustRootFilePaths).size,
    requiredProtectedTrustRootFilePaths.length,
  );
  for (const relativePath of requiredProtectedTrustRootFilePaths) {
    assert.ok(
      generatedPathSet.has(relativePath),
      `Trust-root path must be framework-owned: ${relativePath}`,
    );
  }

  const subsystemSentinels = [
    "AGENTS.md",
    "e2e/app-performance.spec.ts",
    "e2e/browser-performance-report.ts",
    "e2e/browser-runtime-evidence-reporter.ts",
    "e2e/performance-pipeline-evidence.ts",
    "e2e/toolcraft-product-test.ts",
    "scripts/check-toolcraft-integrity.mjs",
    "scripts/run-delivery-verification.mjs",
    "scripts/run-feature-verification.mjs",
    "e2e/toolcraft-feature-verification-reporter.ts",
    "scripts/toolcraft-integrity-policy.mjs",
    "scripts/toolcraft-source-ownership.mjs",
    "scripts/toolcraft-vitest-runtime-evidence-reporter.mjs",
    "scripts/toolcraft-workflow-routes.mjs",
    "src/app/app-automated-runtime-evidence.test.ts",
  ];
  for (const relativePath of subsystemSentinels) {
    assert.ok(
      requiredProtectedTrustRootFilePaths.includes(relativePath),
      `Trust root must retain the ${relativePath} sentinel.`,
    );
  }
  assert.deepEqual(
    requiredProtectedTrustRootFilePaths.filter((relativePath) =>
      relativePath.includes("feature-verification"),
    ),
    [
      "e2e/toolcraft-feature-verification-reporter.ts",
      "scripts/run-feature-verification.mjs",
    ],
    "Focused verification trust root must contain only public execution authorities.",
  );

  // The required root names subsystem authorities. Their transitive modules stay
  // protected by the complete signed framework inventory without becoming sentinels.
  for (const relativePath of [
    "e2e/browser-performance-evidence.ts",
    "e2e/browser-model-import-evidence-helpers.ts",
    "e2e/browser-orientation-gizmo-evidence-helpers.ts",
    "e2e/browser-performance-measurement-evidence.ts",
    "e2e/browser-performance-measurement-report.ts",
    "e2e/performance-checkpoint-report.ts",
    "e2e/performance-environment-evidence.ts",
    "e2e/performance-helpers.ts",
    "e2e/performance-measurement-evidence.ts",
    "e2e/performance-path-adapter-contract.ts",
    "e2e/performance-path-adapter-matrix.ts",
    "e2e/performance-path-helpers.ts",
    "e2e/performance-pipeline-invariants.ts",
    "e2e/performance-pipeline-phase-continuity.ts",
    "src/app/test-evidence/browser-performance-contract.ts",
    "src/app/test-evidence/browser-performance-measurement-contract.ts",
    "scripts/toolcraft-performance-report.mjs",
    "scripts/toolcraft-feature-source-loader.mjs",
    "scripts/toolcraft-feature-verification-plan.mjs",
    "src/app/acceptance/browser-proof-policy.d.mts",
    "src/app/acceptance/browser-proof-policy.mjs",
    "src/app/acceptance/browser-proof.ts",
    "src/app/acceptance/feature-verification-selection.ts",
  ]) {
    assert.equal(
      requiredProtectedTrustRootFilePaths.includes(relativePath),
      false,
      `Transitive implementation must not become a trust-root sentinel: ${relativePath}`,
    );
    assert.ok(
      generatedPathSet.has(relativePath),
      `Transitive implementation dependency must remain in the signed inventory: ${relativePath}`,
    );
  }
});

test("uses public motion-reference sentinels while signing transitive owners through canonical inventory", async () => {
  const generatedPaths =
    await collectToolcraftFrameworkOwnedGeneratedPaths(starterRoot);
  const publicSentinels = [
    "scripts/create-toolcraft-motion-reference-study.mjs",
    "src/app/acceptance/motion-reference-evidence.d.mts",
    "src/app/acceptance/motion-reference-evidence.mjs",
  ];
  const representativeTransitiveOwners = [
    "scripts/toolcraft-motion-reference-group-inventory.mjs",
    "scripts/toolcraft-motion-reference-publication-journal.mjs",
  ];

  assert.deepEqual(
    requiredProtectedTrustRootFilePaths.filter((relativePath) =>
      relativePath.includes("motion-reference"),
    ),
    publicSentinels,
  );
  for (const representativeTransitiveOwner of representativeTransitiveOwners) {
    assert.equal(
      requiredProtectedTrustRootFilePaths.includes(representativeTransitiveOwner),
      false,
      "Transitive implementation modules belong to the complete signed framework inventory, not the public sentinel list.",
    );
    assert.ok(generatedPaths.includes(representativeTransitiveOwner));
  }
});

test("signs delivery catalog decomposition without promoting it to trust-root sentinels", async () => {
  const generatedPaths =
    await collectToolcraftFrameworkOwnedGeneratedPaths(starterRoot);
  const catalogImplementationPaths = [
    "scripts/toolcraft-delivery-catalog-validation.d.mts",
    "scripts/toolcraft-delivery-catalog-validation.mjs",
    "scripts/toolcraft-delivery-catalog.d.mts",
    "scripts/toolcraft-delivery-catalog.mjs",
  ];

  for (const relativePath of catalogImplementationPaths) {
    assert.equal(
      requiredProtectedTrustRootFilePaths.includes(relativePath),
      false,
      "Catalog decomposition belongs to complete signed inventory, not the public sentinel list.",
    );
    assert.ok(
      generatedPaths.includes(relativePath),
      `Complete signed framework inventory must protect ${relativePath}.`,
    );
  }
});
