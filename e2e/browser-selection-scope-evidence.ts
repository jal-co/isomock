import { expect } from "@playwright/test";

import { attachToolcraftBrowserRuntimeEvidence } from "./browser-runtime-evidence";
import {
  resolveToolcraftProductRasterProbe,
  type ToolcraftProductRasterProbe,
  type ToolcraftResolvedProductRasterProbe,
} from "./browser-product-raster-snapshot";
import {
  assertToolcraftBrowserActionForSession,
  assertToolcraftBrowserProofSession,
  getToolcraftBrowserActionSurface,
  getToolcraftBrowserActionTarget,
  getToolcraftBrowserProofPage,
  readToolcraftBrowserObservation,
  runToolcraftBrowserAction,
  type ToolcraftBrowserAction,
  type ToolcraftBrowserActionSurface,
  type ToolcraftBrowserObservation,
  type ToolcraftBrowserProofSession,
} from "./browser-proof-session";
import {
  expectToolcraftPersistentOutcomeChange,
  expectToolcraftStableOutcomeBaseline,
} from "./stable-outcome-helpers";

export type ToolcraftSelectionEntityProbe =
  ToolcraftProductRasterProbe & Readonly<{ entityId: string }>;

export type ToolcraftSelectionScopedControlOptions = Readonly<{
  editEntityA: ToolcraftBrowserAction;
  editEntityB: ToolcraftBrowserAction;
  entityA: ToolcraftSelectionEntityProbe;
  entityB: ToolcraftSelectionEntityProbe;
  observePropertyValue: ToolcraftBrowserObservation<unknown>;
  observeSelectedEntityId: ToolcraftBrowserObservation<string>;
  propertySurface: ToolcraftBrowserActionSurface;
  propertyTarget: string;
  proofSession: ToolcraftBrowserProofSession;
  requirementId: string;
  selectionSurface: ToolcraftBrowserActionSurface;
  selectionTarget: string;
  selectEntityA: ToolcraftBrowserAction;
  selectEntityB: ToolcraftBrowserAction;
  stabilityIntervalMs?: number;
  stabilitySamples?: number;
  timeoutMs?: number;
}>;

type SelectionSnapshot = Readonly<{
  controlValue: unknown;
  entityA: string;
  entityB: string;
  selectedEntityId: string;
}>;

function regionsOverlap(
  first: ToolcraftResolvedProductRasterProbe["bounds"],
  second: ToolcraftResolvedProductRasterProbe["bounds"],
): boolean {
  return (
    first.x < second.x + second.width &&
    first.x + first.width > second.x &&
    first.y < second.y + second.height &&
    first.y + first.height > second.y
  );
}

function requireActionTarget(
  action: ToolcraftBrowserAction,
  expectedTarget: string,
  label: string,
): void {
  expect(
    getToolcraftBrowserActionTarget(action),
    `${label} must use the exact protected semantic target.`,
  ).toBe(expectedTarget);
}

async function requireProductSceneProbe(
  probe: ToolcraftResolvedProductRasterProbe,
  entityId: string,
): Promise<void> {
  const provenance = await probe.locator.evaluate((element) => ({
    insideProductScene: Boolean(
      element.closest(
        "[data-toolcraft-product-scene], [data-toolcraft-canvas-content], [data-toolcraft-product-output]",
      ),
    ),
    isEditorHandle: Boolean(element.closest("[data-toolcraft-canvas-handle]")),
  }));
  expect(
    provenance.insideProductScene,
    `Selection entity "${entityId}" must probe product-scene pixels, not selection chrome.`,
  ).toBe(true);
  expect(
    provenance.isEditorHandle,
    `Selection entity "${entityId}" must not probe a canvas handle or gizmo.`,
  ).toBe(false);
}

async function waitForSelectedEntity(
  observation: ToolcraftBrowserObservation<string>,
  entityId: string,
  timeoutMs: number,
): Promise<void> {
  await expect
    .poll(() => readToolcraftBrowserObservation(observation), {
      message: `Selection must rebind the property control to "${entityId}".`,
      timeout: timeoutMs,
    })
    .toBe(entityId);
}

