"use client";

import * as React from "react";

import type { ToolcraftSourceAssetCoordinator } from "../../source-assets/source-asset-coordinator";
import type { ToolcraftSourceAssetFeedback } from "../../source-assets/source-asset-types";
import type { ToolcraftExternalStore } from "../../state/toolcraft-external-store";
import type { ToolcraftPoint } from "../../state/types";
import { getCanvasDropTarget } from "./canvas-upload-routing";

export type ToolcraftCanvasUploadPresentationState = {
  directOperation: boolean;
  feedback: ToolcraftSourceAssetFeedback | null;
};

function getCanvasPositionFromEvent(
  event: React.DragEvent<HTMLElement>,
  offset: ToolcraftPoint,
  zoom: number,
): ToolcraftPoint {
  const rect = event.currentTarget.getBoundingClientRect();
  const scale = zoom / 100;

  return {
    x: (event.clientX - rect.left - rect.width / 2 - offset.x) / scale,
    y: (event.clientY - rect.top - rect.height / 2 - offset.y) / scale,
  };
}

export function useCanvasDropImport({
  coordinator,
  onPresentationChange,
  setDragOver,
  store,
  uploadEnabled,
}: {
  coordinator: ToolcraftSourceAssetCoordinator;
  onPresentationChange: (
    state: ToolcraftCanvasUploadPresentationState,
  ) => void;
  setDragOver: React.Dispatch<React.SetStateAction<boolean>>;
  store: ToolcraftExternalStore;
  uploadEnabled: boolean;
}): React.DragEventHandler<HTMLDivElement> {
  const dropSequence = React.useRef(0);

  return React.useCallback(
    (event) => {
      if (!uploadEnabled) {
        return;
      }

      event.preventDefault();
      setDragOver(false);

      const uploadedFiles = Array.from(event.dataTransfer?.files ?? []);

      if (uploadedFiles.length === 0) {
        return;
      }
      const sequence = ++dropSequence.current;

      const state = store.getState();
      const { offset, zoom } = state.canvas;
      const position = getCanvasPositionFromEvent(event, offset, zoom);
      const selection = getCanvasDropTarget(state, uploadedFiles);

      if (selection.kind === "ambiguous") {
        onPresentationChange({
          directOperation: false,
          feedback: selection.feedback,
        });
        return;
      }

      if (selection.kind === "none") {
        onPresentationChange({ directOperation: false, feedback: null });
        return;
      }

      const directOperation = selection.control === undefined;
      onPresentationChange({ directOperation, feedback: null });
      void coordinator.importBatch(
        {
          files: uploadedFiles,
          origin: "canvas",
          position,
          ...(selection.control ? { target: selection.control.target } : {}),
        },
        selection.control,
      ).then(
        (outcome) => {
          if (dropSequence.current !== sequence) return;
          onPresentationChange({
            directOperation,
            feedback: outcome.kind === "rejected" ? outcome.feedback : null,
          });
        },
        (error: unknown) => {
          if (dropSequence.current !== sequence) return;
          onPresentationChange({
            directOperation,
            feedback: {
              category: "resource-unavailable",
              code: "import-failed",
              message: error instanceof Error
                ? error.message
                : "The source asset import could not be completed.",
            },
          });
        },
      );
    },
    [coordinator, onPresentationChange, setDragOver, store, uploadEnabled],
  );
}
