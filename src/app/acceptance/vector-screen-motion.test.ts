import { describe, expect, it } from "vitest";

import { requiresToolcraftVectorScreenMotion } from "./vector-screen-motion";

describe("spatial vector screen-motion requirement", () => {
  it.each([undefined, "default", "chromaOffset"])(
    "requires spatial variant %s",
    (variant) => {
      expect(
        requiresToolcraftVectorScreenMotion({ type: "vector", variant }),
      ).toBe(true);
      expect(
        requiresToolcraftVectorScreenMotion({
          type: "vector",
          variant,
          coordinateMode: "cartesian",
        }),
      ).toBe(true);
    },
  );

  it.each(["whiteBalance", "colorBalance", "toneBias"])(
    "keeps %s as semantic color axes",
    (variant) => {
      expect(
        requiresToolcraftVectorScreenMotion({ type: "vector", variant }),
      ).toBe(false);
    },
  );

  it("covers nested item templates without classifying ordinary controls as spatial", () => {
    expect(requiresToolcraftVectorScreenMotion({ type: "slider" })).toBe(false);
    expect(
      requiresToolcraftVectorScreenMotion({ type: "vector", xLabel: "Width" }),
    ).toBe(false);
    expect(
      requiresToolcraftVectorScreenMotion({ type: "vector", yLabel: "Height" }),
    ).toBe(false);
    expect(
      requiresToolcraftVectorScreenMotion({
        type: "sourceCollection",
        itemControl: { type: "vector" },
      }),
    ).toBe(true);
    expect(
      requiresToolcraftVectorScreenMotion({
        type: "fileDrop",
        itemControls: {
          color: { type: "color" },
          offset: { type: "vector" },
        },
      }),
    ).toBe(true);
    expect(
      requiresToolcraftVectorScreenMotion({
        type: "collectionActions",
        itemControls: {
          balance: { type: "vector", variant: "colorBalance" },
        },
      }),
    ).toBe(false);
  });
});
