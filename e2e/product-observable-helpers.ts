import type { Page } from "@playwright/test";

import { attachToolcraftBrowserRuntimeEvidence } from "./browser-runtime-evidence";
import {
  assertToolcraftBrowserActionForSession,
  getToolcraftBrowserActionTarget,
  getToolcraftBrowserProofPage,
  isToolcraftBrowserAction,
  isToolcraftBrowserProofSession,
  runToolcraftBrowserAction,
  type ToolcraftBrowserAction,
  type ToolcraftBrowserProofSession,
} from "./browser-proof-session";
import { expectToolcraftPersistentOutcomeAfterAction } from "./stable-outcome-helpers";
import { resolveToolcraftProductRasterProbe } from "./browser-product-raster-snapshot";

const defaultProductObservableSelector = [
  "[data-toolcraft-product-output]",
  "[data-toolcraft-product-text]",
  "[data-toolcraft-product-scene] canvas",
  "[data-toolcraft-product-scene] svg",
  "[data-toolcraft-canvas-world] canvas",
  "[data-toolcraft-canvas-world] svg",
].join(", ");
export type ToolcraftProductObservableSnapshotOptions = {
  selector?: string;
  timeoutMs?: number;
};

export type ToolcraftProductObservableChangeOptions =
  ToolcraftProductObservableSnapshotOptions & {
    baselineStabilityIntervalMs?: number;
    baselineStabilitySamples?: number;
    message?: string;
    requirementId?: string;
    stabilityIntervalMs?: number;
    stabilitySamples?: number;
  };

export async function getToolcraftProductObservableSnapshot(
  page: Page,
  options: ToolcraftProductObservableSnapshotOptions = {},
): Promise<string> {
  const selector = options.selector ?? defaultProductObservableSelector;
  const probe = await resolveToolcraftProductRasterProbe(
    page,
    { selector },
    options.timeoutMs,
  );
  return probe.capture();
}

export async function expectToolcraftProductObservableToChange(
  pageOrSession: Page | ToolcraftBrowserProofSession,
  action: (() => Promise<void>) | ToolcraftBrowserAction,
  options: ToolcraftProductObservableChangeOptions = {},
): Promise<void> {
  if (options.requirementId !== undefined && !isToolcraftBrowserProofSession(pageOrSession)) {
    throw new Error(
      "Product-observable runtime evidence requires a verified Toolcraft browser proof session; a raw Page may be used only for non-evidence helper checks.",
    );
  }
  const page = isToolcraftBrowserProofSession(pageOrSession)
    ? await getToolcraftBrowserProofPage(pageOrSession)
    : pageOrSession;
  let target: string | undefined;
  let runAction: () => Promise<void>;

  if (isToolcraftBrowserAction(action)) {
    if (isToolcraftBrowserProofSession(pageOrSession)) {
      assertToolcraftBrowserActionForSession(pageOrSession, action);
    }
    target = getToolcraftBrowserActionTarget(action);
    runAction = () => runToolcraftBrowserAction(action);
  } else {
    runAction = action;
  }

  if (options.requirementId !== undefined && target === undefined) {
    throw new Error(
      "Product-observable runtime evidence requires a target-scoped proofSession.targetAction(semanticTarget, action) or proofSession.controlAction(schemaTarget, action).",
    );
  }

  await expectToolcraftPersistentOutcomeAfterAction(
    () => getToolcraftProductObservableSnapshot(page, options),
    runAction,
    {
      baselineStabilityIntervalMs: options.baselineStabilityIntervalMs,
      baselineStabilitySamples: options.baselineStabilitySamples,
      message:
        options.message ??
        "Product output should change after the visible user interaction.",
      stabilityIntervalMs: options.stabilityIntervalMs,
      stabilitySamples: options.stabilitySamples,
      timeoutMs: options.timeoutMs ?? 5000,
    },
  );

  if (options.requirementId !== undefined) {
    await getToolcraftBrowserProofPage(
      pageOrSession as ToolcraftBrowserProofSession,
    );
    await attachToolcraftBrowserRuntimeEvidence({
      evidenceType: "product-observable-change",
      requirementId: options.requirementId,
      target,
    });
  }
}
