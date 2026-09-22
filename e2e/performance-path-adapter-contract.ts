import type { Download, Page } from "@playwright/test";

import type { ToolcraftPerformancePath } from "@/toolcraft/runtime";

import type { ToolcraftPerformancePipelinePhase } from "../src/app/test-evidence/browser-performance-contract";
import type { ToolcraftCompiledFixtureApplications } from "./performance-compiled-fixture-runtime";

export type ToolcraftPerformanceCanvasBacking = Readonly<{
  canvasSelector: string;
}>;

export type ToolcraftPerformancePathActionContext = Readonly<{
  page: Page;
  path: ToolcraftPerformancePath;
  phase: ToolcraftPerformancePipelinePhase;
}>;

type ToolcraftPerformancePathAdapterBase = Readonly<{
  fixtureApplications?: (
    page: Page,
  ) => ToolcraftCompiledFixtureApplications;
  observeOutcome?: (
    context: ToolcraftPerformancePathActionContext,
  ) => Promise<unknown> | unknown;
  pathId: string;
  prepare: (page: Page) => Promise<void>;
  preparationRenderScale?: number;
  preparePhase?: (
    context: ToolcraftPerformancePathActionContext,
  ) => Promise<void> | void;
  settlePhase?: (
    context: ToolcraftPerformancePathActionContext,
  ) => Promise<void> | void;
  verifyOutcome?: (
    context: ToolcraftPerformancePathActionContext,
  ) => Promise<void> | void;
}>;

export type ToolcraftPerformancePathAdapter =
  ToolcraftPerformancePathAdapterBase &
    (
      | Readonly<{
          action: (
            context: ToolcraftPerformancePathActionContext,
          ) => Promise<void>;
          output?: never;
        }>
      | Readonly<{
          action?: never;
          output:
            | Readonly<{
                kind: "clipboard";
                label: string;
                verify: (signature: string, page: Page) => Promise<void> | void;
              }>
            | Readonly<{
                kind: "download";
                label: string;
                verify: (download: Download, page: Page) => Promise<void> | void;
              }>;
        }>
    );
