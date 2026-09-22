import * as React from "react";
import { getToolcraftVgpuExportRuntimeAttributes } from "@/toolcraft/integrations/vgpu";
import {
  useToolcraftPipeline,
  useToolcraftProductSceneFrame,
  useToolcraftSelector,
  useToolcraftValue,
  useToolcraftViewportInteractionActive,
  type ToolcraftProductSceneFrame,
} from "@/toolcraft/runtime/react";
import {
  getPhysicalFeedbackExportFailureCode,
  subscribePhysicalFeedbackExportFailure,
} from "./feedback-presentation";
import {
  mergePhysicalFeedbackPresentationRuntimeSnapshot,
  physicalFeedbackInitialCanvasRuntime,
  type PhysicalFeedbackCanvasRuntime,
} from "./feedback-canvas-lifecycle";
import {
  createPhysicalFeedbackResource,
  executePhysicalFeedbackPasses,
  type PhysicalFeedbackSimulationInput,
} from "./pipeline";
import {
  createPhysicalFeedbackPreviewStage,
  getPhysicalFeedbackOperationQueue,
  physicalFeedbackInitialPipelineProgress,
  planPhysicalFeedbackPreview,
} from "./feedback-operations";
import {
  getPhysicalFeedbackImpulse,
  getPhysicalFeedbackRenderScale,
} from "./feedback-values";
import { assertPhysicalFeedbackInteractiveBackingSize } from "./feedback-limits";
import { previewPresentPass, resourcesPass } from "./app-performance";
import { usePhysicalFeedbackCanvasLifecycle } from "./use-feedback-canvas-lifecycle";

export function getPhysicalFeedbackPreviewTarget({
  devicePixelRatio,
  renderScale,
  sceneFrame,
}: Readonly<{
  devicePixelRatio: number;
  renderScale: number;
  sceneFrame: ToolcraftProductSceneFrame;
}>) {
  if (sceneFrame.kind !== "ready") return null;
  const cssHeight = sceneFrame.rect.height;
  const cssWidth = sceneFrame.rect.width;
  return Object.freeze({
    backingHeight: Math.ceil(cssHeight * devicePixelRatio * renderScale),
    backingWidth: Math.ceil(cssWidth * devicePixelRatio * renderScale),
    cssHeight,
    cssWidth,
    frame: Object.freeze({
      cssHeight,
      cssWidth,
      devicePixelRatio,
      renderScale,
    }),
  });
}

