export type ToolcraftVitestRuntimeRequirement = {
  kind: "acceptance" | "performance";
  requirementId: string;
  testName: string;
};

export type ToolcraftVitestRuntimeTest = {
  expectedFailure: boolean;
  filePath: string;
  name: string;
  owner: "framework" | "product";
  state: "failed" | "passed" | "pending" | "skipped";
};

export const TOOLCRAFT_VITEST_RUNTIME_EVIDENCE_VERSION: 1;
export const TOOLCRAFT_VITEST_RUNTIME_REQUIREMENTS_ANNOTATION_TYPE: string;
export const TOOLCRAFT_VITEST_RUNTIME_MARKER_TEST_NAME: string;
export const TOOLCRAFT_VITEST_RUNTIME_MARKER_FILE_NAMES: readonly string[];
export const TOOLCRAFT_VITEST_RUNTIME_ACCEPTANCE_SELECTION_ENV: string;

export function getToolcraftProductTestProcessEnvironment(
  acceptanceIds: readonly string[] | null,
  inheritedEnvironment?: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv;

export function serializeToolcraftVitestRuntimeAcceptanceSelection(
  acceptanceIds: readonly string[],
): string;

export function parseToolcraftVitestRuntimeAcceptanceSelection(
  serialized: string,
): string[];

export function selectToolcraftVitestRuntimeRequirements(
  requirements: readonly ToolcraftVitestRuntimeRequirement[],
  serializedSelection: string | undefined,
): readonly ToolcraftVitestRuntimeRequirement[];

export function serializeToolcraftVitestRuntimeRequirements(
  requirements: readonly ToolcraftVitestRuntimeRequirement[],
): string;

export function parseToolcraftVitestRuntimeRequirements(annotation: {
  message: string;
  type: string;
}): ToolcraftVitestRuntimeRequirement[] | undefined;

export function evaluateToolcraftVitestRuntimeEvidence(input: {
  requirements: readonly ToolcraftVitestRuntimeRequirement[];
  tests: readonly ToolcraftVitestRuntimeTest[];
}): string[];
