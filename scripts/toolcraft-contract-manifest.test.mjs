import assert from "node:assert/strict";
import test from "node:test";

import {
  getToolcraftContractFragmentFailures,
  renderToolcraftContractFragment,
  toolcraftContractManifest,
} from "./toolcraft-contract-manifest.mjs";

test("contract manifest exposes the protected performance lifecycle", () => {
  assert.deepEqual(toolcraftContractManifest.performanceVerification, {
    evidenceLevels: [
      "targeted-performance",
      "full-performance",
    ],
    modes: {
      functionalInitial: {
        baseline: "preserve",
        functionalAcceptance: "full",
        performance: "none",
      },
      functionalTargeted: {
        baseline: "preserve",
        functionalAcceptance: "exact-ownership-derived",
        performance: "none",
      },
      performanceIteration: {
        baseline: "not-required",
        intent: "performance-iteration",
        performance: "exact-targeted-checks",
      },
      fullCertification: {
        automaticLaunch: "forbidden",
        authority: "explicit-user-consent-via-operator-command",
        performance: "complete-current-matrix",
        recommendation:
          "two-compatible-iterations-or-agent-judged-broad-unlocalizable-problem",
        userCommandKnowledge: "not-required",
      },
    },
    requestClassification: [
      "high-confidence-performance-iteration",
      "high-confidence-ordinary-product-work",
      "needs-agent-judgment",
    ],
  });
});

test("generated contract fragments accept the canonical manifest rendering", () => {
  const source = [
    "# Contract",
    renderToolcraftContractFragment("decision-rule-table"),
  ].join("\n\n");

  assert.deepEqual(
    getToolcraftContractFragmentFailures({
      fragmentIds: ["decision-rule-table"],
      label: "contract.md",
      source,
    }),
    [],
  );
});

test("generated contract fragments use Markdown and MDX compatible markers", () => {
  const fragment = renderToolcraftContractFragment("decision-rule-table");

  assert.match(
    fragment,
    /^\[\/\/\]: # \(toolcraft-contract:decision-rule-table:start\)$/m,
  );
  assert.doesNotMatch(fragment, /<!--/);
});

test("contradictory structured contract fragments fail exact sync", () => {
  const source = renderToolcraftContractFragment("decision-rule-table").replace(
    "| `runtime-shell-required` | invariant | runtime-shell |",
    "| `runtime-shell-required` | heuristic | runtime-shell |",
  );

  assert.deepEqual(
    getToolcraftContractFragmentFailures({
      fragmentIds: ["decision-rule-table"],
      label: "contract.md",
      source,
    }),
    [
      'contract.md contract fragment "decision-rule-table" differs from toolcraft-contract-manifest.json',
    ],
  );
});

test("missing or duplicated generated fragments cannot pass sync", () => {
  const fragment = renderToolcraftContractFragment("built-in-control-table");

  assert.deepEqual(
    getToolcraftContractFragmentFailures({
      fragmentIds: ["built-in-control-table"],
      label: "schema.md",
      source: "# Schema",
    }),
    ['schema.md is missing generated contract fragment "built-in-control-table"'],
  );
  assert.deepEqual(
    getToolcraftContractFragmentFailures({
      fragmentIds: ["built-in-control-table"],
      label: "schema.md",
      source: `${fragment}\n${fragment}`,
    }),
    ['schema.md contains duplicate contract fragment "built-in-control-table"'],
  );
});
