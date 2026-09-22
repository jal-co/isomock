"use client";

import * as React from "react";

import type { ToolcraftRendererPipelineClient } from "../../rendering";
import { ToolcraftPipelineContext } from "./toolcraft-pipeline-context";

export function useToolcraftPipeline(): ToolcraftRendererPipelineClient | null {
  return React.useContext(ToolcraftPipelineContext);
}
