import { expect } from "@playwright/test";

import { attachToolcraftBrowserRuntimeEvidence } from "./browser-runtime-evidence";
import {
  assertToolcraftBrowserProofSession,
  getToolcraftBrowserActionTarget,
  readToolcraftBrowserObservation,
  runToolcraftBrowserAction,
  runToolcraftBrowserValueAction,
  type ToolcraftBrowserAction,
  type ToolcraftBrowserObservation,
  type ToolcraftBrowserProofSession,
} from "./browser-proof-session";
import {
  assertToolcraftProducedArtifact,
  validateToolcraftExportArtifactInspection,
  type ToolcraftExportArtifactInspection,
} from "./export-artifact-helpers";

declare const toolcraftUnavailableImageResourceFixtureBrand: unique symbol;

export type ToolcraftUnavailableImageResourceObservation = Readonly<{
  assetId?: string;
  fileName?: string;
  lifecycle?: "ready" | "unavailable";
  message?: string;
  requestId?: string;
  resolverAvailable?: boolean;
  status: "active" | "cleaned" | "error" | "missing";
}>;

export type ToolcraftUnavailableImageResourceFixture = Readonly<{
  readonly [toolcraftUnavailableImageResourceFixtureBrand]: true;
}>;

type ToolcraftUnavailableImageResourceFixtureRecord = Readonly<{
  activate: ToolcraftBrowserAction;
  cleanup: ToolcraftBrowserAction;
  fileName: string;
  observe: ToolcraftBrowserObservation<string | null>;
  requestId: string;
  target: string;
}>;

const unavailableImageResourceFixtureRecords = new WeakMap<
  object,
  ToolcraftUnavailableImageResourceFixtureRecord
>();
const malformedUnavailableImageResourceObservation = Object.freeze({
  message: "Unavailable-resource proof published malformed state.",
  status: "error" as const,
});
let unavailableImageResourceFixtureSequence = 0;

function requireUnavailableImageResourceFixture(
  fixture: ToolcraftUnavailableImageResourceFixture,
): ToolcraftUnavailableImageResourceFixtureRecord {
  const record =
    typeof fixture === "object" && fixture !== null
      ? unavailableImageResourceFixtureRecords.get(fixture)
      : undefined;
  if (!record) {
    throw new Error(
      "Unavailable-image export evidence requires the protected Toolcraft unavailable-resource fixture facade.",
    );
  }
  return record;
}

function parseUnavailableImageResourceObservation(
  raw: string | null,
): ToolcraftUnavailableImageResourceObservation {
  if (!raw) return { status: "missing" };
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return malformedUnavailableImageResourceObservation;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return malformedUnavailableImageResourceObservation;
  }
  const observation = value as Record<string, unknown>;
  const optionalStringsAreValid = [
    "assetId",
    "fileName",
    "message",
    "requestId",
  ].every(
    (field) =>
      observation[field] === undefined ||
      typeof observation[field] === "string",
  );
  const valid =
    typeof observation.status === "string" &&
    ["active", "cleaned", "error", "missing"].includes(observation.status) &&
    optionalStringsAreValid &&
    (
      observation.resolverAvailable === undefined ||
      typeof observation.resolverAvailable === "boolean"
    ) &&
    (
      observation.lifecycle === undefined ||
      observation.lifecycle === "ready" ||
      observation.lifecycle === "unavailable"
    );
  return valid
    ? observation as ToolcraftUnavailableImageResourceObservation
    : malformedUnavailableImageResourceObservation;
}

async function readUnavailableImageResourceObservation(
  observation: ToolcraftBrowserObservation<string | null>,
): Promise<ToolcraftUnavailableImageResourceObservation> {
  const raw = await readToolcraftBrowserObservation(observation);
  return parseUnavailableImageResourceObservation(raw);
}

function validateUnavailableImageResourceObservation(
  observation: ToolcraftUnavailableImageResourceObservation,
  expected: Readonly<{
    fileName: string;
    requestId: string;
    status: "active" | "cleaned";
  }>,
): void {
  if (observation.status === "error") {
    throw new Error(
      observation.message ??
        "The Toolcraft unavailable-resource proof fixture failed.",
    );
  }
  expect(
    observation,
    `Unavailable-resource proof "${expected.requestId}" must publish its exact typed state.`,
  ).toMatchObject(
    expected.status === "active"
      ? {
          fileName: expected.fileName,
          lifecycle: "unavailable",
          requestId: expected.requestId,
          resolverAvailable: false,
          status: "active",
        }
      : {
          fileName: expected.fileName,
          lifecycle: "ready",
          requestId: expected.requestId,
          resolverAvailable: true,
          status: "cleaned",
        },
  );
  expect(
    observation.assetId?.trim(),
    "Unavailable-resource proof must identify the exact affected runtime asset.",
  ).toBeTruthy();
}

