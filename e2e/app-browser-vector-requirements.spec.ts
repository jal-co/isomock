import { expect, test } from "@playwright/test";
import { defineToolcraft } from "@/toolcraft/runtime";

import { deriveToolcraftBrowserRuntimeRequirements } from "./browser-runtime-evidence-requirements";
import {
  evaluateToolcraftBrowserRuntimeEvidence,
  serializeToolcraftBrowserRuntimeEvidence,
  TOOLCRAFT_BROWSER_RUNTIME_EVIDENCE_ATTACHMENT_NAME,
  TOOLCRAFT_BROWSER_RUNTIME_EVIDENCE_CONTENT_TYPE,
} from "../src/app/test-evidence/browser-runtime-contract";

test("spatial pad direction is mandatory even without authored part coverage", () => {
  const schema = defineToolcraft({
    base: {
      identity: {
        id: "app-browser-vector-requirements-spec-ts",
        title: "Browser contract fixture",
      },
      canvas: { enabled: true },
      panels: {
        controls: {
          title: "Controls",
          sections: [
            {
              id: "shape",
              title: "Shape",
              controls: {
                offset: {
                  applicability: { mode: "always" as const },
                  type: "vector",
                  target: "shape.offset",
                  defaultValue: { x: 0, y: 0 },
                },
              },
            },
          ],
        },
      },
    },
    modules: [],
  });
  const requirements = deriveToolcraftBrowserRuntimeRequirements(
    [
      {
        id: "shape.offset",
        target: "shape.offset",
        evidence: "product-output",
        browser: {
          file: "e2e/app-controls.spec.ts",
          testName: "offset moves",
          budget: "standard",
        },
      },
    ],
    schema,
  );
  expect(requirements).toContainEqual({
    evidenceType: "vector-screen-motion",
    requirementId: "shape.offset",
    target: "shape.offset",
    testName: "offset moves",
  });
  const errors = evaluateToolcraftBrowserRuntimeEvidence({
    requirements,
    tests: [
      {
        title: "offset moves",
        expectedStatus: "passed",
        results: [
          {
            status: "passed",
            retry: 0,
            attachments: [
              {
                name: TOOLCRAFT_BROWSER_RUNTIME_EVIDENCE_ATTACHMENT_NAME,
                contentType: TOOLCRAFT_BROWSER_RUNTIME_EVIDENCE_CONTENT_TYPE,
                body: serializeToolcraftBrowserRuntimeEvidence({
                  evidenceType: "product-observable-change",
                  requirementId: "shape.offset",
                  target: "shape.offset",
                }),
              },
            ],
          },
        ],
      },
    ],
  });
  expect(errors).toHaveLength(1);
  expect(errors[0]).toContain("vector-screen-motion");
});

test("nested spatial fields derive direction proof, color axes do not", () => {
  const schema = defineToolcraft({
    base: {
      identity: {
        id: "app-browser-vector-requirements-spec-ts",
        title: "Browser contract fixture",
      },
      canvas: { enabled: true },
      panels: {
        controls: {
          title: "Controls",
          sections: [
            {
              id: "points",
              title: "Points",
              controls: {
                points: {
                  applicability: { mode: "always" as const },
                  type: "collectionActions",
                  target: "points",
                  itemControl: { type: "vector" },
                  defaultValue: [{ x: 0, y: 0 }],
                },
                balance: {
                  applicability: { mode: "always" as const },
                  type: "vector",
                  variant: "whiteBalance",
                  target: "balance",
                },
              },
            },
          ],
        },
      },
    },
    modules: [],
  });
  const requirements = deriveToolcraftBrowserRuntimeRequirements(
    ["points", "balance"].map((target) => ({
      id: target,
      target,
      evidence: "product-output",
      browser: {
        file: "e2e/app-controls.spec.ts",
        testName: target,
        budget: "standard",
      },
    })),
    schema,
  );
  expect(
    requirements
      .filter(({ evidenceType }) => evidenceType === "vector-screen-motion")
      .map(({ target }) => target),
  ).toEqual(["points"]);
});

test("conditional spatial pads require direction only in their visible branch", () => {
  const schema = defineToolcraft({
    base: {
      identity: {
        id: "app-browser-vector-requirements-spec-ts",
        title: "Browser contract fixture",
      },
      canvas: { enabled: true },
      panels: {
        controls: {
          title: "Controls",
          sections: [
            {
              id: "shape",
              title: "Shape",
              controls: {
                mode: {
                  applicability: { mode: "always" as const },
                  type: "select",
                  target: "shape.mode",
                  defaultValue: "fixed",
                  options: [
                    { label: "Fixed", value: "fixed" },
                    { label: "Movable", value: "movable" },
                  ],
                },
                offset: {
                  type: "vector",
                  target: "shape.offset",
                  defaultValue: { x: 0, y: 0 },
                  applicability: {
                    mode: "conditional",
                    all: [{ target: "shape.mode", equals: "movable" }],
                  },
                },
              },
            },
          ],
        },
      },
    },
    modules: [],
  });
  const requirements = deriveToolcraftBrowserRuntimeRequirements(
    [
      {
        id: "shape.offset",
        target: "shape.offset",
        kind: "control",
        evidence: "product-output",
        browser: {
          file: "e2e/app-controls.spec.ts",
          testName: "conditional offset",
          budget: "standard",
        },
      },
    ],
    schema,
    [
      {
        id: "shape",
        title: "Shape",
        entity: "Shape",
        entityId: "shape",
        groupingReason: "Position behavior of the same shape.",
        targets: ["shape.mode", "shape.offset"],
        finiteSelectors: [
          {
            role: "branch",
            target: "shape.mode",
            affectedTargets: [],
            reason: "Chooses whether position is editable.",
          },
        ],
      },
    ],
  );
  const directional = requirements.filter(
    ({ evidenceType }) => evidenceType === "vector-screen-motion",
  );
  expect(directional).toHaveLength(1);
  expect(directional[0]!.requirementId).toContain("movable");
  expect(
    requirements.filter(
      ({ evidenceType }) => evidenceType === "control-applicability-hidden",
    ),
  ).toHaveLength(1);
});
