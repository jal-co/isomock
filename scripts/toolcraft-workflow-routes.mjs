export const toolcraftWorkflowPhaseIds = Object.freeze([
  "plan",
  "implementation",
  "verification",
]);

function defineRoute(route) {
  return Object.freeze({
    ...route,
    phases: Object.freeze(
      Object.fromEntries(
        toolcraftWorkflowPhaseIds.map((phaseId) => [
          phaseId,
          Object.freeze([...route.phases[phaseId]]),
        ]),
      ),
    ),
  });
}

export const toolcraftWorkflowRoutes = Object.freeze(
  [
    {
      id: "development-files",
      task: "Working attachments, diagnostics, file placement and cleanup",
      phases: {
        plan: ["core/development-files.md"],
        implementation: ["core/development-files.md"],
        verification: ["core/development-files.md"],
      },
    },
    {
      id: "app-assembly",
      task: "App assembly, route structure, generated app porting",
      phases: {
        plan: ["core/runtime-boundary.md", "assembly-workflow.md"],
        implementation: ["decision-contract.md"],
        verification: ["acceptance-testing.md"],
      },
    },
    {
      id: "reference-study",
      task: "Reference app study, audit, or port",
      phases: {
        plan: [
          "core/reference-study.md",
          "core/runtime-boundary.md",
          "assembly-workflow.md",
        ],
        implementation: ["schema-reference.md", "decision-contract.md"],
        verification: ["acceptance-testing.md"],
      },
    },
    {
      id: "schema-controls",
      task: "Schema, controls, defaults, persistence, actions",
      phases: {
        plan: ["core/control-selection.md", "core/layout.md"],
        implementation: ["schema-reference.md", "component-rules.md"],
        verification: ["acceptance-testing.md"],
      },
    },
    {
      id: "custom-controls",
      task: "Custom controls",
      phases: {
        plan: ["core/control-selection.md", "core/layout.md"],
        implementation: [
          "custom-controls.md",
          "custom-control-visuals.md",
          "component-rules.md",
        ],
        verification: ["acceptance-testing.md"],
      },
    },
    {
      id: "renderer-canvas",
      task: "Renderer, canvas output, visual technique",
      phases: {
        plan: ["core/runtime-boundary.md", "core/performance.md"],
        implementation: ["renderer-technique.md", "performance.md"],
        verification: ["acceptance-testing.md"],
      },
    },
    {
      id: "timeline-animation",
      task: "Timeline, keyframes, animation transport",
      phases: {
        plan: ["core/timeline-animation.md", "core/performance.md"],
        implementation: ["decision-contract.md", "component-rules.md"],
        verification: ["acceptance-testing.md"],
      },
    },
    {
      id: "layers",
      task: "Layers",
      phases: {
        plan: ["core/runtime-boundary.md", "core/layout.md"],
        implementation: ["decision-contract.md", "component-rules.md"],
        verification: ["acceptance-testing.md"],
      },
    },
    {
      id: "export-media",
      task: "Export, copy, media, background",
      phases: {
        plan: ["core/setup-export.md", "core/media-upload.md"],
        implementation: ["schema-reference.md", "component-rules.md"],
        verification: ["acceptance-testing.md", "performance.md"],
      },
    },
    {
      id: "debug-repair",
      task: "Broken control, visual mismatch, failed build, export bug, performance issue",
      phases: {
        plan: ["decision-contract.md", "core/runtime-boundary.md"],
        implementation: ["component-rules.md", "renderer-technique.md"],
        verification: ["acceptance-testing.md", "performance.md"],
      },
    },
    {
      id: "figma-implementation",
      task: "Figma implementation",
      phases: {
        plan: [
          "core/reference-study.md",
          "core/runtime-boundary.md",
          "assembly-workflow.md",
        ],
        implementation: ["schema-reference.md", "component-rules.md"],
        verification: ["acceptance-testing.md"],
      },
    },
  ].map(defineRoute),
);