export function createToolcraftUnavailableImageResourceFixture(
  session: ToolcraftBrowserProofSession,
  {
    fileName,
    sourceTarget,
    target,
  }: Readonly<{
    fileName: string;
    sourceTarget?: string;
    target: string;
  }>,
): ToolcraftUnavailableImageResourceFixture {
  const normalizedFileName = fileName.trim();
  const normalizedSourceTarget = sourceTarget?.trim();
  const normalizedTarget = target.trim();
  expect(
    normalizedFileName,
    "Unavailable-resource proof requires an exact non-empty image file name.",
  ).not.toBe("");
  expect(
    normalizedTarget,
    "Unavailable-resource proof requires an exact semantic acceptance target.",
  ).not.toBe("");
  if (sourceTarget !== undefined) {
    expect(
      normalizedSourceTarget,
      "Unavailable-resource proof sourceTarget must be non-empty when provided.",
    ).not.toBe("");
  }

  const requestId =
    `unavailable-image-${++unavailableImageResourceFixtureSequence}`;
  const request = {
    fileName: normalizedFileName,
    requestId,
    ...(normalizedSourceTarget
      ? { sourceTarget: normalizedSourceTarget }
      : {}),
  };
  const runRequest = (
    action: "activate" | "cleanup",
    expectedStatus: "active" | "cleaned",
  ) =>
    session.targetAction(normalizedTarget, async (page) => {
      await page.evaluate(
        ({ detail, eventName }) => {
          document.dispatchEvent(
            new CustomEvent(eventName, {
              detail,
            }),
          );
        },
        {
          detail: { ...request, action },
          eventName:
            "toolcraft.browser-proof.unavailable-resource-request",
        },
      );
      await expect
        .poll(
          async () => {
            const raw = await page
              .locator('[data-slot="toolcraft-runtime-app"]')
              .getAttribute(
                "data-toolcraft-unavailable-resource-evidence",
              );
            const observation =
              parseUnavailableImageResourceObservation(raw);
            if (
              observation.status === "error" &&
              (
                observation.requestId === undefined ||
                observation.requestId === requestId
              )
            ) {
              throw new Error(
                observation.message ??
                  "The Toolcraft unavailable-resource proof fixture failed.",
              );
            }
            return observation.requestId === requestId
              ? observation.status
              : "other-request";
          },
          {
            message:
              `Unavailable-resource proof "${requestId}" should reach ${expectedStatus}.`,
          },
        )
        .toBe(expectedStatus);
    });
  const activate = runRequest("activate", "active");
  const cleanup = runRequest("cleanup", "cleaned");
  const observe = session.observe((root) =>
    root.getAttribute("data-toolcraft-unavailable-resource-evidence"),
  );
  const fixture = Object.freeze({}) as ToolcraftUnavailableImageResourceFixture;
  unavailableImageResourceFixtureRecords.set(fixture, {
    activate,
    cleanup,
    fileName: normalizedFileName,
    observe,
    requestId,
    target: normalizedTarget,
  });
  return fixture;
}

export async function expectToolcraftInfinityCanvasUnavailableImageExportEvidence<
  TArtifact,
>(
  fixture: ToolcraftUnavailableImageResourceFixture,
  produceArtifact: ToolcraftBrowserAction<"interaction", TArtifact>,
  inspectArtifact: (
    artifact: TArtifact,
  ) => Promise<ToolcraftExportArtifactInspection> | ToolcraftExportArtifactInspection,
  {
    expectedSize,
    requirementId,
  }: Readonly<{
    expectedSize: Readonly<{ height: number; width: number }>;
    requirementId: string;
  }>,
): Promise<ToolcraftExportArtifactInspection> {
  const record = requireUnavailableImageResourceFixture(fixture);
  assertToolcraftBrowserProofSession(
    record.observe,
    record.activate,
    record.cleanup,
    produceArtifact,
  );
  const exportTarget = getToolcraftBrowserActionTarget(produceArtifact)?.trim();
  expect(
    exportTarget,
    "Unavailable-image export evidence requires a target-scoped artifact action.",
  ).toBe(record.target);

  let activationAttempted = false;
  let cleanupSucceeded = false;
  let inspection: ToolcraftExportArtifactInspection | null = null;
  let outputVerified = false;
  try {
    activationAttempted = true;
    await runToolcraftBrowserAction(record.activate);
    validateUnavailableImageResourceObservation(
      await readUnavailableImageResourceObservation(record.observe),
      {
        fileName: record.fileName,
        requestId: record.requestId,
        status: "active",
      },
    );

    const artifact = await runToolcraftBrowserValueAction(produceArtifact);
    assertToolcraftProducedArtifact(artifact, requirementId);
    inspection = await inspectArtifact(artifact);
    validateToolcraftExportArtifactInspection(inspection, requirementId);
    expect(
      inspection,
      `Unavailable-image export "${requirementId}" must decode to the saved export artboard dimensions.`,
    ).toMatchObject(expectedSize);
    validateUnavailableImageResourceObservation(
      await readUnavailableImageResourceObservation(record.observe),
      {
        fileName: record.fileName,
        requestId: record.requestId,
        status: "active",
      },
    );
    outputVerified = true;
  } finally {
    const current = activationAttempted
      ? await readUnavailableImageResourceObservation(record.observe)
      : null;
    if (
      current?.requestId === record.requestId &&
      current.status === "active"
    ) {
      await runToolcraftBrowserAction(record.cleanup);
      validateUnavailableImageResourceObservation(
        await readUnavailableImageResourceObservation(record.observe),
        {
          fileName: record.fileName,
          requestId: record.requestId,
          status: "cleaned",
        },
      );
      cleanupSucceeded = true;
    } else if (outputVerified) {
      throw new Error(
        "Unavailable-image export evidence requires the exact active fixture to remain available for deterministic cleanup.",
      );
    }
  }

  if (!cleanupSucceeded || !inspection) {
    throw new Error(
      "Unavailable-image export evidence requires successful fixture cleanup before publication.",
    );
  }
  await attachToolcraftBrowserRuntimeEvidence({
    evidenceType: "exported-artifact",
    requirementId,
    target: exportTarget,
  });
  return inspection;
}
