import { expect, test, type Page } from "@playwright/test";

import {
  expectToolcraftOrientationAxisDrag,
  expectToolcraftOrientationAxisSnap,
  expectToolcraftOrientationCanvasMissPan,
  expectToolcraftOrientationModelDrag,
  expectToolcraftOrientationUndoReset,
  type ToolcraftOrientationBrowserObservation,
} from "./browser-orientation-gizmo-evidence-helpers";
import { createToolcraftBrowserProofSession } from "./browser-proof-session";
import {
  attachedEvidenceTypes,
  setProofState,
} from "./browser-semantic-evidence-test-helpers";

const orientationBaseline: ToolcraftOrientationBrowserObservation = {
  outputSignature: "model-front",
  pixelSignature: "pixels-front",
  pose: { position: [0, 0, 5], up: [0, 1, 0] },
  poseTarget: "view.orbit",
  presentationCacheKey: "appearance:document-model:v2",
  presentationDocumentId: "document-model",
  viewportOffsetX: 0,
  viewportOffsetY: 0,
};

const orientationDragged: ToolcraftOrientationBrowserObservation = {
  ...orientationBaseline,
  outputSignature: "model-dragged",
  pixelSignature: "pixels-dragged",
  pose: { position: [1, 1, 4.8], up: [0, 1, 0] },
};

const orientationOptions = {
  requirementId: "model.orientation",
  stabilityIntervalMs: 0,
  target: "view.orbit",
} as const;

type OrientationProofUiState = Readonly<{
  playbackActions?: readonly ("pause" | "play")[];
  renderScales?: readonly Readonly<{
    maximum: string;
    native?: boolean;
    value: string;
  }>[];
}>;

async function installOrientationProofUiState(
  page: Page,
  state: OrientationProofUiState,
): Promise<void> {
  await page.locator('[data-slot="toolcraft-runtime-app"]').evaluate(
    (root, proofState) => {
      root.querySelector('[data-orientation-proof-state]')?.remove();
      const fixture = document.createElement("div");
      fixture.dataset.orientationProofState = "";

      for (const action of proofState.playbackActions ?? []) {
        const button = document.createElement("button");
        const label = action === "play" ? "Play playback" : "Pause playback";
        button.type = "button";
        button.textContent = label;
        button.setAttribute("aria-label", label);
        fixture.append(button);
      }

      for (const [index, renderScale] of (
        proofState.renderScales ?? []
      ).entries()) {
        const field = document.createElement("div");
        field.dataset.toolcraftControlTarget = "canvas.renderScale";
        field.dataset.orientationProofRenderScale = String(index);
        const slider = document.createElement(
          renderScale.native ? "input" : "div",
        );
        slider.dataset.slot = "slider";
        if (renderScale.native) {
          slider.setAttribute("aria-label", "Render scale");
          slider.setAttribute("max", renderScale.maximum);
          slider.setAttribute("min", "1");
          slider.setAttribute("type", "range");
          slider.setAttribute("value", renderScale.value);
        } else {
          slider.setAttribute("aria-valuemax", renderScale.maximum);
          slider.setAttribute("aria-valuemin", "1");
          slider.setAttribute("aria-valuenow", renderScale.value);
          slider.setAttribute("role", "slider");
        }
        Object.assign(slider.style, { height: "20px", width: "120px" });
        slider.textContent = "Render scale";
        field.append(slider);
        fixture.append(field);
      }

      root.append(fixture);
    },
    state,
  );
}

async function installLiveProductPlaybackProbe(page: Page): Promise<void> {
  await page.locator('[data-slot="toolcraft-runtime-app"]').evaluate((root) => {
    root.querySelector('[data-orientation-live-playback-probe]')?.remove();
    const button = document.createElement("button");
    button.dataset.orientationLivePlaybackProbe = "";
    button.setAttribute("aria-label", "Pause playback");
    button.textContent = "Pause playback";
    button.type = "button";
    root.append(button);
  });
}

