import type {
  ToolcraftKernelBenchmarkDecision,
  ToolcraftRenderPlanBenchmarkRequirement,
} from "@/toolcraft/runtime";

export const TOOLCRAFT_KERNEL_BENCHMARK_RECEIPT_VERSION: 1;

export type ToolcraftKernelBenchmarkRequirement = Readonly<{
  candidates: readonly string[];
  passId: string;
  selected: string;
  workload: Readonly<Record<string, number>>;
}>;

export function createToolcraftKernelBenchmarkRequirements(options: {
  decisions: readonly ToolcraftKernelBenchmarkDecision[];
  requirements: readonly ToolcraftRenderPlanBenchmarkRequirement[];
}): readonly ToolcraftKernelBenchmarkRequirement[];

export function getToolcraftKernelBenchmarkRequirementHash(
  requirements: readonly ToolcraftKernelBenchmarkRequirement[],
): string;

export function getToolcraftKernelBenchmarkReceiptPath(rootDir: string): string;

export function getToolcraftKernelBenchmarkReceiptError(
  receipt: unknown,
  expected?: {
    nonce?: string;
    requirements?: readonly ToolcraftKernelBenchmarkRequirement[];
    sourceHash?: string;
  },
): string | undefined;

export function readToolcraftKernelBenchmarkReceipt(
  filePath: string,
  expected?: {
    nonce?: string;
    requirements?: readonly ToolcraftKernelBenchmarkRequirement[];
    sourceHash?: string;
  },
): Promise<unknown>;

export function writeToolcraftKernelBenchmarkReport(
  filePath: string,
  value: unknown,
): Promise<unknown>;
