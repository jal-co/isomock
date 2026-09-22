import path from "node:path";

import { collectToolcraftFrameworkOwnedLocalPaths } from "./toolcraft-source-ownership.mjs";
import {
  TOOLCRAFT_VITEST_RUNTIME_ACCEPTANCE_SELECTION_ENV,
  TOOLCRAFT_VITEST_RUNTIME_MARKER_FILE_NAMES,
  TOOLCRAFT_VITEST_RUNTIME_MARKER_TEST_NAME,
  evaluateToolcraftVitestRuntimeEvidence,
  parseToolcraftVitestRuntimeRequirements,
  selectToolcraftVitestRuntimeRequirements,
} from "./toolcraft-vitest-runtime-contract.mjs";

function normalizeModulePath(moduleId) {
  return moduleId.replaceAll("\\", "/").split("?", 1)[0];
}

function getMarkerFileName(test) {
  if (test.name !== TOOLCRAFT_VITEST_RUNTIME_MARKER_TEST_NAME) return undefined;

  const modulePath = normalizeModulePath(test.module.moduleId);
  return TOOLCRAFT_VITEST_RUNTIME_MARKER_FILE_NAMES.find((fileName) =>
    modulePath.endsWith(`/src/app/${fileName}`),
  );
}

export function findToolcraftVitestRuntimeMarker(tests) {
  const matches = tests.flatMap((test) => {
    const fileName = getMarkerFileName(test);
    return fileName ? [{ fileName, marker: test }] : [];
  });

  if (matches.length !== 1) {
    throw new Error(
      matches.length === 0
        ? "Toolcraft automated runtime marker was not executed."
        : "Toolcraft automated runtime marker must execute exactly once.",
    );
  }

  return matches[0];
}

function resolveAppRoot(marker, markerFileName) {
  const normalizedPath = normalizeModulePath(marker.module.moduleId);
  const markerSuffix = `/src/app/${markerFileName}`;

  return normalizedPath.slice(0, -markerSuffix.length);
}

export default class ToolcraftVitestRuntimeEvidenceReporter {
  async onTestRunEnd(testModules) {
    const collectedTests = testModules.flatMap((module) => [
      ...module.children.allTests(),
    ]);
    const { fileName: markerFileName, marker } =
      findToolcraftVitestRuntimeMarker(collectedTests);

    if (marker.result().state !== "passed") {
      throw new Error(
        `Toolcraft automated runtime marker must pass; received "${marker.result().state}".`,
      );
    }

    const publishedRequirements = marker
      .annotations()
      .map(parseToolcraftVitestRuntimeRequirements)
      .find(Boolean);
    if (!publishedRequirements) {
      throw new Error(
        "Toolcraft automated runtime marker did not publish valid requirements.",
      );
    }
    const requirements = selectToolcraftVitestRuntimeRequirements(
      publishedRequirements,
      process.env[TOOLCRAFT_VITEST_RUNTIME_ACCEPTANCE_SELECTION_ENV],
    );
    if (requirements.length === 0) {
      throw new Error(
        "Toolcraft automated runtime coverage must select at least one runtime requirement.",
      );
    }

    const appRoot = resolveAppRoot(marker, markerFileName);
    const protectedPaths = new Set(
      await collectToolcraftFrameworkOwnedLocalPaths(appRoot),
    );
    const markerPath = `src/app/${markerFileName}`;
    if (!protectedPaths.has(markerPath)) {
      throw new Error(
        `Toolcraft automated runtime marker must be framework-owned: ${markerPath}.`,
      );
    }
    const tests = collectedTests.map((test) => {
      const filePath = path
        .relative(appRoot, normalizeModulePath(test.module.moduleId))
        .split(path.sep)
        .join("/");

      return {
        expectedFailure: test.options.fails === true,
        filePath,
        name: test.name,
        owner: protectedPaths.has(filePath) ? "framework" : "product",
        state: test.result().state,
      };
    });
    const errors = evaluateToolcraftVitestRuntimeEvidence({
      requirements,
      tests,
    });

    if (errors.length > 0) {
      throw new Error(
        `Toolcraft automated runtime coverage failed:\n${errors
          .map((error) => `- ${error}`)
          .join("\n")}`,
      );
    }
  }
}
