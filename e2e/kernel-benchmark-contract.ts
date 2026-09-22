import type { Page } from "@playwright/test";
import type { ToolcraftRendererStrategy } from "@/toolcraft/runtime";

export type ToolcraftKernelCandidateHarness = Readonly<{
  iterations: number;
  run: (context: Readonly<{
    page: Page;
    workload: Readonly<Record<string, number>>;
  }>) => Promise<string | Uint8Array>;
}>;

export type ToolcraftKernelBenchmarkHarnessRegistry = Readonly<
  Record<
    string,
    Readonly<
      Partial<Record<ToolcraftRendererStrategy, ToolcraftKernelCandidateHarness>>
    >
  >
>;
