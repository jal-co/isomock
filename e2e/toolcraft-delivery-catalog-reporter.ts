import type {
  FullConfig,
  FullResult,
  Reporter,
  Suite,
} from "@playwright/test/reporter";

import { deriveToolcraftPerformancePaths } from "@/toolcraft/runtime";

import { createToolcraftDeliveryCatalog } from "../scripts/toolcraft-delivery-catalog.mjs";
import {
  getToolcraftPlaywrightContainingFile,
  getToolcraftPlaywrightProjectRoot,
} from "../scripts/playwright-containing-file.mjs";
import { getToolcraftMotionReferenceArtifactErrors } from "../scripts/toolcraft-motion-reference-artifacts.mjs";
import type { ToolcraftAcceptanceValidationInput } from "../src/app/acceptance/validate-coverage";
import {
  appAcceptance,
  appControlSectionInventory,
  appProductReadiness,
  appTransferMode,
  validateToolcraftAcceptanceCoverage,
} from "../src/app/app-acceptance";
import { appPerformance } from "../src/app/app-performance";
import { appSchema } from "../src/app/app-schema";

type ToolcraftDeliveryCatalogReferenceValidationInput =
  ToolcraftAcceptanceValidationInput & { rootDir: string };

type ToolcraftMotionReferenceArtifactValidator =
  typeof getToolcraftMotionReferenceArtifactErrors;

type ToolcraftDeliveryCatalogFactoryInput = Readonly<{
  acceptance: typeof appAcceptance;
  availableTests: readonly Readonly<{ file: string; testName: string }>[];
  derivePerformancePaths: typeof deriveToolcraftPerformancePaths;
  performance: typeof appPerformance;
  rootDir: string;
  schema: typeof appSchema;
}>;

type ToolcraftDeliveryCatalogFactory = (
  input: ToolcraftDeliveryCatalogFactoryInput,
) => unknown;

type ToolcraftDeliveryCatalogReporterState =
  | Readonly<{ kind: "idle" }>
  | Readonly<{ error: unknown; kind: "preparation-failed" }>
  | Readonly<{
      catalogInput: ToolcraftDeliveryCatalogFactoryInput;
      kind: "ready";
      referenceValidationInput: ToolcraftDeliveryCatalogReferenceValidationInput;
    }>;

type ToolcraftDeliveryCatalogReporterOptions = Readonly<{
  createCatalog?: ToolcraftDeliveryCatalogFactory;
  validateReferences?: typeof validateToolcraftDeliveryCatalogReferences;
  writeError?: (source: string) => void;
  writeOutput?: (source: string) => void;
}>;

class ToolcraftReferenceValidationError extends Error {
  override readonly name = "ToolcraftReferenceValidationError";
}

function describeUnexpectedError(
  error: unknown,
  seen: ReadonlySet<unknown> = new Set(),
): string {
  if (!(error instanceof Error)) return String(error);
  if (seen.has(error)) return "[circular error cause]";
  const nextSeen = new Set(seen).add(error);
  const description = error.stack ?? `${error.name}: ${error.message}`;
  return error.cause === undefined
    ? description
    : `${description}\nCaused by: ${describeUnexpectedError(error.cause, nextSeen)}`;
}

function describeReporterError(error: unknown): string {
  return error instanceof ToolcraftReferenceValidationError
    ? error.message
    : describeUnexpectedError(error);
}

function assertNever(value: never): never {
  throw new Error(`Unexpected Toolcraft catalog reporter state: ${String(value)}`);
}

export async function validateToolcraftDeliveryCatalogReferences(
  {
    acceptance,
    productReadiness,
    rendererPipeline,
    rootDir,
    schema,
    sectionInventory,
    transferMode,
  }: ToolcraftDeliveryCatalogReferenceValidationInput,
  validateArtifacts: ToolcraftMotionReferenceArtifactValidator =
    getToolcraftMotionReferenceArtifactErrors,
): Promise<void> {
  const semanticErrors = validateToolcraftAcceptanceCoverage({
    acceptance,
    productReadiness,
    rendererPipeline,
    schema,
    sectionInventory,
    transferMode,
  });
  const artifactErrors = transferMode.referenceInputs.length === 0
    ? []
    : await validateArtifacts({
        referenceInputs: transferMode.referenceInputs,
        rootDir,
      });
  const errors = [...semanticErrors, ...artifactErrors];
  if (errors.length > 0) {
    throw new ToolcraftReferenceValidationError(
      `Toolcraft reference validation failed:\n${errors.join("\n")}`,
    );
  }
}

export default class ToolcraftDeliveryCatalogReporter implements Reporter {
  private readonly createCatalog: ToolcraftDeliveryCatalogFactory;
  private state: ToolcraftDeliveryCatalogReporterState = { kind: "idle" };
  private readonly validateReferences: typeof validateToolcraftDeliveryCatalogReferences;
  private readonly writeError: (source: string) => void;
  private readonly writeOutput: (source: string) => void;

  constructor(options: ToolcraftDeliveryCatalogReporterOptions = {}) {
    this.createCatalog = options.createCatalog ?? createToolcraftDeliveryCatalog;
    this.validateReferences =
      options.validateReferences ?? validateToolcraftDeliveryCatalogReferences;
    this.writeError = options.writeError ?? ((source) => {
      process.stderr.write(source);
    });
    this.writeOutput = options.writeOutput ?? ((source) => {
      process.stdout.write(source);
    });
  }

  onBegin(config: FullConfig, suite: Suite): void {
    try {
      const projectRoot = getToolcraftPlaywrightProjectRoot(config);
      const referenceValidationInput = {
        acceptance: appAcceptance,
        productReadiness: appProductReadiness,
        rendererPipeline: appPerformance.rendererPipeline,
        rootDir: projectRoot,
        schema: appSchema,
        sectionInventory: appControlSectionInventory,
        transferMode: appTransferMode,
      };
      const availableTests = suite.allTests().map((entry) => ({
        file: getToolcraftPlaywrightContainingFile(entry, projectRoot),
        testName: entry.title,
      }));
      const catalogInput = {
        acceptance: appAcceptance,
        availableTests,
        derivePerformancePaths: deriveToolcraftPerformancePaths,
        performance: appPerformance,
        rootDir: projectRoot,
        schema: appSchema,
      };
      this.state = { catalogInput, kind: "ready", referenceValidationInput };
    } catch (error) {
      this.state = { error, kind: "preparation-failed" };
    }
  }

  async onEnd(_result: FullResult): Promise<{ status: "failed" } | void> {
    const state = this.state;
    switch (state.kind) {
      case "idle":
        return this.reportFailure(new Error(
          "Toolcraft delivery catalog reporter did not receive a complete onBegin lifecycle.",
        ));
      case "preparation-failed":
        return this.reportFailure(state.error);
      case "ready":
        try {
          await this.validateReferences(state.referenceValidationInput);
          const catalog = this.createCatalog(state.catalogInput);
          this.writeOutput(`${JSON.stringify(catalog)}\n`);
          return;
        } catch (error) {
          return this.reportFailure(error);
        }
      default:
        return assertNever(state);
    }
  }

  private reportFailure(error: unknown): { status: "failed" } {
    this.writeError(
      `Toolcraft delivery catalog collection failed:\n${describeReporterError(error)}\n`,
    );
    return { status: "failed" };
  }

  printsToStdio(): boolean {
    return true;
  }
}
