// Framework-only fixture: exercises source runtime, not a generated product.
import * as React from "react";
import { createRoot } from "react-dom/client";
import {
  defineToolcraft,
  spatialViewModule,
  timelineModule,
} from "@/toolcraft/runtime";
import {
  CanvasShell,
  ControlsPanel,
  ToolcraftRoot,
  useToolcraft,
  useToolcraftModelOrbitInteraction,
  readToolcraftOrientationPose,
} from "@/toolcraft/runtime/react";
import "../src/styles.css";

const schema = defineToolcraft({
  base: {
    identity: {
      id: "rotation-lock-browser-fixture",
      title: "Rotation lock fixture",
    },
    canvas: {
      enabled: true,
      size: { width: 600, height: 400, unit: "px" },
      renderScale: true,
    },
    panels: {
      controls: {
        title: "Rotation lock fixture",
        sections: [
          {
            id: "model",
            title: "Model",
            controls: {
              orientation: {
                applicability: { mode: "always" },
                type: "orientationGizmo",
                label: false,
                keyframeable: false,
                target: "view.orbit",
                defaultValue: { position: [2, 1, 5], up: [0, 1, 0] },
              },
              scale: {
                applicability: { mode: "always" },
                type: "slider",
                label: "Scale",
                target: "model.scale",
                defaultValue: 1,
                min: 0.5,
                max: 2,
              },
            },
          },
        ],
      },
    },
  },
  modules: [spatialViewModule(), timelineModule({ mode: "playback" })],
});

function FixtureScene() {
  const { state } = useToolcraft();
  const modelRef = React.useRef<HTMLDivElement>(null);
  const handlers = useToolcraftModelOrbitInteraction<HTMLDivElement>({
    target: "view.orbit",
    hitTest: (x, y) => {
      const rect = modelRef.current?.getBoundingClientRect();
      return Boolean(
        rect &&
        x >= rect.left &&
        x <= rect.right &&
        y >= rect.top &&
        y <= rect.bottom,
      );
    },
  });
  const pose = readToolcraftOrientationPose(state.values["view.orbit"]);
  return (
    <>
      <div
        {...handlers}
        style={{
          height: "100%",
          width: "100%",
          display: "grid",
          placeItems: "center",
        }}
      >
        <div
          ref={modelRef}
          data-testid="rotation-lock-model"
          style={{
            width: 180,
            height: 180,
            background: "var(--muted)",
            border: "1px solid var(--border)",
            transform: `perspective(500px) rotateY(${Math.atan2(pose.position[0], pose.position[2])}rad) rotateX(${-Math.atan2(pose.position[1], Math.hypot(pose.position[0], pose.position[2]))}rad) scale(${state.values["model.scale"]})`,
          }}
        />
      </div>
      <output hidden data-testid="rotation-lock-state">
        {JSON.stringify({
          canvas: state.canvas,
          pose,
          locked: state.values["canvas.rotationLocked"],
          timeline: state.timeline,
        })}
      </output>
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <ToolcraftRoot schema={schema}>
    <div style={{ position: "fixed", inset: 0 }}>
      <CanvasShell>
        <FixtureScene />
      </CanvasShell>
    </div>
    <div style={{ position: "fixed", right: 12, top: 12 }}>
      <ControlsPanel framed={false} />
    </div>
  </ToolcraftRoot>,
);
