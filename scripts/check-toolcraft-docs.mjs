import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  getToolcraftContractFragmentFailures,
  toolcraftDecisionRuleIds,
} from "./toolcraft-contract-manifest.mjs";
import {
  getToolcraftBrowserSurfaceRoutingFailures,
  toolcraftWorkflowRequiredDocPaths,
} from "./toolcraft-workflow-routes.mjs";
import { getToolcraftWorkflowRouteFailures } from "./toolcraft-workflow-route-validation.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");

const requiredDocs = [
  "README.md",
  "workflow.md",
  "assembly-workflow.md",
  "decision-contract.md",
  "schema-reference.md",
  "acceptance-testing.md",
  "performance.md",
  "renderer-technique.md",
  "agent-worklog.md",
  "custom-controls.md",
  "custom-control-visuals.md",
  "component-rules.md",
];

const requiredCoreDocs = [
  "core/runtime-boundary.md",
  "core/setup-export.md",
  "core/control-selection.md",
  "core/layout.md",
  "core/media-upload.md",
  "core/development-files.md",
  "core/timeline-animation.md",
  "core/performance.md",
  "core/reference-study.md",
];

const workflowMetaDocs = new Set([
  "README.md",
  "workflow.md",
  "agent-worklog.md",
]);
const requiredWorkflowDocPaths = [...requiredDocs, ...requiredCoreDocs].filter(
  (relativePath) => !workflowMetaDocs.has(relativePath),
);

const requiredProjectFiles = ["LICENSE.md", "NOTICE.md"];

const requiredAgentsEntryLinks = ["workflow.md", "core/"];

const requiredWorkflowLinks = [...toolcraftWorkflowRequiredDocPaths];

const requiredWorkflowTerms = [
  "Verification Tier Classifier",
  "Verification tier: Tier N",
  "Open exactly one listed document per terminal or tool read",
  "coherent user-visible delivery batch",
  "npm run verify:delivery",
  "npm run test:feature",
];
const productConstructorDocTerms = ["base", "modules", "composeToolcraftApp"];

