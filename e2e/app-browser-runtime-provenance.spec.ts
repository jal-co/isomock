import { expect, test, type TestInfo } from "@playwright/test";

import {
  TOOLCRAFT_BROWSER_RUNTIME_EVIDENCE_ATTACHMENT_NAME,
  TOOLCRAFT_BROWSER_RUNTIME_EVIDENCE_CONTENT_TYPE,
  parseToolcraftBrowserRuntimeEvidence,
} from "../src/app/test-evidence/browser-runtime-contract";
import {
  expectToolcraftAcceptanceOutcome,
  expectToolcraftReferenceParity,
} from "./browser-acceptance-outcome-helpers";
import { expectToolcraftLayerSelection } from "./browser-layer-evidence-helpers";
import { createToolcraftBrowserProofSession } from "./browser-proof-session";
import { expectToolcraftProductObservableToChange } from "./product-observable-helpers";
import { expectToolcraftTimelineDuration } from "./browser-timeline-evidence-helpers";

test("protected observable evidence is attached only after its assertion succeeds", async ({
  page,
}, testInfo: TestInfo) => {
  await page.goto("/");
  const session = await createToolcraftBrowserProofSession(page);
  await page.locator('[data-slot="toolcraft-runtime-app"]').evaluate((root) => {
    const output = document.createElement("div");
    output.dataset.toolcraftProductOutput = "";
    output.dataset.toolcraftProofProductOutput = "";
    output.style.backgroundColor = "#000000";
    output.style.height = "24px";
    output.style.left = "0";
    output.style.position = "fixed";
    output.style.top = "0";
    output.style.width = "24px";
    output.style.zIndex = "100";
    output.textContent = "Before";
    const button = document.createElement("button");
    button.id = "change-output";
    button.type = "button";
    button.textContent = "Change output";
    const controlBoundary = document.createElement("div");
    controlBoundary.className = "contents";
    controlBoundary.dataset.toolcraftControlTarget = "test.output";
    const field = document.createElement("div");
    field.dataset.slot = "field";
    field.append(button);
    controlBoundary.append(field);
    root.append(output, controlBoundary);
  });

  const attachmentCount = testInfo.attachments.length;
  await expectToolcraftProductObservableToChange(
    session,
    session.controlAction("test.output", async (control, currentPage) => {
      await control.locator("#change-output").evaluate((button) => {
        button.dataset.activated = "true";
      });
      await currentPage.locator('[data-toolcraft-proof-product-output]').evaluate((output) => {
        (output as HTMLElement).style.backgroundColor = "#FFFFFF";
        output.textContent = "After";
      });
    }),
    {
      requirementId: "test.successful-observable",
      selector: "[data-toolcraft-proof-product-output]",
    },
  );

  const attachment = testInfo.attachments.at(-1);
  expect(testInfo.attachments).toHaveLength(attachmentCount + 1);
  expect(attachment).toMatchObject({
    contentType: TOOLCRAFT_BROWSER_RUNTIME_EVIDENCE_CONTENT_TYPE,
    name: TOOLCRAFT_BROWSER_RUNTIME_EVIDENCE_ATTACHMENT_NAME,
  });
  expect(parseToolcraftBrowserRuntimeEvidence(attachment)).toEqual({
    evidenceType: "product-observable-change",
    requirementId: "test.successful-observable",
    target: "test.output",
    version: 2,
  });

  const countAfterSuccess = testInfo.attachments.length;
  await expect(
    expectToolcraftProductObservableToChange(
      session,
      session.controlAction("test.output", async () => undefined),
      {
        requirementId: "test.failed-observable",
        selector: "[data-toolcraft-proof-product-output]",
        timeoutMs: 100,
      },
    ),
  ).rejects.toThrow(/Product output should change/);
  expect(testInfo.attachments).toHaveLength(countAfterSuccess);
});