async function installOrientationGizmoPointerProbe(
  page: Page,
  initial: ToolcraftOrientationBrowserObservation,
  options: Readonly<{
    dragCommit?: "pointermove" | "pointerup";
    outcomes: Readonly<{
      drag?: ToolcraftOrientationBrowserObservation;
      snap?: ToolcraftOrientationBrowserObservation;
    }>;
  }>,
): Promise<void> {
  await page.locator('[data-slot="toolcraft-runtime-app"]').evaluate(
    (root, input) => {
      root.querySelector('[data-orientation-gizmo-probe]')?.remove();
      const gizmo = document.createElement("canvas");
      gizmo.dataset.orientationGizmoProbe = "";
      gizmo.dataset.hoveredAxis = "";
      gizmo.dataset.toolcraftCanvasHandle = "orientation-gizmo";
      gizmo.dataset.toolcraftOrientationPose = JSON.stringify(input.initial.pose);
      gizmo.dataset.toolcraftOrientationTarget = input.initial.poseTarget;
      gizmo.setAttribute("aria-label", "3D orientation gizmo");
      gizmo.setAttribute("role", "application");
      Object.assign(gizmo.style, {
        height: "70px",
        left: "80px",
        position: "absolute",
        top: "80px",
        touchAction: "none",
        width: "70px",
        zIndex: "1000",
      });
      let start = { x: 0, y: 0 };
      let activePointerId: number | null = null;
      const applyObservation = (
        observation: ToolcraftOrientationBrowserObservation | undefined,
      ): void => {
        if (!observation) return;
        gizmo.dataset.toolcraftOrientationPose = JSON.stringify(
          observation.pose,
        );
        root.setAttribute(
          "data-proof-orientation",
          JSON.stringify(observation),
        );
      };
      gizmo.addEventListener("pointerdown", (event) => {
        start = { x: event.clientX, y: event.clientY };
        activePointerId = event.pointerId;
        gizmo.setPointerCapture?.(event.pointerId);
      });
      gizmo.addEventListener("pointermove", (event) => {
        gizmo.dataset.hoveredAxis = "";
        if (
          activePointerId === event.pointerId &&
          input.options.dragCommit !== "pointerup" &&
          Math.hypot(event.clientX - start.x, event.clientY - start.y) > 3
        ) {
          applyObservation(input.options.outcomes.drag);
        }
      });
      gizmo.addEventListener("pointerup", (event) => {
        const dragged = Math.hypot(
          event.clientX - start.x,
          event.clientY - start.y,
        ) > 3;
        if (dragged && input.options.dragCommit === "pointerup") {
          applyObservation(input.options.outcomes.drag);
        } else if (!dragged) {
          applyObservation(input.options.outcomes.snap);
        }
        activePointerId = null;
      });
      root.append(gizmo);
    },
    { initial, options },
  );
}

async function installModelOrbitPointerProbe(
  page: Page,
  next: ToolcraftOrientationBrowserObservation,
): Promise<void> {
  await page.locator('[data-slot="toolcraft-runtime-app"]').evaluate(
    (root, observation) => {
      root.querySelector('[data-orientation-model-drag-probe]')?.remove();
      const surface = document.createElement("div");
      surface.dataset.orientationModelDragProbe = "";
      surface.dataset.canvasModelLayer = "proof-model";
      surface.dataset.toolcraftModelOrbitSurface = "true";
      Object.assign(surface.style, {
        height: "120px",
        left: "240px",
        position: "absolute",
        top: "160px",
        width: "160px",
        zIndex: "1000",
      });
      surface.addEventListener("pointerup", () => {
        root.setAttribute(
          "data-proof-orientation",
          JSON.stringify(observation),
        );
      });
      root.append(surface);
    },
    next,
  );
}

