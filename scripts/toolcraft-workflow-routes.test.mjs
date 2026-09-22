import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  getToolcraftBrowserSurfaceRoutingFailures,
  getToolcraftBrowserSurfaceRoutingFragmentFailure,
  getToolcraftWorkflowRouteFragmentFailure,
  renderToolcraftBrowserSurfaceRoutingFragment,
  renderToolcraftBrowserSurfaceRoutingSummary,
  renderToolcraftWorkflowRouteFragment,
  toolcraftBrowserSurfaceRoutingMarker,
  toolcraftWorkflowPhaseIds,
  toolcraftWorkflowRoutes,
} from "./toolcraft-workflow-routes.mjs";
import {
  getToolcraftWorkflowRouteFailures,
  toolcraftWorkflowDocumentCharacterBudget,
  toolcraftWorkflowPhaseLineBudget,
} from "./toolcraft-workflow-route-validation.mjs";

const starterRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

function defineFixtureRoute(pathsByPhase) {
  return [
    {
      id: "fixture",
      task: "Fixture",
      phases: pathsByPhase,
    },
  ];
}

const canonicalBrowserSurfaceRoutingFragment = `## Manual Browser Surface Routing

[//]: # (toolcraft-browser-surface-routing: explicit=user-choice; manual=host-embedded-first; fallback=host-embedded-then-external; external=standalone-os-browser; automated=headless-playwright)

Explicit user browser choice wins. Otherwise select from callable browser capabilities, never from product names, environment variables such as \`CODEX_*\`, installed executables, or guessed host identity.

Surface ownership defines the categories. A host-embedded browser renders inside an agent host. A standalone external browser opens or attaches to a separate operating-system browser window; a browser controller or MCP remains external even when callable by the agent.

For manual diagnosis, visual inspection, and user-visible preview, use this order:

1. Use the host-embedded browser surface in the current agent environment, such as the Codex in-app Browser.
2. If that surface is unavailable or incompatible with the required operation, use another controlled browser surface embedded inside an agent host.
3. Use a standalone external controlled browser only when all host-embedded surfaces are unavailable or incompatible, and record the concrete fallback reason in the worklog or verification narrative.

If the user explicitly names a browser or browser family, that choice is authoritative. If the named browser is unavailable, report that limitation instead of silently substituting another browser. Opening an uncontrolled system browser is allowed only for an explicit user-facing preview request; it cannot prove that the agent inspected the UI. If no controllable browser exists, report browser verification as unavailable and do not claim live inspection.

Automated Toolcraft browser checks remain on the headless Playwright Test path. The \`test:feature\`, \`test:browser\`, and \`verify:delivery\` scripts keep their existing projects, fixtures, reporters, budgets, and protected evidence behavior. A separately and explicitly requested headed debugging session remains diagnostic and does not alter those gates. Manual browser inspection supplements automated checks, never replaces them, and never mints protected evidence. A headless Playwright Test process is not an unwanted external browser window.`;

test("browser surface routing renders and validates the exact canonical contract", () => {
  assert.equal(
    toolcraftBrowserSurfaceRoutingMarker,
    "[//]: # (toolcraft-browser-surface-routing: explicit=user-choice; manual=host-embedded-first; fallback=host-embedded-then-external; external=standalone-os-browser; automated=headless-playwright)",
  );
  assert.equal(
    renderToolcraftBrowserSurfaceRoutingFragment(),
    canonicalBrowserSurfaceRoutingFragment,
  );
  assert.equal(
    renderToolcraftBrowserSurfaceRoutingSummary({
      workflowPath: "docs/toolcraft/workflow.md",
    }),
    "For manual visual inspection, explicit user browser choice wins. Otherwise select from callable browser capabilities and use a browser surface embedded in the current agent host first, then another controlled surface embedded inside an agent host. A browser controller or MCP that opens or attaches to a standalone operating-system browser window is external even when callable by the agent; use it only when host-embedded surfaces are unavailable or incompatible, and record the concrete fallback reason. Never infer browser availability from product names or environment variables. Automated Toolcraft browser checks remain on the headless Playwright Test path and are not replaced by manual inspection. The complete routing and fallback contract lives in `docs/toolcraft/workflow.md`.",
  );
  assert.equal(
    getToolcraftBrowserSurfaceRoutingFragmentFailure({
      source: canonicalBrowserSurfaceRoutingFragment,
      label: "workflow fixture",
    }),
    null,
  );
});

