"use client";

import * as React from "react";

import { ToolcraftArtifactExportError } from "../../../export/export-error";
import { useToolcraftExportOwner } from "../../app-shell/toolcraft-export-context";
import { ToolcraftSceneExportError } from "../../../export/export-frame";
import type { ToolcraftRendererPipelineClient } from "../../../rendering";
import { defaultToolcraftRuntimeSceneVisibility } from "../../../scene";
import type {
  ToolcraftActionCommand,
  ToolcraftActionSchema,
} from "../../../schema/types";
import { isToolcraftArtifactExportAction } from "../../../schema/artifact-export-actions";
import type {
  ToolcraftCommand,
  ToolcraftState,
} from "../../../state/types";
import type { ActionControlRunAction } from "../renderers/controls-panel-action-renderer";
import { useToolcraftPipeline } from "../../app-shell/use-toolcraft-pipeline";
import { useToolcraftSourceAssetCoordinator, useToolcraftSourceAssetRetention } from "../../app-shell/toolcraft-source-asset-context";
import { useToolcraftPipelineExportRetention } from "../../app-shell/toolcraft-pipeline-context";
import { useOptionalToolcraftModelRenderHost } from "../../model-rendering/model-render-provider";
import {
  type ToolcraftControlsSceneExport,
} from "./export-action-runner";
import { runToolcraftExportSession } from "./export-action-session";

export type { ToolcraftControlsSceneExport } from "./export-action-runner";

export type ToolcraftPanelActionFeedback = Readonly<{
  code: string;
  message: string;
}>;

export type ToolcraftPanelActionContext = {
  action: ToolcraftActionSchema;
  dispatch: React.Dispatch<ToolcraftCommand>;
  reportProgress: (progress: number) => void;
  reportFeedback: (feedback: ToolcraftPanelActionFeedback) => void;
  resolveMediaResource: (
    resourceRef: string,
    options: Readonly<{ signal: AbortSignal }>,
  ) => Promise<Uint8Array | null>;
  rendererPipeline?: ToolcraftRendererPipelineClient | null;
  state: ToolcraftState;
};

export type ToolcraftPanelActionHandler = (
  context: ToolcraftPanelActionContext,
) => PromiseLike<unknown> | void;

type FooterActionProgressEntry = {
  id: number;
  progress: number | null;
};

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "then" in value &&
    typeof (value as { then?: unknown }).then === "function"
  );
}

function noopReportProgress(): void {}

const defaultSceneExport: ToolcraftControlsSceneExport = Object.freeze({
  visibility: defaultToolcraftRuntimeSceneVisibility,
});

function clampFooterActionProgress(progress: number): number {
  if (!Number.isFinite(progress)) {
    return 0;
  }

  return Math.max(0, Math.min(1, progress));
}

function getActionCommand(action: ToolcraftActionSchema): ToolcraftActionCommand | null {
  if (action.command) {
    return action.command;
  }

  switch (action.value.toLowerCase()) {
    case "apply":
      return "controls.apply";
    case "reset":
      return "controls.reset";
    default:
      return null;
  }
}

