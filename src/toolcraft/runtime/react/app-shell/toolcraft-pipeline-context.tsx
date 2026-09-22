"use client";

import * as React from "react";

import {
  createToolcraftRendererPipelineRuntimeOwner,
  type AnyToolcraftRendererPipelineRegistration,
  type ToolcraftRendererPipelineClient,
} from "../../rendering";
import { ToolcraftPipelineEvidenceBridge } from "./toolcraft-pipeline-evidence";
import { createToolcraftPipelineExportLifetime } from "./toolcraft-pipeline-export-lifetime";

export const ToolcraftPipelineContext =
  React.createContext<ToolcraftRendererPipelineClient | null>(null);
const PipelineExportRetentionContext = React.createContext<ReturnType<
  typeof createToolcraftPipelineExportLifetime
> | null>(null);

export function useToolcraftPipelineExportRetention() {
  return React.useContext(PipelineExportRetentionContext);
}

export function ToolcraftPipelineProvider({
  children,
  registration,
}: {
  children: React.ReactNode;
  registration: AnyToolcraftRendererPipelineRegistration;
}): React.JSX.Element {
  const owner = React.useMemo(
    () => createToolcraftRendererPipelineRuntimeOwner(registration),
    [registration],
  );
  const lifetime = React.useMemo(
    () => createToolcraftPipelineExportLifetime(owner),
    [owner],
  );
  const committedLifetime = React.useRef(lifetime);
  const generationRef = React.useRef(0);

  React.useLayoutEffect(() => {
    const previousLifetime = committedLifetime.current;
    committedLifetime.current = lifetime;
    if (previousLifetime !== lifetime) {
      previousLifetime.retire();
    }
    const generation = ++generationRef.current;
    const release = owner.acquire();
    return () => {
      release();
      // Activity can reconnect effects; cancel exports without terminally
      // retiring the reusable provider facade. Owner leases release resources.
      queueMicrotask(() => {
        if (generationRef.current === generation) lifetime.cancelExports();
      });
    };
  }, [lifetime, owner]);

  return (
    <ToolcraftPipelineContext.Provider value={owner.client}>
      <PipelineExportRetentionContext.Provider value={lifetime}>
        {children}
      </PipelineExportRetentionContext.Provider>
      <ToolcraftPipelineEvidenceBridge client={owner.client} />
    </ToolcraftPipelineContext.Provider>
  );
}
