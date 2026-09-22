"use client";

import * as React from "react";

import type { ToolcraftRendererPipelineClient } from "../../rendering";

export const TOOLCRAFT_PIPELINE_EVIDENCE_ATTRIBUTE =
  "data-toolcraft-pipeline-evidence";
export const TOOLCRAFT_PIPELINE_EVIDENCE_SNAPSHOT = Symbol.for(
  "toolcraft.renderer-pipeline-evidence.snapshot",
);

export function ToolcraftPipelineEvidenceBridge({
  client,
}: {
  client: ToolcraftRendererPipelineClient;
}): React.JSX.Element {
  const attachSnapshotGetter = React.useCallback(
    (element: HTMLOutputElement | null) => {
      if (!element) {
        return;
      }
      Object.defineProperty(element, TOOLCRAFT_PIPELINE_EVIDENCE_SNAPSHOT, {
        configurable: true,
        enumerable: false,
        value: client.getSnapshot,
        writable: false,
      });
    },
    [client],
  );

  return (
    <output
      aria-hidden="true"
      data-toolcraft-pipeline-evidence={client.runtimeId}
      hidden
      ref={attachSnapshotGetter}
    />
  );
}
