import { describe, expect, it } from "vitest";

import {
  defineToolcraftMotionReferenceEvidence,
} from "./acceptance/motion-reference-evidence.mjs";
import type { ToolcraftMotionReferenceEvidence } from "./acceptance/reference-study-types";

describe("Toolcraft motion reference evidence decoder", () => {
  it("exposes an exact checked TypeScript boundary without a cast", () => {
    const defineEvidence: (
      value: unknown,
    ) => ToolcraftMotionReferenceEvidence =
      defineToolcraftMotionReferenceEvidence;

    expect(() => defineEvidence({})).toThrow(/motion reference evidence/iu);
  });
});