export const toolcraftWorkflowRequiredDocPaths = Object.freeze(
  [
    ...new Set(
      toolcraftWorkflowRoutes.flatMap((route) =>
        toolcraftWorkflowPhaseIds.flatMap(
          (phaseId) => route.phases[phaseId],
        ),
      ),
    ),
  ].sort(),
);

export const toolcraftWorkflowRouteStartMarker =
  "[//]: # (toolcraft-workflow-routes:start)";
export const toolcraftWorkflowRouteEndMarker =
  "[//]: # (toolcraft-workflow-routes:end)";

export const toolcraftBrowserSurfaceRoutingMarker =
  "[//]: # (toolcraft-browser-surface-routing: explicit=user-choice; manual=host-embedded-first; fallback=host-embedded-then-external; external=standalone-os-browser; automated=headless-playwright)";

const toolcraftBrowserSurfaceRoutingHeading =
  "## Manual Browser Surface Routing";

export function renderToolcraftBrowserSurfaceRoutingFragment() {
  return `${toolcraftBrowserSurfaceRoutingHeading}

${toolcraftBrowserSurfaceRoutingMarker}

Explicit user browser choice wins. Otherwise select from callable browser capabilities, never from product names, environment variables such as \`CODEX_*\`, installed executables, or guessed host identity.

Surface ownership defines the categories. A host-embedded browser renders inside an agent host. A standalone external browser opens or attaches to a separate operating-system browser window; a browser controller or MCP remains external even when callable by the agent.

For manual diagnosis, visual inspection, and user-visible preview, use this order:

1. Use the host-embedded browser surface in the current agent environment, such as the Codex in-app Browser.
2. If that surface is unavailable or incompatible with the required operation, use another controlled browser surface embedded inside an agent host.
3. Use a standalone external controlled browser only when all host-embedded surfaces are unavailable or incompatible, and record the concrete fallback reason in the worklog or verification narrative.

If the user explicitly names a browser or browser family, that choice is authoritative. If the named browser is unavailable, report that limitation instead of silently substituting another browser. Opening an uncontrolled system browser is allowed only for an explicit user-facing preview request; it cannot prove that the agent inspected the UI. If no controllable browser exists, report browser verification as unavailable and do not claim live inspection.

Automated Toolcraft browser checks remain on the headless Playwright Test path. The \`test:feature\`, \`test:browser\`, and \`verify:delivery\` scripts keep their existing projects, fixtures, reporters, budgets, and protected evidence behavior. A separately and explicitly requested headed debugging session remains diagnostic and does not alter those gates. Manual browser inspection supplements automated checks, never replaces them, and never mints protected evidence. A headless Playwright Test process is not an unwanted external browser window.`;
}

export function renderToolcraftBrowserSurfaceRoutingSummary({ workflowPath }) {
  return `For manual visual inspection, explicit user browser choice wins. Otherwise select from callable browser capabilities and use a browser surface embedded in the current agent host first, then another controlled surface embedded inside an agent host. A browser controller or MCP that opens or attaches to a standalone operating-system browser window is external even when callable by the agent; use it only when host-embedded surfaces are unavailable or incompatible, and record the concrete fallback reason. Never infer browser availability from product names or environment variables. Automated Toolcraft browser checks remain on the headless Playwright Test path and are not replaced by manual inspection. The complete routing and fallback contract lives in \`${workflowPath}\`.`;
}

function getSingleMarkdownHeadingSection(source, heading) {
  const normalizedSource = source.replace(/\r\n/gu, "\n");
  const headingPattern = new RegExp(`^${heading}$`, "gmu");
  const headingMatches = [...normalizedSource.matchAll(headingPattern)];

  if (headingMatches.length !== 1) return null;

  const sectionStart = headingMatches[0].index;
  const nextHeadingMatch = /^## /gmu;
  nextHeadingMatch.lastIndex = sectionStart + heading.length;
  const nextHeading = nextHeadingMatch.exec(normalizedSource);
  const sectionEnd = nextHeading?.index;

  return normalizedSource.slice(sectionStart, sectionEnd).trimEnd();
}

