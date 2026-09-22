import { expect, test } from "@playwright/test";
import { validateToolcraftFiniteBackgroundStacking } from "./browser-background-stacking-observation";

const sourceOnly = {
  backgroundColor: "#101010", backgroundVisible: true,
  canvasMode: "finite" as const, layerOrder: ["background", "product"],
  mediaVisible: false, outputSignature: "processed-image-on-background",
  productForegroundTransparent: true,
};

test("source images need no visible media layer between Background and processed output", () => {
  expect(() => validateToolcraftFiniteBackgroundStacking(sourceOnly, "source-image")).not.toThrow();
});

test("visible runtime media must remain between Background and product", () => {
  expect(() => validateToolcraftFiniteBackgroundStacking({
    ...sourceOnly, mediaVisible: true, layerOrder: ["background", "media", "product"],
  }, "visible-image")).not.toThrow();
  for (const layerOrder of [["media", "background", "product"], ["background", "product"], ["background", "product", "media"]]) {
    expect(() => validateToolcraftFiniteBackgroundStacking({ ...sourceOnly, mediaVisible: true, layerOrder }, "visible-image")).toThrow();
  }
});

test("source-only proof rejects a phantom media layer and a product below Background", () => {
  for (const layerOrder of [["background", "media", "product"], ["product", "background"]]) {
    expect(() => validateToolcraftFiniteBackgroundStacking({ ...sourceOnly, layerOrder }, "source-image")).toThrow();
  }
});
