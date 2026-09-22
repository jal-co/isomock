import { expect, test } from "@playwright/test";
import {
  expectToolcraftBackgroundOutputSemantics,
  expectToolcraftFiniteBackgroundMediaStacking,
} from "./browser-background-output-evidence";
import { expectToolcraftControlApplicabilityState } from "./browser-control-applicability-evidence";
import {
  expectToolcraftLayerReorder,
  expectToolcraftLayerSelection,
} from "./browser-layer-evidence-helpers";
import { createToolcraftBrowserProofSession } from "./browser-proof-session";
import {
  attachedEvidenceTypes,
  setProofState,
  setSyntheticControlOwner,
  setSyntheticSwitchControlOwner,
} from "./browser-semantic-evidence-test-helpers";
import {
  expectToolcraftMediaLifecycle,
  expectToolcraftPersistenceState,
  expectToolcraftViewportSideEffect,
} from "./browser-state-evidence-helpers";
import {
  expectToolcraftTimelineDuration,
  expectToolcraftTimelineKeyframes,
  expectToolcraftTimelineLoop,
  expectToolcraftTimelineRenderedFrame,
} from "./browser-timeline-evidence-helpers";

test("state recipes prove lifecycle, reload persistence, and viewport semantics", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  const session = await createToolcraftBrowserProofSession(page);
  const attachmentCount = testInfo.attachments.length;

  await setProofState(page, "media", {
    itemIds: [],
    outputSignature: "empty-canvas",
  });
  const mediaObservation = session.observe((root) =>
    JSON.parse(root.getAttribute("data-proof-media") ?? "null"),
  );
  await expectToolcraftMediaLifecycle(
    mediaObservation,
    session.action((currentPage) =>
      setProofState(currentPage, "media", {
        itemIds: ["source-a"],
        outputSignature: "rendered-source-a",
      }),
    ),
    { itemIds: ["source-a"], outputSignature: "rendered-source-a" },
    { requirementId: "media.source", stabilityIntervalMs: 0 },
  );

  await page.evaluate(() => localStorage.setItem("proof-persistence", "before"));
  const persistedObservation = session.observe(() =>
    localStorage.getItem("proof-persistence"),
  );
  await expectToolcraftPersistenceState(
    persistedObservation,
    session.action(async (currentPage) => {
      await currentPage.evaluate(() =>
        localStorage.setItem("proof-persistence", "after"),
      );
    }),
    session.reload(),
    "after",
    { requirementId: "settings.persistence", stabilityIntervalMs: 0 },
  );

  await setProofState(page, "viewport", {
    offsetX: 0,
    offsetY: 0,
    outputHeight: 1080,
    outputWidth: 1920,
    zoom: 1,
  });
  const viewportObservation = session.observe((root) =>
    JSON.parse(root.getAttribute("data-proof-viewport") ?? "null"),
  );
  await expectToolcraftViewportSideEffect(
    viewportObservation,
    session.action((currentPage) =>
      setProofState(currentPage, "viewport", {
        offsetX: 24,
        offsetY: -12,
        outputHeight: 1080,
        outputWidth: 1920,
        zoom: 1.25,
      }),
    ),
    {
      offsetX: 24,
      offsetY: -12,
      outputHeight: 1080,
      outputWidth: 1920,
      zoom: 1.25,
    },
    { requirementId: "viewport.pan-zoom", stabilityIntervalMs: 0 },
  );

  expect(attachedEvidenceTypes(testInfo, attachmentCount)).toEqual([
    "media-lifecycle",
    "persistence-state",
    "viewport-side-effect",
  ]);
});