test("orientation axis drag validates paused maximum-quality proof state", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  const session = await createToolcraftBrowserProofSession(page);
  const attachmentCount = testInfo.attachments.length;
  const observation = session.observe((root) =>
    JSON.parse(root.getAttribute("data-proof-orientation") ?? "null"),
  );
  const invalidStateCases: readonly Readonly<{
    expectedError: RegExp;
    state: OrientationProofUiState;
  }>[] = [
    {
      expectedError: /must be paused.*Play playback/iu,
      state: {
        playbackActions: ["pause"],
        renderScales: [{ maximum: "2", value: "2" }],
      },
    },
    {
      expectedError: /exactly one standard playback action/iu,
      state: { playbackActions: ["play", "pause"] },
    },
    {
      expectedError: /canvas\.renderScale.*maximum/iu,
      state: {
        playbackActions: ["play"],
        renderScales: [{ maximum: "2", value: "1" }],
      },
    },
    {
      expectedError: /exactly one canvas\.renderScale owner/iu,
      state: {
        playbackActions: ["play"],
        renderScales: [
          { maximum: "2", value: "2" },
          { maximum: "2", value: "2" },
        ],
      },
    },
    {
      expectedError: /finite aria-valuenow/iu,
      state: {
        playbackActions: ["play"],
        renderScales: [{ maximum: "2", value: "" }],
      },
    },
    {
      expectedError: /finite aria-valuemax/iu,
      state: {
        playbackActions: ["play"],
        renderScales: [{ maximum: "invalid", value: "2" }],
      },
    },
  ];

  for (const { expectedError, state } of invalidStateCases) {
    await setProofState(page, "orientation", orientationBaseline);
    await installOrientationGizmoPointerProbe(page, orientationBaseline, {
      outcomes: { drag: orientationDragged },
    });
    await installOrientationProofUiState(page, state);
    await expect(
      expectToolcraftOrientationAxisDrag(observation, session, {
        ...orientationOptions,
        dragDelta: { x: 18, y: 12 },
      }),
    ).rejects.toThrow(expectedError);
    expect(testInfo.attachments).toHaveLength(attachmentCount);
  }
});

test("orientation axis drag retains proof for products without optional playback or render scale", async ({
  page,
}) => {
  await page.goto("/");
  const session = await createToolcraftBrowserProofSession(page);
  await setProofState(page, "orientation", orientationBaseline);
  const observation = session.observe((root) =>
    JSON.parse(root.getAttribute("data-proof-orientation") ?? "null"),
  );
  await installOrientationGizmoPointerProbe(page, orientationBaseline, {
    outcomes: { drag: orientationDragged },
  });
  await installOrientationProofUiState(page, {});

  await expectToolcraftOrientationAxisDrag(observation, session, {
    ...orientationOptions,
    dragDelta: { x: 18, y: 12 },
  });
});

test("orientation axis drag accepts native range value semantics", async ({
  page,
}) => {
  await page.goto("/");
  const session = await createToolcraftBrowserProofSession(page);
  await setProofState(page, "orientation", orientationBaseline);
  const observation = session.observe((root) =>
    JSON.parse(root.getAttribute("data-proof-orientation") ?? "null"),
  );
  await installOrientationGizmoPointerProbe(page, orientationBaseline, {
    outcomes: { drag: orientationDragged },
  });
  await installOrientationProofUiState(page, {
    playbackActions: ["play"],
    renderScales: [{ maximum: "2", native: true, value: "2" }],
  });

  await expectToolcraftOrientationAxisDrag(observation, session, {
    ...orientationOptions,
    dragDelta: { x: 18, y: 12 },
  });
});

test("synthetic orientation playback remains isolated from a live product timeline", async ({
  page,
}) => {
  await page.goto("/");
  const session = await createToolcraftBrowserProofSession(page);
  await setProofState(page, "orientation", orientationBaseline);
  await installOrientationProofUiState(page, { playbackActions: ["play"] });
  await installLiveProductPlaybackProbe(page);
  await installOrientationGizmoPointerProbe(page, orientationBaseline, {
    outcomes: { drag: orientationDragged },
  });
  const observation = session.observe((root) =>
    JSON.parse(root.getAttribute("data-proof-orientation") ?? "null"),
  );

  await expectToolcraftOrientationAxisDrag(observation, session, {
    ...orientationOptions,
    dragDelta: { x: 18, y: 12 },
  });
});