test("acceptance evidence is attached only after semantic verification succeeds", async ({
  page,
}, testInfo: TestInfo) => {
  await page.goto("/");
  const session = await createToolcraftBrowserProofSession(page);
  await page.locator('[data-slot="toolcraft-runtime-app"]').evaluate((root) => {
    root.setAttribute(
      "data-duration",
      JSON.stringify({
        renderedCycleDurationSeconds: 8,
        timelineDurationSeconds: 8,
      }),
    );
    root.setAttribute(
      "data-selection",
      JSON.stringify({ selectedLayerId: "layer-a" }),
    );
    const outcome = document.createElement("div");
    outcome.id = "outcome";
    outcome.textContent = "before";
    root.append(outcome);
  });
  const attachmentCount = testInfo.attachments.length;
  const duration = session.observe((root) =>
    JSON.parse(root.getAttribute("data-duration") ?? "null"),
  );

  await expectToolcraftTimelineDuration(
    duration,
    session.action(async (currentPage) => {
      await currentPage.locator('[data-slot="toolcraft-runtime-app"]').evaluate((root) => {
        root.setAttribute(
          "data-duration",
          JSON.stringify({
            renderedCycleDurationSeconds: 6,
            timelineDurationSeconds: 6,
          }),
        );
      });
    }),
    6,
    { requirementId: "timeline.playback", stabilityIntervalMs: 0 },
  );

  expect(parseToolcraftBrowserRuntimeEvidence(testInfo.attachments.at(-1))).toEqual({
    evidenceType: "timeline-duration",
    requirementId: "timeline.playback",
    version: 2,
  });
  expect(testInfo.attachments).toHaveLength(attachmentCount + 1);

  const selection = session.observe((root) =>
    JSON.parse(root.getAttribute("data-selection") ?? "null"),
  );
  await expect(
    expectToolcraftLayerSelection(
      selection,
      session.targetAction("layers.selection", async () => undefined),
      { selectedLayerId: "layer-b" },
      {
        requirementId: "layers.selection",
        stabilityIntervalMs: 0,
        timeoutMs: 100,
      },
    ),
  ).rejects.toThrow(/select the expected layer/);
  expect(testInfo.attachments).toHaveLength(attachmentCount + 1);

  let transientActionStarted = false;
  let transientObservationCount = 0;
  await expect(
    expectToolcraftAcceptanceOutcome(
      async () => {
        if (!transientActionStarted) {
          return "before";
        }
        transientObservationCount += 1;
        return transientObservationCount === 1 ? "transient" : "before";
      },
      async () => {
        transientActionStarted = true;
      },
      {
        evidenceType: "command-side-effect",
        requirementId: "command.transient",
      },
    ),
  ).rejects.toThrow(/stability window/);
  expect(testInfo.attachments).toHaveLength(attachmentCount + 1);

  await page.locator("#outcome").evaluate((node) => {
    node.textContent = "after";
  });
  await expectToolcraftReferenceParity(
    () => page.locator("#outcome").textContent(),
    "after",
    {
      requirementId: "reference.renderer-state",
      target: "renderer.output",
    },
  );
  expect(testInfo.attachments).toHaveLength(attachmentCount + 2);
});

test("command side-effect evidence inherits its protected action target", async ({
  page,
}, testInfo: TestInfo) => {
  await page.goto("/");
  const session = await createToolcraftBrowserProofSession(page);
  await page.locator('[data-slot="toolcraft-runtime-app"]').evaluate((root) => {
    root.setAttribute("data-selected-source", "source-a");
  });
  const attachmentCount = testInfo.attachments.length;

  await expectToolcraftAcceptanceOutcome(
    () =>
      page
        .locator('[data-slot="toolcraft-runtime-app"]')
        .getAttribute("data-selected-source"),
    session.targetAction("sources.selected", async (currentPage) => {
      await currentPage
        .locator('[data-slot="toolcraft-runtime-app"]')
        .evaluate((root) => root.setAttribute("data-selected-source", "source-b"));
    }),
    {
      evidenceType: "command-side-effect",
      requirementId: "source.selection",
      stabilityIntervalMs: 0,
    },
  );

  expect(testInfo.attachments).toHaveLength(attachmentCount + 1);
  expect(parseToolcraftBrowserRuntimeEvidence(testInfo.attachments.at(-1))).toEqual({
    evidenceType: "command-side-effect",
    requirementId: "source.selection",
    target: "sources.selected",
    version: 2,
  });
});