test("layer recipes reject collection substitution and prove exact reorder", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  const session = await createToolcraftBrowserProofSession(page);
  const attachmentCount = testInfo.attachments.length;
  await setProofState(page, "layers", {
    layerIds: ["a", "b"],
    outputSignature: "a-over-b",
  });
  const layersObservation = session.observe((root) =>
    JSON.parse(root.getAttribute("data-proof-layers") ?? "null"),
  );

  await expect(
    expectToolcraftLayerReorder(
      layersObservation,
      session.targetAction("layers.order", (currentPage) =>
        setProofState(currentPage, "layers", {
          layerIds: ["a", "c"],
          outputSignature: "a-over-c",
        }),
      ),
      { layerIds: ["a", "c"], outputSignature: "a-over-c" },
      {
        requirementId: "layers.invalid-reorder",
        stabilityIntervalMs: 0,
      },
    ),
  ).rejects.toThrow();
  expect(testInfo.attachments).toHaveLength(attachmentCount);

  await setProofState(page, "layers", {
    layerIds: ["a", "b"],
    outputSignature: "a-over-b",
  });
  await expectToolcraftLayerReorder(
    layersObservation,
    session.targetAction("layers.order", (currentPage) =>
      setProofState(currentPage, "layers", {
        layerIds: ["b", "a"],
        outputSignature: "b-over-a",
      }),
    ),
    { layerIds: ["b", "a"], outputSignature: "b-over-a" },
    { requirementId: "layers.reorder", stabilityIntervalMs: 0 },
  );

  await setProofState(page, "selection", { selectedLayerId: "a" });
  const selectionObservation = session.observe((root) =>
    JSON.parse(root.getAttribute("data-proof-selection") ?? "null"),
  );
  await expectToolcraftLayerSelection(
    selectionObservation,
    session.targetAction("layers.selection", (currentPage) =>
      setProofState(currentPage, "selection", { selectedLayerId: "b" }),
    ),
    { selectedLayerId: "b" },
    { requirementId: "layers.selection", stabilityIntervalMs: 0 },
  );

  expect(attachedEvidenceTypes(testInfo, attachmentCount)).toEqual([
    "product-observable-change",
    "layer-reorder",
    "layer-selection",
  ]);
});

test("timeline recipes bind duration to renderer, keyframes to output, and loops to a resized forward seam", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  const session = await createToolcraftBrowserProofSession(page);
  const attachmentCount = testInfo.attachments.length;
  await setProofState(page, "duration", {
    renderedCycleDurationSeconds: 8,
    timelineDurationSeconds: 8,
  });
  const durationObservation = session.observe((root) =>
    JSON.parse(root.getAttribute("data-proof-duration") ?? "null"),
  );
  await expect(
    expectToolcraftTimelineDuration(
      durationObservation,
      session.action((currentPage) =>
        setProofState(currentPage, "duration", {
          renderedCycleDurationSeconds: 8,
          timelineDurationSeconds: 6,
        }),
      ),
      6,
      {
        requirementId: "timeline.mismatched-duration",
        stabilityIntervalMs: 0,
        timeoutMs: 100,
      },
    ),
  ).rejects.toThrow(/renderer cycle/);
  expect(testInfo.attachments).toHaveLength(attachmentCount);

  await setProofState(page, "duration", {
    renderedCycleDurationSeconds: 8,
    timelineDurationSeconds: 8,
  });
  await expectToolcraftTimelineDuration(
    durationObservation,
    session.action((currentPage) =>
      setProofState(currentPage, "duration", {
        renderedCycleDurationSeconds: 6,
        timelineDurationSeconds: 6,
      }),
    ),
    6,
    { requirementId: "timeline.duration", stabilityIntervalMs: 0 },
  );

  await setProofState(page, "keyframes", {
    evaluatedValue: 0,
    keyframeCount: 0,
    outputSignature: "opacity-0",
  });
  const keyframeObservation = session.observe((root) =>
    JSON.parse(root.getAttribute("data-proof-keyframes") ?? "null"),
  );
  await expectToolcraftTimelineKeyframes(
    keyframeObservation,
    session.action((currentPage) =>
      setProofState(currentPage, "keyframes", {
        evaluatedValue: 0.75,
        keyframeCount: 1,
        outputSignature: "opacity-075",
      }),
    ),
    {
      evaluatedValue: 0.75,
      keyframeCount: 1,
      outputSignature: "opacity-075",
    },
    { requirementId: "timeline.keyframes", stabilityIntervalMs: 0 },
  );

  await setProofState(page, "rendered-frame", {
    frame: 0,
    outputSignature: "frame-0",
  });
  const renderedFrameObservation = session.observe((root) =>
    JSON.parse(root.getAttribute("data-proof-rendered-frame") ?? "null"),
  );
  await expectToolcraftTimelineRenderedFrame(
    renderedFrameObservation,
    session.action((currentPage) =>
      setProofState(currentPage, "rendered-frame", {
        frame: 1,
        outputSignature: "frame-1",
      }),
    ),
    { frame: 1, outputSignature: "frame-1" },
    { requirementId: "timeline.rendered-frame", stabilityIntervalMs: 0 },
  );

  await setProofState(page, "loop", {
    initial: {
      durationSeconds: 4,
      normalizedPhases: [0.05, 0.3, 0.6, 0.4, 0.8],
      seamEndSignature: "seam",
      seamStartSignature: "seam",
    },
    resized: {
      durationSeconds: 6,
      normalizedPhases: [0.05, 0.3, 0.6, 0.9, 0.1],
      seamEndSignature: "seam",
      seamStartSignature: "seam",
    },
  });
  const loopObservation = session.observe((root) =>
    JSON.parse(root.getAttribute("data-proof-loop") ?? "null"),
  );
  await expect(
    expectToolcraftTimelineLoop(loopObservation, {
      requirementId: "timeline.reverse-loop",
    }),
  ).rejects.toThrow(/forward wrap|advance forward|wrap only after/);

  await setProofState(page, "loop", {
    initial: {
      durationSeconds: 4,
      normalizedPhases: [0.05, 0.3, 0.6, 0.9, 0.1, 0.35],
      seamEndSignature: "seam-frame",
      seamStartSignature: "seam-frame",
    },
    resized: {
      durationSeconds: 6,
      normalizedPhases: [0.1, 0.35, 0.65, 0.95, 0.15, 0.4],
      seamEndSignature: "seam-frame",
      seamStartSignature: "seam-frame",
    },
  });
  await expectToolcraftTimelineLoop(loopObservation, {
    requirementId: "timeline.loop",
  });

  expect(attachedEvidenceTypes(testInfo, attachmentCount)).toEqual([
    "timeline-duration",
    "timeline-keyframes",
    "timeline-rendered-frame",
    "product-observable-change",
    "timeline-loop",
  ]);
});

