import { expect, type Page } from "@playwright/test";
import {
  physicalFeedbackCanvasSelector,
  readPhysicalFeedbackGenerationAttributes,
} from "./vgpu-runtime-attributes";

export type PhysicalFeedbackSettlementGenerations = Readonly<{
  operationSettled: number;
  operationStarted: number;
  retirementSettled: number;
  retirementStarted: number;
}>;

type PreparationExpectation = Readonly<{
  before: PhysicalFeedbackSettlementGenerations;
  operationTransition: boolean;
  retirementTransition: boolean;
  status?: "disabled" | "ready";
}>;

const pendingPreparations = new WeakMap<Page, PreparationExpectation>();

export async function readPhysicalFeedbackSettlementGenerations(
  page: Page,
): Promise<PhysicalFeedbackSettlementGenerations> {
  const canvas = page.locator(physicalFeedbackCanvasSelector);
  const [
    operationSettled,
    operationStarted,
    retirementSettled,
    retirementStarted,
  ] = await readPhysicalFeedbackGenerationAttributes(canvas, [
    "data-vgpu-operation-settled",
    "data-vgpu-operation-started",
    "data-vgpu-retirement-settled",
    "data-vgpu-retirement-started",
  ]);
  return Object.freeze({
    operationSettled,
    operationStarted,
    retirementSettled,
    retirementStarted,
  });
}

export function stagePhysicalFeedbackPreparation(
  page: Page,
  expectation: PreparationExpectation,
): void {
  pendingPreparations.set(page, Object.freeze(expectation));
}

export async function waitForPhysicalFeedbackSettlement(
  page: Page,
  expectation: PreparationExpectation,
): Promise<void> {
  const canvas = page.locator(physicalFeedbackCanvasSelector);
  await expect
    .poll(
      async () => {
        const current = await readPhysicalFeedbackSettlementGenerations(page);
        return {
          operationSettled:
            current.operationStarted === current.operationSettled,
          operationTransition:
            !expectation.operationTransition ||
            current.operationStarted > expectation.before.operationStarted,
          retirementSettled:
            current.retirementStarted === current.retirementSettled,
          retirementTransition:
            !expectation.retirementTransition ||
            current.retirementStarted > expectation.before.retirementStarted,
          status:
            expectation.status === undefined ||
            (await canvas.getAttribute("data-toolcraft-gpu-status")) ===
              expectation.status,
        };
      },
      { timeout: 15_000 },
    )
    .toEqual({
      operationSettled: true,
      operationTransition: true,
      retirementSettled: true,
      retirementTransition: true,
      status: true,
    });
}

export async function settlePhysicalFeedbackPreparedPhase(
  page: Page,
): Promise<void> {
  const expectation = pendingPreparations.get(page);
  if (!expectation) {
    throw new Error("Physical feedback phase settlement has no prepared baseline.");
  }
  pendingPreparations.delete(page);
  await waitForPhysicalFeedbackSettlement(page, expectation);
}