export function getToolcraftBrowserSurfaceRoutingFragmentFailure({
  label = "docs/toolcraft/workflow.md",
  source,
}) {
  const actualFragment = getSingleMarkdownHeadingSection(
    source,
    toolcraftBrowserSurfaceRoutingHeading,
  );

  if (actualFragment === null) {
    return `${label} must contain one browser surface routing section`;
  }

  return actualFragment === renderToolcraftBrowserSurfaceRoutingFragment()
    ? null
    : `${label} browser surface routing fragment is out of sync`;
}

export function getToolcraftBrowserSurfaceRoutingFailures({
  agents,
  workflowLabel = "docs/toolcraft/workflow.md",
  workflowSource,
}) {
  const failures = [];

  for (const { label, source, workflowPath } of agents) {
    if (!source.includes(toolcraftBrowserSurfaceRoutingMarker)) {
      failures.push(
        `${label} must include the canonical browser surface routing marker`,
      );
    }

    if (
      !source.includes(
        renderToolcraftBrowserSurfaceRoutingSummary({ workflowPath }),
      )
    ) {
      failures.push(
        `${label} must include the canonical browser surface routing summary`,
      );
    }
  }

  const workflowFailure = getToolcraftBrowserSurfaceRoutingFragmentFailure({
    label: workflowLabel,
    source: workflowSource,
  });
  if (workflowFailure) failures.push(workflowFailure);

  return failures;
}

function renderLocalDocPath(relativePath) {
  return `\`${relativePath}\``;
}

function renderDocList(paths, renderDocPath, docSeparator) {
  return paths.map(renderDocPath).join(docSeparator);
}

export function renderToolcraftWorkflowRouteFragment(
  routes = toolcraftWorkflowRoutes,
  {
    docSeparator = "<br>",
    endMarker = toolcraftWorkflowRouteEndMarker,
    renderDocPath = renderLocalDocPath,
    startMarker = toolcraftWorkflowRouteStartMarker,
  } = {},
) {
  const lines = [
    startMarker,
    "| Task route | Plan phase | Implementation phase | Verification phase |",
    "| --- | --- | --- | --- |",
    ...routes.map(
      (route) =>
        `| ${route.task} | ${renderDocList(route.phases.plan, renderDocPath, docSeparator)} | ${renderDocList(route.phases.implementation, renderDocPath, docSeparator)} | ${renderDocList(route.phases.verification, renderDocPath, docSeparator)} |`,
    ),
    endMarker,
  ];

  return lines.join("\n");
}

export function getToolcraftWorkflowRouteFragmentFailure({
  docSeparator = "<br>",
  endMarker = toolcraftWorkflowRouteEndMarker,
  label = "docs/toolcraft/workflow.md",
  renderDocPath = renderLocalDocPath,
  routes = toolcraftWorkflowRoutes,
  source,
  startMarker = toolcraftWorkflowRouteStartMarker,
}) {
  const startIndex = source.indexOf(startMarker);
  const endIndex = source.indexOf(endMarker);
  const hasDuplicateStart =
    startIndex >= 0 &&
    source.indexOf(startMarker, startIndex + 1) >= 0;
  const hasDuplicateEnd =
    endIndex >= 0 &&
    source.indexOf(endMarker, endIndex + 1) >= 0;

  if (
    startIndex < 0 ||
    endIndex < startIndex ||
    hasDuplicateStart ||
    hasDuplicateEnd
  ) {
    return `${label} must contain one ordered workflow route fragment`;
  }

  const fragmentEnd = endIndex + endMarker.length;
  const actualFragment = source.slice(startIndex, fragmentEnd);
  const expectedFragment = renderToolcraftWorkflowRouteFragment(routes, {
    docSeparator,
    endMarker,
    renderDocPath,
    startMarker,
  });

  return actualFragment === expectedFragment
    ? null
    : `${label} workflow route fragment is out of sync`;
}
