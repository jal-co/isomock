import type { ToolcraftComponentAcceptance } from "./acceptance/types";

export function makeControlAcceptance(
  target: string,
  componentType: string,
): ToolcraftComponentAcceptance {
  return {
    automated: true,
    automatedTestName: `${target} changes product output`,
    browser: {
      budget: "standard",
      file: "e2e/app-controls.spec.ts",
      testName: `browser: ${target} changes product output`,
    },
    componentType,
    evidence: "product-output",
    expectedObservable: `${target} changes the rendered product output.`,
    fixture: `${target} fixture`,
    id: target,
    kind: "control",
    target,
    userAction: `Change ${target}.`,
  };
}