test("browser surface routing rejects reordered, missing, and duplicate canonical sections", () => {
  const swappedSteps = canonicalBrowserSurfaceRoutingFragment
    .replace(
      "1. Use the host-embedded browser surface in the current agent environment, such as the Codex in-app Browser.",
      "3. Use the host-embedded browser surface in the current agent environment, such as the Codex in-app Browser.",
    )
    .replace(
      "3. Use a standalone external controlled browser only when all host-embedded surfaces are unavailable or incompatible, and record the concrete fallback reason in the worklog or verification narrative.",
      "1. Use a standalone external controlled browser only when all host-embedded surfaces are unavailable or incompatible, and record the concrete fallback reason in the worklog or verification narrative.",
    );

  assert.match(
    getToolcraftBrowserSurfaceRoutingFragmentFailure({
      source: swappedSteps,
      label: "workflow fixture",
    }),
    /workflow fixture browser surface routing fragment is out of sync/u,
  );
  assert.match(
    getToolcraftBrowserSurfaceRoutingFragmentFailure({
      source: canonicalBrowserSurfaceRoutingFragment.replace(
        `${toolcraftBrowserSurfaceRoutingMarker}\n\n`,
        "",
      ),
      label: "workflow fixture",
    }),
    /workflow fixture browser surface routing fragment is out of sync/u,
  );
  assert.match(
    getToolcraftBrowserSurfaceRoutingFragmentFailure({
      source: `${canonicalBrowserSurfaceRoutingFragment}\n\n## Manual Browser Surface Routing\n\n${toolcraftBrowserSurfaceRoutingMarker}`,
      label: "workflow fixture",
    }),
    /workflow fixture must contain one browser surface routing section/u,
  );
});

test("browser surface routing aggregates exact entry-document failures", () => {
  const agentsLabel = "AGENTS fixture";
  const workflowLabel = "workflow fixture";
  const workflowPath = "docs/toolcraft/workflow.md";
  const agentsSource = [
    toolcraftBrowserSurfaceRoutingMarker,
    renderToolcraftBrowserSurfaceRoutingSummary({ workflowPath }),
  ].join("\n\n");
  const validInput = {
    agents: [{ label: agentsLabel, source: agentsSource, workflowPath }],
    workflowLabel,
    workflowSource: canonicalBrowserSurfaceRoutingFragment,
  };

  assert.deepEqual(getToolcraftBrowserSurfaceRoutingFailures(validInput), []);
  assert.deepEqual(
    getToolcraftBrowserSurfaceRoutingFailures({
      ...validInput,
      agents: [
        {
          label: agentsLabel,
          source: agentsSource.replace("host-embedded-first", "changed"),
          workflowPath,
        },
      ],
    }),
    [`${agentsLabel} must include the canonical browser surface routing marker`],
  );
  assert.deepEqual(
    getToolcraftBrowserSurfaceRoutingFailures({
      ...validInput,
      agents: [
        {
          label: agentsLabel,
          source: agentsSource.replace("explicit user browser choice wins", "changed"),
          workflowPath,
        },
      ],
    }),
    [`${agentsLabel} must include the canonical browser surface routing summary`],
  );
  assert.deepEqual(
    getToolcraftBrowserSurfaceRoutingFailures({
      ...validInput,
      agents: [
        { label: agentsLabel, source: agentsSource, workflowPath },
        {
          label: "starter/AGENTS fixture",
          source: [
            toolcraftBrowserSurfaceRoutingMarker,
            renderToolcraftBrowserSurfaceRoutingSummary({
              workflowPath: "starter/docs/toolcraft/workflow.md",
            }),
          ].join("\n\n"),
          workflowPath: "starter/docs/toolcraft/workflow.md",
        },
      ],
      workflowSource: canonicalBrowserSurfaceRoutingFragment.replace(
        "host-embedded browser surface",
        "changed browser surface",
      ),
    }),
    [`${workflowLabel} browser surface routing fragment is out of sync`],
  );
});

async function createFixture(docs) {
  const projectRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "toolcraft-workflow-routes-"),
  );

  await Promise.all(
    Object.entries(docs).map(async ([relativePath, source]) => {
      const targetPath = path.join(
        projectRoot,
        "docs/toolcraft",
        relativePath,
      );
      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.writeFile(targetPath, source);
    }),
  );

  return projectRoot;
}

test("keeps the canonical workflow fragment, files, and phase budgets valid", async () => {
  const workflowSource = await fs.readFile(
    path.join(starterRoot, "docs/toolcraft/workflow.md"),
    "utf8",
  );
  const failures = await getToolcraftWorkflowRouteFailures({
    projectRoot: starterRoot,
    workflowSource,
  });

  assert.deepEqual(failures, []);
  assert.equal(toolcraftWorkflowPhaseLineBudget, 600);
  assert.equal(toolcraftWorkflowDocumentCharacterBudget, 40_000);
  assert.match(
    workflowSource,
    /Open exactly one listed document per terminal or tool read/u,
  );
  for (const phaseId of toolcraftWorkflowPhaseIds) {
    assert.ok(workflowSource.includes(`${phaseId[0].toUpperCase()}${phaseId.slice(1)} phase`));
  }

  const customControlRoute = toolcraftWorkflowRoutes.find(
    ({ id }) => id === "custom-controls",
  );
  assert.ok(customControlRoute);
  assert.deepEqual(customControlRoute.phases.implementation, [
    "custom-controls.md",
    "custom-control-visuals.md",
    "component-rules.md",
  ]);
});

