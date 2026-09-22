import * as React from "react";
import type { ToolcraftSceneRect } from "@/toolcraft/runtime";
import { composeToolcraftApp } from "@/toolcraft/runtime/react";
import { appRendererPipelineRegistration } from "./app-performance";
import { physicalFeedbackExportRenderer } from "./feedback-export";
import { getPhysicalFeedbackReplaySteps } from "./feedback-values";
import { appSchema } from "./app-schema";
import { usePhysicalFeedbackRenderer } from "./use-physical-feedback-renderer";

export const physicalFeedbackSceneBounds: ToolcraftSceneRect = Object.freeze({
  height: 128,
  width: 192,
  x: -96,
  y: -64,
});

function ActivePhysicalFeedbackCanvas({
  onDispose,
}: Readonly<{
  onDispose: (presentationCount: number, gpuCount: number) => void;
}>): React.JSX.Element {
  const renderer = usePhysicalFeedbackRenderer(onDispose);
  return (
    <canvas
      {...renderer.runtime.attributes}
      {...renderer.exportAttributes}
      data-toolcraft-vgpu-product=""
      data-vgpu-coalesced-frames={renderer.runtime.coalescedFrames}
      data-vgpu-coalesced-releases={renderer.runtime.coalescedReleases}
      data-vgpu-disabled-backing={renderer.disabledBacking}
      data-vgpu-frame-count={renderer.runtime.frameCount}
      data-vgpu-frame-kind={renderer.sceneFrameKind}
      data-vgpu-interaction-active={String(renderer.interactionActive)}
      data-vgpu-renderer-epoch={renderer.lifecycleEpoch}
      data-vgpu-playing={String(renderer.timelinePlaying)}
      data-vgpu-operation-settled={
        renderer.pipelineProgress.operationSettledGeneration
      }
      data-vgpu-operation-started={
        renderer.pipelineProgress.operationStartedGeneration
      }
      data-vgpu-presentation-allocation-id={
        renderer.runtime.presentationAllocationId
      }
      data-vgpu-retirement-settled={
        renderer.pipelineProgress.retirementSettledGeneration
      }
      data-vgpu-retirement-started={
        renderer.pipelineProgress.retirementStartedGeneration
      }
      data-vgpu-resource-allocation-id={renderer.runtime.resourceAllocationId}
      data-vgpu-replay-steps={getPhysicalFeedbackReplaySteps(
        renderer.runtime.renderedTime,
      )}
      data-vgpu-rendered-time={renderer.runtime.renderedTime.toFixed(3)}
      ref={renderer.canvasRef}
      style={{
        display: "block",
      }}
    />
  );
}

function PhysicalFeedbackCanvas(): React.JSX.Element {
  const [disposals, setDisposals] = React.useState({ gpu: 0, presentation: 0 });
  const onDispose = React.useCallback((presentation: number, gpu: number) => {
    setDisposals((current) => ({
      gpu: current.gpu + gpu,
      presentation: current.presentation + presentation,
    }));
  }, []);

  return (
    <div
      data-vgpu-gpu-disposals={disposals.gpu}
      data-vgpu-presentation-disposals={disposals.presentation}
      data-vgpu-wrapper=""
      style={{ height: "100%", width: "100%" }}
    >
      <ActivePhysicalFeedbackCanvas onDispose={onDispose} />
    </div>
  );
}

export const appComposition = composeToolcraftApp(appSchema, {
  renderer: { pipelineRegistration: appRendererPipelineRegistration },
  scene: {
    canvasContent: <PhysicalFeedbackCanvas />,
    rasterFrameRenderer: physicalFeedbackExportRenderer,
    renderDefaultCanvasMedia: false,
    sceneBoundsProvider: () => [physicalFeedbackSceneBounds],
  },
});
