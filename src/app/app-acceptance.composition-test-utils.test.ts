import { describe, expect, it } from "vitest";

import { compositionHasProductCanvasSurface } from "./app-acceptance.composition-test-utils";

describe("Toolcraft product canvas composition detection", () => {
  it("recognizes every resolved product canvas extension point", () => {
    expect(
      compositionHasProductCanvasSurface({
        canvasContent: "Bounded output",
        renderDefaultCanvasMedia: true,
      }),
    ).toBe(true);
    expect(
      compositionHasProductCanvasSurface({
        infiniteCanvasContent: "Viewport output",
        renderDefaultCanvasMedia: true,
      }),
    ).toBe(true);
    expect(
      compositionHasProductCanvasSurface({ renderDefaultCanvasMedia: false }),
    ).toBe(true);
  });

  it("ignores unrelated properties in a neutral composition", () => {
    const unrelated = {
      metadata: { infiniteCanvasContent: "Documentation" },
      renderDefaultCanvasMedia: true,
    };

    expect(compositionHasProductCanvasSurface(unrelated)).toBe(false);
  });
});