export async function expectToolcraftSelectionScopedControl(
  options: ToolcraftSelectionScopedControlOptions,
): Promise<void> {
  const {
    editEntityA,
    editEntityB,
    entityA,
    entityB,
    observePropertyValue,
    observeSelectedEntityId,
    proofSession,
    selectEntityA,
    selectEntityB,
  } = options;
  const timeoutMs = options.timeoutMs ?? 5_000;
  const stability = {
    message: `Selection-scoped control "${options.requirementId}" must remain deterministic.`,
    stabilityIntervalMs: options.stabilityIntervalMs ?? 50,
    stabilitySamples: options.stabilitySamples ?? 3,
    timeoutMs,
  };

  expect(entityA.entityId.trim()).not.toBe("");
  expect(entityB.entityId.trim()).not.toBe("");
  expect(entityA.entityId).not.toBe(entityB.entityId);
  expect(options.propertyTarget.trim()).not.toBe("");
  expect(options.selectionTarget.trim()).not.toBe("");

  assertToolcraftBrowserProofSession(
    observeSelectedEntityId,
    selectEntityA,
    selectEntityB,
    editEntityA,
    editEntityB,
  );
  assertToolcraftBrowserProofSession(
    observePropertyValue,
    selectEntityA,
    selectEntityB,
    editEntityA,
    editEntityB,
  );
  for (const action of [
    selectEntityA,
    selectEntityB,
    editEntityA,
    editEntityB,
  ]) {
    assertToolcraftBrowserActionForSession(proofSession, action);
  }

  requireActionTarget(
    selectEntityA,
    options.selectionTarget,
    "Entity A selection",
  );
  requireActionTarget(
    selectEntityB,
    options.selectionTarget,
    "Entity B selection",
  );
  requireActionTarget(editEntityA, options.propertyTarget, "Entity A edit");
  requireActionTarget(editEntityB, options.propertyTarget, "Entity B edit");
  expect(getToolcraftBrowserActionSurface(selectEntityA)).toBe(
    options.selectionSurface,
  );
  expect(getToolcraftBrowserActionSurface(selectEntityB)).toBe(
    options.selectionSurface,
  );
  expect(getToolcraftBrowserActionSurface(editEntityA)).toBe(
    options.propertySurface,
  );
  expect(getToolcraftBrowserActionSurface(editEntityB)).toBe(
    options.propertySurface,
  );

  const page = await getToolcraftBrowserProofPage(proofSession);
  const [probeA, probeB] = await Promise.all([
    resolveToolcraftProductRasterProbe(page, entityA, timeoutMs),
    resolveToolcraftProductRasterProbe(page, entityB, timeoutMs),
  ]);
  await Promise.all([
    requireProductSceneProbe(probeA, entityA.entityId),
    requireProductSceneProbe(probeB, entityB.entityId),
  ]);
  expect(
    regionsOverlap(probeA.bounds, probeB.bounds),
    "Selection entity probes must have disjoint positive-area bounds.",
  ).toBe(false);

  const capture = async (): Promise<SelectionSnapshot> => ({
    controlValue: await readToolcraftBrowserObservation(observePropertyValue),
    entityA: await probeA.capture(),
    entityB: await probeB.capture(),
    selectedEntityId: await readToolcraftBrowserObservation(
      observeSelectedEntityId,
    ),
  });
  const captureStable = async (): Promise<SelectionSnapshot> => {
    const snapshot = await capture();
    return expectToolcraftStableOutcomeBaseline(capture, snapshot, stability);
  };

  await runToolcraftBrowserAction(selectEntityB);
  await waitForSelectedEntity(observeSelectedEntityId, entityB.entityId, timeoutMs);
  const baselineB = await captureStable();

  await runToolcraftBrowserAction(selectEntityA);
  await waitForSelectedEntity(observeSelectedEntityId, entityA.entityId, timeoutMs);
  const beforeA = await captureStable();
  expect(beforeA.controlValue).not.toEqual(baselineB.controlValue);
  expect(beforeA.entityA).toEqual(baselineB.entityA);
  expect(beforeA.entityB).toEqual(baselineB.entityB);

  await runToolcraftBrowserAction(editEntityA);
  const afterA = await expectToolcraftPersistentOutcomeChange(
    capture,
    beforeA,
    stability,
  );
  expect(afterA.selectedEntityId).toBe(entityA.entityId);
  expect(afterA.controlValue).not.toEqual(beforeA.controlValue);
  expect(afterA.entityA).not.toEqual(beforeA.entityA);
  expect(afterA.entityB).toEqual(beforeA.entityB);

  const beforeSelectB = await captureStable();
  await runToolcraftBrowserAction(selectEntityB);
  await waitForSelectedEntity(observeSelectedEntityId, entityB.entityId, timeoutMs);
  const beforeB = await captureStable();
  expect(beforeB.entityA).toEqual(beforeSelectB.entityA);
  expect(beforeB.entityB).toEqual(beforeSelectB.entityB);
  expect(beforeB.controlValue).toEqual(baselineB.controlValue);

  await runToolcraftBrowserAction(editEntityB);
  const afterB = await expectToolcraftPersistentOutcomeChange(
    capture,
    beforeB,
    stability,
  );
  expect(afterB.selectedEntityId).toBe(entityB.entityId);
  expect(afterB.controlValue).not.toEqual(beforeB.controlValue);
  expect(afterB.entityB).not.toEqual(beforeB.entityB);
  expect(afterB.entityA).toEqual(beforeB.entityA);

  await attachToolcraftBrowserRuntimeEvidence({
    evidenceType: "product-observable-change",
    requirementId: options.requirementId,
    target: options.propertyTarget,
  });
  await attachToolcraftBrowserRuntimeEvidence({
    evidenceType: "selection-scoped-control",
    requirementId: options.requirementId,
    target: options.propertyTarget,
  });
}