export function useControlsPanelActions({
  dispatch,
  getState,
  onPanelAction,
  sceneExport = defaultSceneExport,
}: {
  dispatch: React.Dispatch<ToolcraftCommand>;
  getState: () => ToolcraftState;
  onPanelAction?: ToolcraftPanelActionHandler;
  sceneExport?: ToolcraftControlsSceneExport;
}): {
  panelActionFeedback: ToolcraftPanelActionFeedback | null;
  runAction: ActionControlRunAction;
  stickyFooterActive: boolean;
  stickyFooterProgress: number | null;
} {
  const rendererPipeline = useToolcraftPipeline();
  const exportOwner = useToolcraftExportOwner();
  const exportStatus = React.useSyncExternalStore(
    exportOwner.subscribe, exportOwner.getStatus, exportOwner.getStatus,
  );
  const modelRenderHost = useOptionalToolcraftModelRenderHost();
  const sourceAssetCoordinator = useToolcraftSourceAssetCoordinator();
  const retainSourceOwner = useToolcraftSourceAssetRetention();
  const pipelineLifetime = useToolcraftPipelineExportRetention();
  const resolveMediaResource =
    sourceAssetCoordinator.resolveResource ?? (async () => null);
  const nextActionIdRef = React.useRef(0);
  const latestActionIdRef = React.useRef(-1);
  const [panelActionFeedback, setPanelActionFeedback] =
    React.useState<ToolcraftPanelActionFeedback | null>(null);
  const nextFooterActionIdRef = React.useRef(0);
  const [footerActionProgressEntries, setFooterActionProgressEntries] =
    React.useState<readonly FooterActionProgressEntry[]>([]);
  const stickyFooterProgress = React.useMemo(() => {
    for (let index = footerActionProgressEntries.length - 1; index >= 0; index -= 1) {
      const progress = footerActionProgressEntries[index]?.progress;

      if (typeof progress === "number") {
        return progress;
      }
    }

    return null;
  }, [footerActionProgressEntries]);

  function createFooterActionProgressTracker(
    reportFeedback: (feedback: ToolcraftPanelActionFeedback) => void,
  ): {
    reportProgress: (progress: number) => void;
    trackResult: (result: PromiseLike<unknown> | void) => void;
  } {
    const id = nextFooterActionIdRef.current;
    nextFooterActionIdRef.current += 1;

    let latestProgress: number | null = null;
    let isTracked = false;

    function reportProgress(progress: number): void {
      latestProgress = clampFooterActionProgress(progress);

      if (!isTracked) {
        return;
      }

      setFooterActionProgressEntries((entries) =>
        entries.map((entry) =>
          entry.id === id ? { ...entry, progress: latestProgress } : entry,
        ),
      );
    }

    function trackResult(result: PromiseLike<unknown> | void): void {
      if (!isPromiseLike(result)) {
        return;
      }

      isTracked = true;
      setFooterActionProgressEntries((entries) => [
        ...entries,
        { id, progress: latestProgress },
      ]);

      void Promise.resolve(result)
        .catch((error: unknown) => {
          if (
            error instanceof ToolcraftSceneExportError ||
            error instanceof ToolcraftArtifactExportError
          ) {
            reportFeedback(error.feedback);
          } else {
            console.error("Toolcraft panel action failed.", error);
          }
        })
        .finally(() => {
          setFooterActionProgressEntries((entries) =>
            entries.filter((entry) => entry.id !== id),
          );
        });
    }

    return { reportProgress, trackResult };
  }

  function runAction(
    action: ToolcraftActionSchema,
    options: { trackFooterPending?: boolean } = {},
  ): void {
    const actionId = nextActionIdRef.current;
    nextActionIdRef.current += 1;
    latestActionIdRef.current = actionId;
    setPanelActionFeedback(null);
    const reportFeedback = (feedback: ToolcraftPanelActionFeedback): void => {
      if (latestActionIdRef.current === actionId) {
        setPanelActionFeedback(feedback);
      }
    };
    const runtimeOwnsExport = isToolcraftArtifactExportAction(action);
    const command = runtimeOwnsExport
      ? null
      : action.command ?? (onPanelAction ? null : getActionCommand(action));

    if (command) {
      dispatch({ type: command });
      return;
    }

    const footerActionProgressTracker = options.trackFooterPending && !runtimeOwnsExport
      ? createFooterActionProgressTracker(reportFeedback)
      : null;
    const actionState = getState();
    let result: PromiseLike<unknown> | void;
    try {
      const reportProgress =
        footerActionProgressTracker?.reportProgress ?? noopReportProgress;
      if (runtimeOwnsExport) {
        const admitted = exportOwner.start((context) => runToolcraftExportSession({
          ...context,
          action,
          cancel: exportOwner.cancel,
          coordinator: sourceAssetCoordinator,
          host: modelRenderHost,
          pipelineLifetime,
          rendererPipeline,
          retainSourceOwner,
          sceneExport,
          state: actionState,
        }));
        if (admitted.status === "busy") {
          reportFeedback({ code: "export-busy", message: "An export is already in progress." });
          return;
        }
        result = admitted.completion;
      } else {
        result = onPanelAction?.({
          action,
          dispatch,
          reportFeedback,
          reportProgress,
          resolveMediaResource,
          rendererPipeline,
          state: actionState,
        });
      }
    } catch (error) {
      if (
        error instanceof ToolcraftSceneExportError ||
        error instanceof ToolcraftArtifactExportError
      ) {
        reportFeedback(error.feedback);
        result = undefined;
      } else {
        throw error;
      }
    }

    if (footerActionProgressTracker) {
      footerActionProgressTracker.trackResult(result);
    } else if (isPromiseLike(result)) {
      void Promise.resolve(result).catch((error: unknown) => {
        if (error instanceof ToolcraftSceneExportError || error instanceof ToolcraftArtifactExportError) {
          reportFeedback(error.feedback);
        } else {
          console.error("Toolcraft panel action failed.", error);
        }
      });
    }
  }

  return {
    panelActionFeedback,
    runAction,
    stickyFooterActive: footerActionProgressEntries.length > 0 || "progress" in exportStatus,
    stickyFooterProgress: "progress" in exportStatus ? exportStatus.progress : stickyFooterProgress,
  };
}