const repoScope = "@repo";
const workspaceProtocol = "workspace";
const forbiddenTextPatterns = [
  new RegExp(`${repoScope}/ui`),
  new RegExp(`${repoScope}/toolcraft-runtime`),
  new RegExp(`${workspaceProtocol}:`),
  /toolcraft-ai-assembly/,
  /\bAI Assembly\b/,
  /How AI/,
];
const forbiddenModelContractPatterns = [
  /\bgeometry-only (?:3D )?model(?:s| bundle| bundles| app| apps| default)?\b/iu,
];
const forbiddenPerformanceRoutingPatterns = [
  /for a performance complaint only,\s+an exact request quote and the canonical affected performance path ids/iu,
  /(?:\*\*)?performance complaint(?::\*\*|\.\*\*)[^\n]*(?:canonical affected path ids|targeted iteration)/iu,
  /\ba performance complaint records[^\n]*(?:canonical affected path ids|targeted iteration)/iu,
  /unresolved\s+`?needs-agent-judgment`?[^\n]*(?:creates neither|records neither|no `?performance intent)/iu,
  /for unresolved\s+`?needs-agent-judgment`?[^\n]*no `?performance intent/iu,
  /direct reports that the app lags[^\n]*select one performance iteration/iu,
  /independent complaint still selects an iteration/iu,
];
const forbiddenCompatibilityGuidancePatterns = [
  /omitted applicability and legacy visibleWhen are runtime compatibility only/iu,
  /Legacy data-URL snapshots migrate/iu,
  /Use `visibleWhen` for sliders or range sliders/iu,
];

async function readText(relativePath) {
  return fs.readFile(path.join(projectRoot, relativePath), "utf8");
}

async function fileExists(relativePath) {
  try {
    const stat = await fs.stat(path.join(projectRoot, relativePath));
    return stat.isFile();
  } catch {
    return false;
  }
}

const failures = [];

for (const fileName of [...requiredDocs, ...requiredCoreDocs]) {
  const relativePath = `docs/toolcraft/${fileName}`;

  if (!(await fileExists(relativePath))) {
    failures.push(`missing local Toolcraft doc: ${relativePath}`);
  }
}

for (const relativePath of requiredProjectFiles) {
  if (!(await fileExists(relativePath))) {
    failures.push(`missing required project file: ${relativePath}`);
  }
}

const agentsSource = await readText("AGENTS.md");
const decisionSource = await readText("docs/toolcraft/decision-contract.md");
const docsSources = [agentsSource, decisionSource];

for (const ruleId of toolcraftDecisionRuleIds) {
  if (!agentsSource.includes(ruleId)) {
    failures.push(`AGENTS.md must list decision rule "${ruleId}"`);
  }

  if (!decisionSource.includes(ruleId)) {
    failures.push(
      `docs/toolcraft/decision-contract.md must list decision rule "${ruleId}"`,
    );
  }
}

failures.push(
  ...getToolcraftContractFragmentFailures({
    fragmentIds: ["decision-rule-list"],
    label: "AGENTS.md",
    source: agentsSource,
  }),
  ...getToolcraftContractFragmentFailures({
    fragmentIds: ["decision-rule-table"],
    label: "docs/toolcraft/decision-contract.md",
    source: decisionSource,
  }),
  ...getToolcraftContractFragmentFailures({
    fragmentIds: ["built-in-control-table"],
    label: "docs/toolcraft/schema-reference.md",
    source: await readText("docs/toolcraft/schema-reference.md"),
  }),
);

for (const fileName of [...requiredDocs, ...requiredCoreDocs]) {
  const source = await readText(`docs/toolcraft/${fileName}`);
  docsSources.push(source);
}

const combinedSource = docsSources.join("\n");
const workflowSource = await readText("docs/toolcraft/workflow.md");
const mediaUploadSource = await readText("docs/toolcraft/core/media-upload.md");
const runtimeBoundarySource = await readText(
  "docs/toolcraft/core/runtime-boundary.md",
);
const rendererTechniqueSource = await readText(
  "docs/toolcraft/renderer-technique.md",
);
const acceptanceSource = await readText("docs/toolcraft/acceptance-testing.md");
const productConstructorSources = [
  ["AGENTS.md", agentsSource],
  [
    "docs/toolcraft/assembly-workflow.md",
    await readText("docs/toolcraft/assembly-workflow.md"),
  ],
  ["docs/toolcraft/core/runtime-boundary.md", runtimeBoundarySource],
  [
    "docs/toolcraft/schema-reference.md",
    await readText("docs/toolcraft/schema-reference.md"),
  ],
];

failures.push(
  ...(await getToolcraftWorkflowRouteFailures({
    projectRoot,
    requiredDocPaths: requiredWorkflowDocPaths,
    workflowSource,
  })),
  ...getToolcraftBrowserSurfaceRoutingFailures({
    agents: [
      {
        label: "AGENTS.md",
        source: agentsSource,
        workflowPath: "docs/toolcraft/workflow.md",
      },
    ],
    workflowLabel: "docs/toolcraft/workflow.md",
    workflowSource,
  }),
);

for (const pattern of forbiddenTextPatterns) {
  if (pattern.test(combinedSource)) {
    failures.push(
      `local Toolcraft docs contain forbidden text pattern ${pattern}`,
    );
  }
}

for (const pattern of forbiddenModelContractPatterns) {
  if (pattern.test(combinedSource)) {
    failures.push(
      `local Toolcraft docs contain obsolete model contract ${pattern}`,
    );
  }
}

for (const pattern of forbiddenPerformanceRoutingPatterns) {
  if (pattern.test(combinedSource)) {
    failures.push(
      `local Toolcraft docs contain unconditional complaint routing ${pattern}`,
    );
  }
}

for (const pattern of forbiddenCompatibilityGuidancePatterns) {
  if (pattern.test(combinedSource)) {
    failures.push(
      `local Toolcraft docs contain removed compatibility guidance ${pattern}`,
    );
  }
}

for (const term of [
  "bounded ZIP",
  "Blender-compatible fallback",
  "modelPresentation",
]) {
  if (!mediaUploadSource.includes(term)) {
    failures.push(`docs/toolcraft/core/media-upload.md must mention "${term}"`);
  }
}

if (!runtimeBoundarySource.includes("modelPresentation")) {
  failures.push(
    "docs/toolcraft/core/runtime-boundary.md must define modelPresentation",
  );
}
if (!runtimeBoundarySource.includes("does not suppress runtime model layers")) {
  failures.push(
    "docs/toolcraft/core/runtime-boundary.md must state that renderDefaultCanvasMedia does not suppress runtime model layers",
  );
}
if (
  !rendererTechniqueSource.includes("useToolcraftModelPresentationConsumer")
) {
  failures.push(
    "docs/toolcraft/renderer-technique.md must show the checked custom model presentation consumer",
  );
}
for (const term of [
  "package-extraction",
  "appearance-preservation",
  "presentation-consumer-readiness",
  "pixel-output",
]) {
  if (!acceptanceSource.includes(term)) {
    failures.push(
      `docs/toolcraft/acceptance-testing.md must mention "${term}"`,
    );
  }
}

for (const localDoc of requiredAgentsEntryLinks) {
  if (!agentsSource.includes(`docs/toolcraft/${localDoc}`)) {
    failures.push(`AGENTS.md must link docs/toolcraft/${localDoc}`);
  }
}

for (const localDoc of requiredWorkflowLinks) {
  if (!workflowSource.includes(localDoc)) {
    failures.push(`docs/toolcraft/workflow.md must route to ${localDoc}`);
  }
}

for (const term of requiredWorkflowTerms) {
  if (!agentsSource.includes(term)) {
    failures.push(`AGENTS.md must mention "${term}"`);
  }

  if (!combinedSource.includes(term)) {
    failures.push(`local Toolcraft docs must mention "${term}"`);
  }
}

for (const [label, source] of productConstructorSources) {
  for (const term of productConstructorDocTerms) {
    if (!source.includes(term)) {
      failures.push(
        `${label} must mention public product constructor term "${term}"`,
      );
    }
  }
}

if (failures.length > 0) {
  console.error("Toolcraft local docs check failed:");

  for (const failure of failures) {
    console.error(`- ${failure}`);
  }

  process.exit(1);
}

console.log("Toolcraft local docs check passed.");