test("orientation recipes require shared pose/output changes and correct canvas ownership", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  const session = await createToolcraftBrowserProofSession(page);
  const attachmentCount = testInfo.attachments.length;
  const baseline = orientationBaseline;
  const dragged = orientationDragged;
  const options = orientationOptions;

  await setProofState(page, "orientation", baseline);
  await installOrientationProofUiState(page, {});
  const observation = session.observe((root) =>
    JSON.parse(root.getAttribute("data-proof-orientation") ?? "null"),
  );
  await installOrientationGizmoPointerProbe(page, baseline, {
    outcomes: {
      drag: {
        ...dragged,
        pixelSignature: baseline.pixelSignature,
      },
    },
  });
  await expect(
    expectToolcraftOrientationAxisDrag(
      observation,
      session,
      { ...options, dragDelta: { x: 18, y: 12 } },
    ),
  ).rejects.toThrow(
    /rendered product pixels must change while the pointer is still held/i,
  );
  expect(testInfo.attachments).toHaveLength(attachmentCount);

  await setProofState(page, "orientation", baseline);
  await installOrientationProofUiState(page, {
    playbackActions: ["play"],
    renderScales: [{ maximum: "2", value: "2" }],
  });
  await installOrientationGizmoPointerProbe(page, baseline, {
    dragCommit: "pointerup",
    outcomes: { drag: dragged },
  });
  await expect(
    expectToolcraftOrientationAxisDrag(
      observation,
      session,
      { ...options, dragDelta: { x: 18, y: 12 } },
    ),
  ).rejects.toThrow(/while the pointer is still held|before pointer release/i);
  expect(testInfo.attachments).toHaveLength(attachmentCount);

  await setProofState(page, "orientation", baseline);
  await installOrientationGizmoPointerProbe(page, baseline, {
    outcomes: { drag: dragged },
  });
  await expectToolcraftOrientationAxisDrag(
    observation,
    session,
    { ...options, dragDelta: { x: 18, y: 12 } },
  );
  await expectToolcraftOrientationUndoReset(
    observation,
    session.action((currentPage) =>
      setProofState(currentPage, "orientation", baseline),
    ),
    session.action((currentPage) =>
      setProofState(currentPage, "orientation", dragged),
    ),
    session.action((currentPage) =>
      setProofState(currentPage, "orientation", baseline),
    ),
    baseline,
    dragged,
    options,
  );

  const snapped: ToolcraftOrientationBrowserObservation = {
    ...baseline,
    outputSignature: "model-positive-x",
    pixelSignature: "pixels-positive-x",
    pose: { position: [5, 0, 0], up: [0, 1, 0] },
  };
  await installOrientationGizmoPointerProbe(page, baseline, {
    outcomes: { snap: snapped },
  });
  await expectToolcraftOrientationAxisSnap(
    observation,
    session,
    "+x",
    options,
  );

  await setProofState(page, "orientation", baseline);
  const modelDragged: ToolcraftOrientationBrowserObservation = {
    ...baseline,
    outputSignature: "model-direct-drag",
    pixelSignature: "pixels-direct-drag",
    pose: { position: [-1, 1, 4.8], up: [0, 1, 0] },
  };
  await expect(
    expectToolcraftOrientationModelDrag(
      observation,
      session,
      { ...options, dragDelta: { x: 28, y: 18 } },
    ),
  ).rejects.toThrow(/exactly one visible runtime model orbit surface/);
  expect(testInfo.attachments).toHaveLength(attachmentCount + 5);
  await installModelOrbitPointerProbe(page, modelDragged);
  await expectToolcraftOrientationModelDrag(
    observation,
    session,
    { ...options, dragDelta: { x: 28, y: 18 } },
  );

  await setProofState(page, "orientation", baseline);
  await expectToolcraftOrientationCanvasMissPan(
    observation,
    session.action((currentPage) =>
      setProofState(currentPage, "orientation", {
        ...baseline,
        viewportOffsetX: 24,
        viewportOffsetY: -12,
      }),
    ),
    options,
  );

  expect(attachedEvidenceTypes(testInfo, attachmentCount)).toEqual([
    "orientation-axis-drag",
    "orientation-shared-pose-output",
    "product-observable-change",
    "orientation-undo-reset",
    "orientation-axis-snap",
    "orientation-model-drag",
    "orientation-canvas-miss-pan",
  ]);
});