export function usePhysicalFeedbackRenderer(
  onDispose: (presentationCount: number, gpuCount: number) => void,
) {
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const enabled = useToolcraftValue("simulation.enabled") !== false;
  const previewStageRef = React.useRef(createPhysicalFeedbackPreviewStage());
  const sceneFrame = useToolcraftProductSceneFrame();
  const interactionActive = useToolcraftViewportInteractionActive();
  const rendererPipeline = useToolcraftPipeline();
  const operationQueue = React.useMemo(
    () => rendererPipeline && getPhysicalFeedbackOperationQueue(rendererPipeline),
    [rendererPipeline],
  );
  const pipelineProgress = React.useSyncExternalStore(
    operationQueue?.subscribe ?? (() => () => undefined),
    operationQueue?.getSnapshot ?? (() => physicalFeedbackInitialPipelineProgress),
    () => physicalFeedbackInitialPipelineProgress,
  );
  const impulse = getPhysicalFeedbackImpulse(
    useToolcraftValue("simulation.impulse"),
  );
  const renderScale = getPhysicalFeedbackRenderScale(
    useToolcraftValue("canvas.renderScale"),
  );
  const timelinePlaying = useToolcraftSelector(
    (state) => state.timeline.isPlaying,
  );
  const timelineTime = useToolcraftSelector(
    (state) => state.timeline.currentTimeSeconds,
  );
  const timelineDuration = useToolcraftSelector(
    (state) => state.timeline.durationSeconds,
  );
  const exportFailure = React.useSyncExternalStore(
    subscribePhysicalFeedbackExportFailure,
    getPhysicalFeedbackExportFailureCode,
    () => null,
  );
  const renderedTime = timelineTime === timelineDuration ? 0 : timelineTime;
  const simulationTime = Math.floor(renderedTime * 12) / 12;
  const devicePixelRatio =
    typeof window === "undefined" ? 1 : window.devicePixelRatio;
  const previewTarget = React.useMemo(
    () =>
      getPhysicalFeedbackPreviewTarget({
        devicePixelRatio,
        renderScale,
        sceneFrame,
      }),
    [devicePixelRatio, renderScale, sceneFrame],
  );
  const backingHeight = previewTarget?.backingHeight ?? 0;
  const backingWidth = previewTarget?.backingWidth ?? 0;
  const cssHeight = previewTarget?.cssHeight ?? 0;
  const cssWidth = previewTarget?.cssWidth ?? 0;
  const [runtime, setRuntime] = React.useState<PhysicalFeedbackCanvasRuntime>(
    physicalFeedbackInitialCanvasRuntime,
  );
  const retireResources = React.useCallback(
    () =>
      operationQueue?.runRetirement(
        () => rendererPipeline?.invalidatePass(resourcesPass).cleanup ?? Promise.resolve(),
      ) ?? Promise.resolve(),
    [operationQueue, rendererPipeline],
  );
  const presentDisabledSurface = React.useCallback(
    async (commit: () => void) => {
      if (!rendererPipeline || !operationQueue) return;
      await rendererPipeline.runPass(previewPresentPass, undefined, async () => {
        await operationQueue.run(async () => commit());
      });
    },
    [operationQueue, rendererPipeline],
  );
  const { lifecycle, mountedRef } = usePhysicalFeedbackCanvasLifecycle({
    canvasRef,
    enabled,
    presentDisabledSurface,
    retireResources,
    setRuntime,
    surface: {
      backingHeight,
      backingWidth,
      cssHeight,
      cssWidth,
      renderedTime: simulationTime,
    },
  });

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (
      !enabled ||
      !canvas ||
      !previewTarget ||
      !rendererPipeline ||
      backingWidth <= 0 ||
      backingHeight <= 0
    ) {
      return;
    }
    const simulationInput: PhysicalFeedbackSimulationInput = {
      height: backingHeight,
      impulse,
      time: simulationTime,
      width: backingWidth,
    };
    assertPhysicalFeedbackInteractiveBackingSize(backingWidth, backingHeight);
    const plan = planPhysicalFeedbackPreview(
      previewStageRef.current,
      {
        canvas,
        frame: previewTarget.frame,
        simulationInput,
      },
      interactionActive,
    );
    previewStageRef.current = plan.stage;
    if (!plan.submission) {
      setRuntime((current) => ({
        ...current,
        coalescedFrames: plan.stage.coalescedFrames,
      }));
      return;
    }
    const submissionEpoch = lifecycle.captureSubmission();
    if (submissionEpoch === null) return;
    const submission = plan.submission;
    void executePhysicalFeedbackPasses({
      createResource: async (context, operationQueue) =>
        context.getOrCreateResource(
          ["feedback"],
          () => createPhysicalFeedbackResource(operationQueue, onDispose),
          (owned) => owned.dispose(),
        ),
      destination: (resource, simulation) =>
        lifecycle.commitSubmission(submissionEpoch, () =>
          resource.presentPreview({
            canvas: submission.canvas,
            frame: submission.frame,
            isCurrent: () =>
              lifecycle.isSubmissionCurrent(submissionEpoch),
            simulation,
          }),
        ),
      rendererPipeline,
      simulationInput: submission.simulationInput,
      surface: "preview",
    }).then(
      (outcome) => {
        lifecycle.commitSubmission(submissionEpoch, () => {
          if (!mountedRef.current) return;
          setRuntime((current) => ({
            ...mergePhysicalFeedbackPresentationRuntimeSnapshot(
              current,
              outcome.snapshot,
            ),
            attributes: outcome.attributes,
            coalescedReleases:
              current.coalescedReleases +
              (plan.releasedCoalescedInput ? 1 : 0),
          }));
        });
      },
      (error: unknown) => {
        if (mountedRef.current && lifecycle.isSubmissionCurrent(submissionEpoch)) {
          throw error;
        }
      },
    );
  }, [
    backingHeight,
    backingWidth,
    cssHeight,
    cssWidth,
    devicePixelRatio,
    enabled,
    impulse,
    interactionActive,
    lifecycle,
    onDispose,
    previewTarget,
    renderScale,
    rendererPipeline,
    simulationTime,
  ]);

  return Object.freeze({
    canvasRef,
    disabledBacking: enabled ? undefined : `${backingWidth}x${backingHeight}`,
    exportAttributes: getToolcraftVgpuExportRuntimeAttributes(exportFailure),
    interactionActive,
    lifecycleEpoch: lifecycle.currentEpoch(),
    pipelineProgress,
    runtime,
    sceneFrameKind: sceneFrame.kind,
    timelinePlaying,
  });
}
