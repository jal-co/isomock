import { describe, expect, it } from "vitest";

import {
  createIsomockCamera,
  getIsomockFrameCenterFocus,
  projectIsomockRay,
} from "./camera";
import { isomockDefaults } from "./settings";

describe("getIsomockFrameCenterFocus", () => {
  it("puts the focus depth on the plane point under the frame center", () => {
    const settings = { ...isomockDefaults, offset: { x: 0.2, y: -0.15 } };
    const camera = createIsomockCamera(settings, 16 / 9, 16 / 9);
    const focusPoint = getIsomockFrameCenterFocus(camera);
    const refocused = createIsomockCamera(
      { ...settings, focusPoint },
      16 / 9,
      16 / 9,
    );
    expect(Math.abs(focusPoint.x)).toBeLessThan(1);
    expect(Math.abs(focusPoint.y)).toBeLessThan(1);
    expect(refocused.focusDepth).toBeCloseTo(
      projectIsomockRay(camera, 0, 0)!.depth,
      6,
    );
  });
});
