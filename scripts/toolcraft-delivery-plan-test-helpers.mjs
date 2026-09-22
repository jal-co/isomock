import {
  EMPTY_TOOLCRAFT_DELIVERY_LIFECYCLE_STATE,
} from "./toolcraft-delivery-lifecycle-state.mjs";
import {
  createToolcraftFunctionalProofModel,
} from "./toolcraft-functional-proof-model.mjs";
import {
  createToolcraftPerformanceRequestAuthorityHash,
} from "./toolcraft-performance-authority-policy.mjs";
import {
  createToolcraftVerificationSourceHash,
} from "./toolcraft-verification-inventory.mjs";

export const hash = (character) => character.repeat(64);
export const pathId =
  "performance-path:%5B%22interactive-discrete%22%2C%22control-change%22%2C%5B%22preview-composite%22%5D%2C%5B%5D%2C%5B%5D%2C%5B%22main%22%5D%2C%5B%5D%5D";
export const performanceTestName = `browser perf: toolcraft path ${pathId}`;
export const allProductTestFiles = [
  "src/features/output.test.tsx",
  "src/features/settings.test.tsx",
];
export const catalog = Object.freeze({
  acceptance: Object.freeze([
    Object.freeze({
      acceptanceId: "output.updates",
      contractHash: hash("b"),
      domainId: "output",
      file: "e2e/app-output.spec.ts",
      testName: "browser: output updates",
    }),
    Object.freeze({
      acceptanceId: "settings.persist",
      contractHash: hash("c"),
      domainId: "settings",
      file: "e2e/app-settings.spec.ts",
      testName: "browser: settings persist",
    }),
  ]),
  performance: Object.freeze([Object.freeze({
    passIds: Object.freeze(["preview-composite"]),
    pathId,
    testName: performanceTestName,
  })]),
  version: 2,
});

export const authoritySource = Object.freeze({
  heading: "Delivery 2 - Slow preview",
  pathIds: Object.freeze([pathId]),
  request: "The preview is still slow.",
  requestEvidence: "The preview is still slow.",
});
export const requestAuthority = Object.freeze({
  hash: createToolcraftPerformanceRequestAuthorityHash(authoritySource),
  ...authoritySource,
});

function inventory(digit) {
  const entries = Object.freeze([Object.freeze({
    path: "src/features/output.tsx",
    sha256: hash(digit),
  })]);
  return Object.freeze({
    entries,
    sourceHash: createToolcraftVerificationSourceHash(entries),
  });
}

export function planningInputs({
  initial = false,
  authority = initial ? null : requestAuthority,
  previousLifecycle = EMPTY_TOOLCRAFT_DELIVERY_LIFECYCLE_STATE,
  previousPerformance = Object.freeze({ kind: "none" }),
} = {}) {
  const currentInventory = inventory("2");
  return {
    allProductTestFiles,
    authority,
    catalog,
    currentFunctionalProofModel:
      createToolcraftFunctionalProofModel({ catalog }),
    currentInventory,
    initialProof: initial
      ? null
      : Object.freeze({
          functionalProofModelHash: hash("d"),
          sourceHash: inventory("1").sourceHash,
        }),
    integrity: {
      manifestHash: hash("a"),
      sourceHash: currentInventory.sourceHash,
    },
    packageManager: "pnpm",
    previousLifecycle,
    previousPerformance,
  };
}

export const initialSteps = Object.freeze([
  Object.freeze({ kind: "docs" }),
  Object.freeze({ kind: "code-health" }),
  Object.freeze({
    acceptanceIds: null,
    files: Object.freeze(allProductTestFiles),
    kind: "product-tests",
  }),
  Object.freeze({ kind: "build" }),
  Object.freeze({
    kind: "browser-functional",
    testNames: Object.freeze([
      "browser: output updates",
      "browser: settings persist",
    ]),
  }),
]);

export const performanceSteps = Object.freeze([
  Object.freeze({ kind: "build" }),
  Object.freeze({
    kind: "browser-performance",
    passIds: Object.freeze(["preview-composite"]),
    pathIds: Object.freeze([pathId]),
    testNames: Object.freeze([performanceTestName]),
  }),
]);
