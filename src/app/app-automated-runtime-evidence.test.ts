import { test } from "vitest";

import {
  TOOLCRAFT_VITEST_RUNTIME_REQUIREMENTS_ANNOTATION_TYPE,
  TOOLCRAFT_VITEST_RUNTIME_MARKER_TEST_NAME,
  serializeToolcraftVitestRuntimeRequirements,
  type ToolcraftVitestRuntimeRequirement,
} from "../../scripts/toolcraft-vitest-runtime-contract.mjs";
import { appAcceptance } from "./app-acceptance";

test(TOOLCRAFT_VITEST_RUNTIME_MARKER_TEST_NAME, async ({ annotate }) => {
  const requirements: ToolcraftVitestRuntimeRequirement[] = [
    ...appAcceptance
      .filter((entry) => entry.automated)
      .map((entry) => ({
        kind: "acceptance" as const,
        requirementId: entry.id,
        testName: entry.automatedTestName,
      })),
  ];

  await annotate(
    serializeToolcraftVitestRuntimeRequirements(requirements),
    TOOLCRAFT_VITEST_RUNTIME_REQUIREMENTS_ANNOTATION_TYPE,
  );
});
