import type { ToolcraftBrowserProofBudget } from "../src/app/acceptance/browser-proof-policy.mjs";
import type { ToolcraftDeliveryCatalog } from "./toolcraft-delivery-catalog-validation.mjs";

export type ToolcraftDeliveryCatalogAcceptanceInput = Readonly<{
  browser:
    | false
    | Readonly<{
        budget: ToolcraftBrowserProofBudget;
        file: `e2e/${string}.spec.ts`;
        testName: string;
      }>;
  id: string;
  readonly [key: string]: unknown;
}>;

export type ToolcraftDeliveryCatalogFactoryInput = Readonly<{
  acceptance: readonly ToolcraftDeliveryCatalogAcceptanceInput[];
  availableTests: readonly Readonly<{ file: string; testName: string }>[];
  derivePerformancePaths?: (...args: readonly unknown[]) => readonly unknown[];
  performance?: unknown;
  performancePaths?: readonly unknown[];
  rootDir: string;
  schema?: unknown;
}>;

export function createToolcraftDeliveryCatalog(
  input: ToolcraftDeliveryCatalogFactoryInput,
): ToolcraftDeliveryCatalog;
