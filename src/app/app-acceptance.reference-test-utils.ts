import type {
  ToolcraftComponentAcceptance,
  ToolcraftReferenceCoverage,
  ToolcraftReferenceFeatureInventoryItem,
  ToolcraftReferenceStudyEvidence,
  ToolcraftReferenceTimelineCoverage,
} from "./acceptance/types";

export const referenceStudyEvidence = {
  behaviorEvidence:
    "Ran the original app in a local browser and checked canvas sizing, controls, and renderer state changes.",
  referenceLocation: "/fixtures/legacy-badge-wall",
  reproductionSteps:
    "Installed dependencies, started the reference app, opened it in the browser, and compared behavior against the port.",
  sourceEvidence:
    "Inspected reference routes, renderer, control state, export handlers, and media lifecycle source files.",
  status: "ran-original",
} satisfies ToolcraftReferenceStudyEvidence;

export function makeReferenceFeatureInventory(
  extra: readonly ToolcraftReferenceFeatureInventoryItem[] = [],
): readonly ToolcraftReferenceFeatureInventoryItem[] {
  return [
    {
      acceptanceId: "reference.canvasSizing",
      behaviorEvidence:
        "Observed the reference output keep its authored dimensions in the browser.",
      featureName: "Canvas sizing",
      id: "canvas-sizing",
      referenceBehavior: "The reference renderer owns the output dimensions.",
      sourceEvidence: "Inspected reference renderer sizing and browser output.",
      status: "ported",
      toolcraftMapping:
        "Toolcraft editable-output canvas starts from the reference dimensions and keeps runtime sizing visible.",
    },
    {
      acceptanceId: "reference.controlMapping",
      behaviorEvidence:
        "Changed reference controls in the browser and observed renderer parameters update.",
      featureName: "Control mapping",
      id: "control-mapping",
      referenceBehavior: "Reference controls update renderer parameters directly.",
      sourceEvidence: "Inspected reference control state and parameter wiring.",
      status: "ported",
      toolcraftMapping:
        "Toolcraft schema controls write runtime values consumed by the renderer.",
    },
    {
      acceptanceId: "reference.rendererState",
      behaviorEvidence:
        "Observed reference renderer state persist across multiple animation frames.",
      featureName: "Renderer state",
      id: "renderer-state",
      referenceBehavior: "Reference renderer mutable state persists across frames.",
      sourceEvidence: "Inspected reference renderer lifecycle and frame updates.",
      status: "ported",
      toolcraftMapping:
        "Toolcraft renderer keeps equivalent mutable state and invalidation lifecycle.",
    },
    ...extra,
  ];
}

export function makeReferenceCoverageAcceptance(
  id: string,
  referenceCoverage: ToolcraftReferenceCoverage,
): ToolcraftComponentAcceptance {
  return {
    automated: true,
    automatedTestName: `${id} preserves reference behavior`,
    browser: {
      budget: "standard",
      file: "e2e/app-controls.spec.ts",
      testName: `browser: ${id} preserves reference behavior`,
    },
    componentType: "custom-renderer",
    evidence: "product-output",
    expectedObservable: `${id} preserves the reference behavior in Toolcraft output.`,
    fixture: `${id} fixture`,
    id,
    kind: "runtime",
    referenceCoverage,
    userAction: `Exercise ${id}.`,
  };
}

export function makeReferenceTimelineCoverageAcceptance(
  id: string,
  referenceTimelineCoverage: ToolcraftReferenceTimelineCoverage,
): ToolcraftComponentAcceptance {
  return {
    automated: true,
    automatedTestName: `${id} preserves reference timeline behavior`,
    browser: {
      budget: "standard",
      file: "e2e/app-controls.spec.ts",
      testName: `browser: ${id} preserves reference timeline behavior`,
    },
    componentType: "custom-timeline",
    evidence: "timeline-output",
    expectedObservable: `${id} preserves the reference timeline behavior.`,
    fixture: `${id} fixture`,
    id,
    kind: "runtime",
    referenceTimelineCoverage,
    userAction: `Exercise ${id}.`,
  };
}
