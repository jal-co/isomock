import { expect } from "@playwright/test";
export type ToolcraftFiniteBackgroundStackingObservation = {
  backgroundColor: string;
  backgroundVisible: boolean;
  canvasMode: "finite" | "infinite";
  layerOrder: readonly string[];
  mediaVisible: boolean;
  outputSignature: string;
  productForegroundTransparent: boolean;
};


export function validateToolcraftFiniteBackgroundStacking(
  observation: ToolcraftFiniteBackgroundStackingObservation,
  requirementId: string,
): void {
  expect(
    observation.canvasMode,
    `Background requirement "${requirementId}" must inspect finite canvas mode.`,
  ).toBe("finite");
  expect(observation.backgroundVisible).toBe(true);
  expect(typeof observation.mediaVisible).toBe("boolean");
  expect(observation.productForegroundTransparent).toBe(true);
  expect(observation.backgroundColor.trim()).not.toBe("");
  expect(observation.outputSignature.trim()).not.toBe("");

  const backgroundIndex = observation.layerOrder.indexOf("background");
  const mediaIndex = observation.layerOrder.indexOf("media");
  const productIndex = observation.layerOrder.indexOf("product");
  expect(backgroundIndex).toBeGreaterThanOrEqual(0);
  expect(productIndex).toBeGreaterThan(backgroundIndex);
  if (observation.mediaVisible) {
    expect(mediaIndex).toBeGreaterThan(backgroundIndex);
    expect(productIndex).toBeGreaterThan(mediaIndex);
  } else {
    expect(mediaIndex, "A source-only image must not appear as a visible media layer.").toBe(-1);
  }
}