test("control applicability recipe proves exact target absence and presence", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  const session = await createToolcraftBrowserProofSession(page);
  const attachmentCount = testInfo.attachments.length;
  await setSyntheticSwitchControlOwner(page, "feature.enabled", false);
  await setSyntheticControlOwner(page, "feature.conditional", true);

  const hiddenCase = {
    expectation: "hidden" as const,
    selectorControlType: "switch" as const,
    selectorLabel: "feature.enabled",
    selectorTarget: "feature.enabled",
    selectorValue: false,
    target: "feature.conditional",
  };
  const visibleCase = {
    ...hiddenCase,
    expectation: "visible" as const,
    selectorValue: true,
  };
  const mismatchedAction = session.controlAction(
    "feature.other",
    () => undefined,
  );

  await expect(
    expectToolcraftControlApplicabilityState(
      session,
      mismatchedAction,
      hiddenCase,
      { baseRequirementId: "feature.conditional", timeoutMs: 50 },
    ),
  ).rejects.toThrow(/target-scoped selector action/);
  expect(testInfo.attachments).toHaveLength(attachmentCount);

  await expect(
    expectToolcraftControlApplicabilityState(
      session,
      session.controlAction("feature.enabled", () => undefined),
      hiddenCase,
      { baseRequirementId: "feature.conditional", timeoutMs: 50 },
    ),
  ).rejects.toThrow(/should be hidden/);
  expect(testInfo.attachments).toHaveLength(attachmentCount);

  await expectToolcraftControlApplicabilityState(
    session,
    session.controlAction("feature.enabled", (control, currentPage) => {
      expect(control).toBeTruthy();
      return Promise.all([
        setSyntheticSwitchControlOwner(currentPage, "feature.enabled", false),
        setSyntheticControlOwner(currentPage, "feature.conditional", false),
      ]).then(() => undefined);
    }),
    hiddenCase,
    { baseRequirementId: "feature.conditional" },
  );
  await expectToolcraftControlApplicabilityState(
    session,
    session.controlAction("feature.enabled", (control, currentPage) => {
      expect(control).toBeTruthy();
      return Promise.all([
        setSyntheticSwitchControlOwner(currentPage, "feature.enabled", true),
        setSyntheticControlOwner(currentPage, "feature.conditional", true),
      ]).then(() => undefined);
    }),
    visibleCase,
    { baseRequirementId: "feature.conditional" },
  );

  expect(attachedEvidenceTypes(testInfo, attachmentCount)).toEqual([
    "control-applicability-hidden",
    "control-applicability-visible",
  ]);
});

