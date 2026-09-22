import type { Locator } from "@playwright/test";

export const physicalFeedbackCanvasSelector =
  'canvas[data-toolcraft-vgpu-product=""]';

const canonicalRuntimeGenerationPattern = /^(?:0|[1-9]\d*)$/u;

export function parsePhysicalFeedbackGenerationAttribute(
  raw: string | null,
  attributeName: string,
): number {
  if (raw === null || !canonicalRuntimeGenerationPattern.test(raw)) {
    throw new Error(
      `${attributeName} must contain a canonical non-negative safe integer generation.`,
    );
  }
  const generation = Number(raw);
  if (!Number.isSafeInteger(generation)) {
    throw new Error(
      `${attributeName} must contain a canonical non-negative safe integer generation.`,
    );
  }
  return generation;
}

export async function readPhysicalFeedbackGenerationAttributes(
  canvas: Locator,
  attributeNames: readonly string[],
): Promise<readonly number[]> {
  const rawValues = await canvas.evaluate(
    (element, names) => names.map((name) => element.getAttribute(name)),
    attributeNames,
  );
  return Object.freeze(
    attributeNames.map((attributeName, index) =>
      parsePhysicalFeedbackGenerationAttribute(
        rawValues[index] ?? null,
        attributeName,
      ),
    ),
  );
}
