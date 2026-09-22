import { describe, expect, it } from "vitest";

import {
  getControlAcceptanceByTarget,
  getControlAcceptanceTarget,
} from "./control-acceptance-context";
import type { ToolcraftComponentAcceptance } from "./types";

function acceptance(
  overrides: Partial<ToolcraftComponentAcceptance>,
): ToolcraftComponentAcceptance {
  return {
    automated: true,
    automatedTestName: "ownership unit",
    browser: false,
    componentType: "control",
    evidence: "product-output",
    expectedObservable: "The owned value changes output.",
    fixture: "ownership fixture",
    id: "control",
    kind: "control",
    target: "shape.kind",
    userAction: "Change the owned value.",
    ...overrides,
  };
}

describe("Toolcraft control acceptance target ownership", () => {
  it("resolves schema controls and orientation gizmo canvas handles only", () => {
    const control = acceptance({ id: "shape.kind" });
    const orientation = acceptance({
      canvasHandle: {
        outputObservable: "The model follows the orbit pose.",
        testId: "orientation-gizmo",
        writesTarget: "view.orbit",
      },
      componentType: "orientationGizmo",
      id: "model.orientation",
      kind: "canvas-handle",
      target: undefined,
    });
    const runtime = acceptance({
      componentType: "runtime",
      id: "runtime.export",
      kind: "runtime",
      target: "output.export",
    });

    expect(getControlAcceptanceTarget(control)).toBe("shape.kind");
    expect(getControlAcceptanceTarget(orientation)).toBe("view.orbit");
    expect(getControlAcceptanceTarget(runtime)).toBeNull();
    expect(
      [...getControlAcceptanceByTarget([control, orientation, runtime]).keys()],
    ).toEqual(["shape.kind", "view.orbit"]);
  });
});
