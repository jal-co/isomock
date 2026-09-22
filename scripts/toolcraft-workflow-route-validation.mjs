import fs from "node:fs/promises";
import path from "node:path";

import {
  getToolcraftWorkflowRouteFragmentFailure,
  toolcraftWorkflowPhaseIds,
  toolcraftWorkflowRequiredDocPaths,
  toolcraftWorkflowRoutes,
} from "./toolcraft-workflow-routes.mjs";

export const toolcraftWorkflowPhaseLineBudget = 600;
export const toolcraftWorkflowDocumentCharacterBudget = 40_000;

function countSourceLines(source) {
  const normalizedSource = source.replace(/\r\n/gu, "\n").replace(/\n$/u, "");
  return normalizedSource.length === 0 ? 0 : normalizedSource.split("\n").length;
}

export async function getToolcraftWorkflowRouteFailures({
  documentCharacterBudget = toolcraftWorkflowDocumentCharacterBudget,
  projectRoot,
  workflowSource,
  routes = toolcraftWorkflowRoutes,
  requiredDocPaths = toolcraftWorkflowRequiredDocPaths,
  phaseLineBudget = toolcraftWorkflowPhaseLineBudget,
}) {
  const failures = [];
  const routeIds = new Set();
  const routedDocPaths = new Set();
  const checkedDocumentPaths = new Set();
  const sourceByPath = new Map();

  const exactFragmentFailure = getToolcraftWorkflowRouteFragmentFailure({
    routes,
    source: workflowSource,
  });
  if (exactFragmentFailure) failures.push(exactFragmentFailure);

  for (const route of routes) {
    if (!route.id || routeIds.has(route.id)) {
      failures.push(`workflow route id must be unique: ${route.id || "<missing>"}`);
    }
    routeIds.add(route.id);

    for (const phaseId of toolcraftWorkflowPhaseIds) {
      const phasePaths = route.phases?.[phaseId];

      if (!Array.isArray(phasePaths) || phasePaths.length === 0) {
        failures.push(`workflow route ${route.id} must define ${phaseId} docs`);
        continue;
      }

      if (new Set(phasePaths).size !== phasePaths.length) {
        failures.push(
          `workflow route ${route.id} repeats a document in the ${phaseId} phase`,
        );
      }

      let phaseLineCount = 0;

      for (const relativePath of phasePaths) {
        routedDocPaths.add(relativePath);
        let source = sourceByPath.get(relativePath);

        if (source === undefined) {
          try {
            source = await fs.readFile(
              path.join(projectRoot, "docs/toolcraft", relativePath),
              "utf8",
            );
            sourceByPath.set(relativePath, source);
          } catch (error) {
            if (error?.code !== "ENOENT") throw error;
            source = null;
            sourceByPath.set(relativePath, source);
            failures.push(`workflow route document is missing: ${relativePath}`);
          }
        }

        if (source !== null) {
          phaseLineCount += countSourceLines(source);

          if (!checkedDocumentPaths.has(relativePath)) {
            checkedDocumentPaths.add(relativePath);
            if (source.length > documentCharacterBudget) {
              failures.push(
                `workflow route document ${relativePath} is ${source.length} characters; budget is ${documentCharacterBudget}`,
              );
            }
          }
        }
      }

      if (phaseLineCount > phaseLineBudget) {
        failures.push(
          `workflow route ${route.id} ${phaseId} phase is ${phaseLineCount} lines; budget is ${phaseLineBudget}`,
        );
      }
    }
  }

  for (const relativePath of requiredDocPaths) {
    if (!routedDocPaths.has(relativePath)) {
      failures.push(`required workflow document is not routed: ${relativePath}`);
    }
  }

  return failures;
}
