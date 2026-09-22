import { isDeepStrictEqual } from "node:util";

import {
  createToolcraftDeliveryPlanLifecycle,
} from "./toolcraft-delivery-lifecycle-state.mjs";
import {
  createToolcraftFunctionalProofModelHash,
} from "./toolcraft-functional-proof-model.mjs";

const compare = (left, right) => left < right ? -1 : left > right ? 1 : 0;

function initialSteps(inputs) {
  return [
    { kind: "docs" },
    { kind: "code-health" },
    {
      acceptanceIds: null,
      files: inputs.allProductTestFiles,
      kind: "product-tests",
    },
    { kind: "build" },
    {
      kind: "browser-functional",
      testNames: [
        ...new Set(inputs.catalog.acceptance.map((row) => row.testName)),
      ].sort(compare),
    },
  ];
}

function authorityPerformanceSelection(inputs) {
  const rows = inputs.catalog.performance.filter(({ pathId }) =>
    inputs.authority.pathIds.includes(pathId),
  );
  return {
    passIds: [...new Set(rows.flatMap(({ passIds }) => passIds))]
      .sort(compare),
    pathIds: rows.map(({ pathId }) => pathId).sort(compare),
    testNames: rows.map(({ testName }) => testName).sort(compare),
  };
}

function performanceComparison(inputs, selection) {
  const previous = inputs.previousPerformance;
  if (
    previous.kind === "none" ||
    previous.report.sourceHash !== inputs.currentInventory.sourceHash ||
    previous.report.fixtureResolutionMode !== "strict-development" ||
    !isDeepStrictEqual(previous.report.performancePathIds, selection.pathIds) ||
    !isDeepStrictEqual(previous.report.performancePassIds, selection.passIds) ||
    !isDeepStrictEqual(previous.report.testNames, selection.testNames)
  ) {
    return { kind: "none" };
  }
  return {
    comparisonHash: previous.comparisonHash,
    kind: "compatible-targeted-report",
    report: previous.report,
  };
}

function performancePlan(inputs, common) {
  const selected = authorityPerformanceSelection(inputs);
  const comparison = performanceComparison(inputs, selected);
  return {
    ...common,
    basis: {
      initialFunctionalProofModelHash:
        inputs.initialProof.functionalProofModelHash,
      initialSourceHash: inputs.initialProof.sourceHash,
      kind: "performance-request",
    },
    kind: "performance-iteration",
    lifecycle: createToolcraftDeliveryPlanLifecycle({
      kind: "performance-iteration",
      performanceComparison: comparison,
      previous: inputs.previousLifecycle,
      requestAuthorityHash: inputs.authority.hash,
    }),
    performanceComparison: comparison,
    requestAuthorityHash: inputs.authority.hash,
    steps: [
      { kind: "build" },
      {
        kind: "browser-performance",
        passIds: selected.passIds,
        pathIds: selected.pathIds,
        testNames: selected.testNames,
      },
    ],
  };
}

export function constructToolcraftDeliveryPlan(inputs) {
  const common = {
    functionalProofModelHash: createToolcraftFunctionalProofModelHash(
      inputs.currentFunctionalProofModel,
    ),
    manifestHash: inputs.integrity.manifestHash,
    sourceHash: inputs.currentInventory.sourceHash,
  };
  if (inputs.initialProof === null) {
    return {
      ...common,
      basis: { kind: "initial" },
      kind: "functional",
      lifecycle: createToolcraftDeliveryPlanLifecycle({
        kind: "functional",
        previous: inputs.previousLifecycle,
      }),
      steps: initialSteps(inputs),
    };
  }
  return performancePlan(inputs, common);
}
