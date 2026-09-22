// Framework-only lifecycle fixture; never part of generated product composition.
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  defineToolcraft,
  imageExportModule,
  mediaSourceModule,
  svgExportModule,
  timelineModule,
  videoExportModule,
} from "@/toolcraft/runtime";
import {
  ControlsPanel,
  ToolcraftRoot,
  type ToolcraftAppComposition,
} from "@/toolcraft/runtime/react";
import { useToolcraftExportOwner } from "../../packages/toolcraft-runtime/src/react/app-shell/toolcraft-export-context";
import { useToolcraftStore } from "../../packages/toolcraft-runtime/src/react/app-shell/toolcraft-store-context";
import { useToolcraftSourceAssetCoordinator } from "@/toolcraft/runtime/react/app-shell/toolcraft-source-asset-context";
import { getToolcraftRuntimeSetupBackgroundControls } from "../../packages/toolcraft-runtime/src/schema/runtime-setup-background";

type Owner = ReturnType<typeof useToolcraftExportOwner>;
let root: Root;
let host: HTMLElement;
let owner: Owner;
let store: ReturnType<typeof useToolcraftStore>;
let coordinator: ReturnType<typeof useToolcraftSourceAssetCoordinator>;
let held: Promise<void> | null = null;
let releaseHeld = () => {};
let renderCalls = 0;
let boundsCalls = 0;

function Probe() {
  owner = useToolcraftExportOwner();
  store = useToolcraftStore();
  coordinator = useToolcraftSourceAssetCoordinator();
  return <output hidden data-testid="export-job-ready" />;
}

export function holdExportJob() {
  held = new Promise<void>((resolve) => {
    releaseHeld = resolve;
  });
}
export function releaseExportJob() {
  releaseHeld();
  held = null;
}
export function unmountAndReleaseExportJob() {
  root.unmount();
  host.remove();
  releaseExportJob();
}
export function readExportJobFixture() {
  return {
    boundsCalls,
    renderCalls,
    phase: owner.getStatus().phase,
    color: store.getState().values["fixture.color"],
  };
}
export async function waitForExportJobSettlement() {
  if (["idle", "disposed"].includes(owner.getStatus().phase)) return;
  await new Promise<void>((resolve) => {
    const unsubscribe = owner.subscribe(() => {
      if (!["idle", "disposed"].includes(owner.getStatus().phase)) return;
      unsubscribe();
      resolve();
    });
  });
}

export async function seedExportJobImage() {
  const canvas = document.createElement("canvas");
  canvas.width = 8;
  canvas.height = 8;
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#0000ff";
  context.fillRect(0, 0, 8, 8);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((result) =>
      result ? resolve(result) : reject(new Error("Fixture image failed")),
    ),
  );
  const result = await coordinator.importBatch({
    files: [new File([blob], "fixture.png", { type: "image/png" })],
    origin: "canvas",
    position: { x: 32, y: 32 },
  });
  if (result.kind !== "committed")
    throw new Error(`Fixture import failed: ${result.kind}`);
  return result.assetIds.length;
}

export function mountExportJobFixture({ infinite = false } = {}) {
  renderCalls = 0;
  boundsCalls = 0;
  held = null;
  const schema = defineToolcraft({
    base: {
      identity: { id: "export-job-fixture", title: "Export Job Fixture" },
      canvas: {
        enabled: true,
        upload: true,
        size: { width: 64, height: 64, unit: "px" },
      },
      panels: {
        controls: {
          title: "Export fixture",
          sections: [
            {
              id: "appearance",
              title: "Appearance",
              controls: {
                color: {
                  applicability: { mode: "always" },
                  type: "color",
                  target: "fixture.color",
                  defaultValue: "#FF0000",
                  label: "Fill",
                },
              },
            },
            {
              id: "fixture-actions",
              actionGroup: "secondary",
              controls: {
                actions: {
                  applicability: { mode: "always" },
                  type: "panelActions",
                  target: "fixture.actions",
                  actions: [{ label: "Turn green", value: "green" }],
                },
              },
            },
          ],
        },
      },
      persistence: { storage: "localStorage" },
    },
    modules: [
      imageExportModule(),
      svgExportModule(),
      videoExportModule(),
      timelineModule({ mode: "playback", defaultDurationSeconds: 1 }),
      mediaSourceModule(),
    ],
  });
  const boundsProvider: NonNullable<
    ToolcraftAppComposition["sceneBoundsProvider"]
  > = ({ state }) => {
    boundsCalls += 1;
    return [
      {
        x: infinite ? state.timeline.currentTimeSeconds * 120 : 0,
        y: 0,
        width: 64,
        height: 64,
      },
    ];
  };
  const exportRenderer: NonNullable<ToolcraftAppComposition["exportRenderer"]> =
    {
      baseFileName: "export-job",
      async renderFrame({ context, frame, state, signal }) {
        renderCalls += 1;
        if (held) await held;
        signal.throwIfAborted();
        context.fillStyle = String(state.values["fixture.color"]);
        context.fillRect(frame.x, frame.y, frame.width, frame.height);
      },
    };
  const svgExportRenderer: NonNullable<
    ToolcraftAppComposition["svgExportRenderer"]
  > = {
    baseFileName: "export-job",
    async renderFrame({ container, frame, state, signal }) {
      renderCalls += 1;
      if (held) await held;
      signal.throwIfAborted();
      const rect = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "rect",
      );
      for (const key of ["x", "y", "width", "height"] as const)
        rect.setAttribute(key, String(frame[key]));
      rect.setAttribute("fill", String(state.values["fixture.color"]));
      container.append(rect);
    },
  };
  const background = getToolcraftRuntimeSetupBackgroundControls(schema);
  host = document.createElement("div");
  host.dataset.testid = "export-job-fixture";
  Object.assign(host.style, {
    position: "fixed",
    left: "10px",
    top: "10px",
    zIndex: "9999",
  });
  document.body.append(host);
  root = createRoot(host);
  root.render(
    <ToolcraftRoot
      schema={schema}
      initialState={{
        canvas: { mode: infinite ? "infinite" : "finite" },
        timeline: { durationSeconds: 0.2 },
        values: {
          "export.image.resolution": "2k",
          "export.video.resolution": "current",
          ...(background ? { [background.color.target]: "#000000" } : {}),
        },
      }}
    >
      <ControlsPanel
        framed={false}
        onPanelAction={({ action, dispatch }) => {
          if (action.value === "green")
            dispatch({
              type: "controls.setValue",
              target: "fixture.color",
              value: "#00FF00",
            });
        }}
        sceneExport={{
          boundsProvider,
          exportRenderer,
          svgExportRenderer,
          visibility: { renderDefaultImages: true, suppressedModelTargets: [] },
        }}
      />
      <Probe />
    </ToolcraftRoot>,
  );
}