test("background recipe proves preview exclusion, transparent image pixels, and preserved video background", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  const session = await createToolcraftBrowserProofSession(page);
  const attachmentCount = testInfo.attachments.length;
  const includeBackgroundTarget = "proof.background.include";
  const outputActionTarget = "proof.background.output";
  await setSyntheticControlOwner(page, includeBackgroundTarget, true);
  await setSyntheticControlOwner(page, outputActionTarget, true);
  await setProofState(page, "background", {
    backgroundVisible: true,
    outputSignature: "background-on",
  });
  const preview = session.observe((root) =>
    JSON.parse(root.getAttribute("data-proof-background") ?? "null"),
  );

  await expectToolcraftBackgroundOutputSemantics(
    preview,
    session.controlAction(includeBackgroundTarget, (_control, currentPage) =>
      setProofState(currentPage, "background", {
        backgroundVisible: false,
        outputSignature: "background-off",
      }),
    ),
    { backgroundVisible: false, outputSignature: "background-off" },
    session.controlAction(outputActionTarget, async () => new Uint8Array([1, 2, 3])),
    (artifact) => ({
      backgroundAlpha: 0,
      byteLength: artifact.byteLength,
      height: 1,
      mediaType: "image/png",
      width: 1,
    }),
    {
      requirementId: includeBackgroundTarget,
      stabilityIntervalMs: 0,
      video: {
        exportArtifact: session.controlAction(
          outputActionTarget,
          async () => new Uint8Array([4, 5, 6]),
        ),
        inspectArtifact: (artifact) => ({
          backgroundIncluded: true,
          byteLength: artifact.byteLength,
          durationMs: 1000,
          mediaType: "video/mp4",
        }),
      },
    },
  );

  await setProofState(page, "finite-background", {
    backgroundColor: "#101010",
    backgroundVisible: false,
    canvasMode: "finite",
    layerOrder: ["media", "product"],
    mediaVisible: true,
    outputSignature: "finite-background-off",
    productForegroundTransparent: true,
  });
  const finiteStacking = session.observe((root) =>
    JSON.parse(root.getAttribute("data-proof-finite-background") ?? "null"),
  );
  await expectToolcraftFiniteBackgroundMediaStacking(
    finiteStacking,
    session.controlAction(includeBackgroundTarget, (_control, currentPage) =>
      setProofState(currentPage, "finite-background", {
        backgroundColor: "#101010",
        backgroundVisible: true,
        canvasMode: "finite",
        layerOrder: ["background", "media", "product"],
        mediaVisible: true,
        outputSignature: "finite-background-on",
        productForegroundTransparent: true,
      }),
    ),
    {
      backgroundColor: "#101010",
      backgroundVisible: true,
      canvasMode: "finite",
      layerOrder: ["background", "media", "product"],
      mediaVisible: true,
      outputSignature: "finite-background-on",
      productForegroundTransparent: true,
    },
    {
      requirementId: includeBackgroundTarget,
      stabilityIntervalMs: 0,
    },
  );

  expect(attachedEvidenceTypes(testInfo, attachmentCount)).toEqual([
    "product-observable-change",
    "background-preview-exclusion",
    "exported-artifact",
    "background-image-transparency",
    "background-video-preserved",
    "product-observable-change",
    "background-finite-media-stacking",
  ]);
});