test("rejects a workflow fragment that drifts from the route policy", async () => {
  const canonicalFragment = renderToolcraftWorkflowRouteFragment();
  const failures = await getToolcraftWorkflowRouteFailures({
    projectRoot: starterRoot,
    workflowSource: canonicalFragment.replace("App assembly", "Manual assembly"),
  });

  assert.ok(failures.some((failure) => failure.includes("out of sync")));
});

test("renders and validates alternate workflow presentations from the same routes", () => {
  const renderDocPath = (relativePath) =>
    `[${relativePath}](/docs/${relativePath.replace(/\.md$/u, "")})`;
  const fragment = renderToolcraftWorkflowRouteFragment(
    toolcraftWorkflowRoutes,
    { docSeparator: "<br />", renderDocPath },
  );

  assert.match(
    fragment,
    /\[core\/reference-study\.md\]\(\/docs\/core\/reference-study\)<br \/>\[core\/runtime-boundary\.md\]/u,
  );
  assert.equal(
    getToolcraftWorkflowRouteFragmentFailure({
      label: "website workflow",
      docSeparator: "<br />",
      renderDocPath,
      routes: toolcraftWorkflowRoutes,
      source: fragment,
    }),
    null,
  );
  assert.match(
    getToolcraftWorkflowRouteFragmentFailure({
      label: "website workflow",
      docSeparator: "<br />",
      renderDocPath,
      routes: toolcraftWorkflowRoutes,
      source: fragment.replace("App assembly", "Manual assembly"),
    }),
    /website workflow workflow route fragment is out of sync/u,
  );
});

test("rejects missing route documents", async (context) => {
  const projectRoot = await createFixture({ "present.md": "present\n" });
  context.after(() => fs.rm(projectRoot, { force: true, recursive: true }));
  const routes = defineFixtureRoute({
    plan: ["present.md"],
    implementation: ["missing.md"],
    verification: ["present.md"],
  });
  const failures = await getToolcraftWorkflowRouteFailures({
    projectRoot,
    workflowSource: renderToolcraftWorkflowRouteFragment(routes),
    routes,
    requiredDocPaths: ["present.md", "missing.md"],
  });

  assert.ok(
    failures.includes("workflow route document is missing: missing.md"),
  );
});

test("rejects required detailed documents that no workflow route reads", async (context) => {
  const projectRoot = await createFixture({
    "orphan.md": "orphan\n",
    "present.md": "present\n",
  });
  context.after(() => fs.rm(projectRoot, { force: true, recursive: true }));
  const routes = defineFixtureRoute({
    plan: ["present.md"],
    implementation: ["present.md"],
    verification: ["present.md"],
  });
  const failures = await getToolcraftWorkflowRouteFailures({
    projectRoot,
    workflowSource: renderToolcraftWorkflowRouteFragment(routes),
    routes,
    requiredDocPaths: ["present.md", "orphan.md"],
  });

  assert.ok(
    failures.includes("required workflow document is not routed: orphan.md"),
  );
});

test("rejects a route phase that exceeds its reading budget", async (context) => {
  const projectRoot = await createFixture({
    "long.md": "one\ntwo\nthree\nfour\nfive\n",
  });
  context.after(() => fs.rm(projectRoot, { force: true, recursive: true }));
  const routes = defineFixtureRoute({
    plan: ["long.md"],
    implementation: ["long.md"],
    verification: ["long.md"],
  });
  const failures = await getToolcraftWorkflowRouteFailures({
    projectRoot,
    workflowSource: renderToolcraftWorkflowRouteFragment(routes),
    routes,
    requiredDocPaths: ["long.md"],
    phaseLineBudget: 4,
  });

  assert.equal(
    failures.filter((failure) => failure.includes("budget is 4")).length,
    3,
  );
});

test("rejects an oversized individual document even when its phase line count is small", async (context) => {
  const projectRoot = await createFixture({
    "long-line.md": "1234567890\n",
  });
  context.after(() => fs.rm(projectRoot, { force: true, recursive: true }));
  const routes = defineFixtureRoute({
    plan: ["long-line.md"],
    implementation: ["long-line.md"],
    verification: ["long-line.md"],
  });
  const failures = await getToolcraftWorkflowRouteFailures({
    documentCharacterBudget: 8,
    phaseLineBudget: 10,
    projectRoot,
    requiredDocPaths: ["long-line.md"],
    routes,
    workflowSource: renderToolcraftWorkflowRouteFragment(routes),
  });

  assert.deepEqual(failures, [
    "workflow route document long-line.md is 11 characters; budget is 8",
  ]);
});
