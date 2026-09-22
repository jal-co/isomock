# Toolcraft Template Local Docs

This folder is the local operational reference for a standalone Toolcraft template app.

Use `../../AGENTS.md` as the entry contract, then read `workflow.md` before planning or editing app work. Use the remaining docs when a decision needs more detail:

The starter app itself is intentionally neutral. It should show the Toolcraft canvas/upload/toolbar baseline only until the product schema is authored. Demo controls, prompt inputs, layers, and timeline belong in tests/docs or in a real generated product that needs them.

## Core modules

`workflow.md` routes agents to these focused modules by Plan, Implementation, and Verification phase. Read each selected route sequentially within the current phase, skip repeated modules already read in that phase, and never rely on truncated terminal output.

- `core/runtime-boundary.md` — Toolcraft shell, allowed extension points, canvas boundary, and generated-app source boundary.
- `core/setup-export.md` — required Setup, canvas sizing, render scale, Timeline switch, Background, Image/SVG/Video Export, and sticky export actions.
- `core/control-selection.md` — built-in control fit, exact owners, compound controls, actions, collection actions, vector ownership, and custom control gate.
- `core/layout.md` — sections, dependency cohesion, headers, reset, spacing, dividers, labels, inline rows, actions layout, colors, select, and segmented fit.
- `core/media-upload.md` — file/image upload, multi-upload, sorting, transform actions, canvas source images, default assets, and source material behavior.
- `core/development-files.md` — durable assets, agent scratch and diagnostics, shared CLI exclusions, file checks and explicit cleanup.
- `core/app-cover.md` — required app-owned covers captured from real app compositions, their settings and Workspace registration.
- `core/timeline-animation.md` — animation intent, timeline requirement, compact/extended timeline, seamless forward loops, duration changes, keyframes, and video timing.
- `core/performance.md` — verification triggers, workload envelopes, compiled path fixtures, render scale, live slider responsiveness, renderer pipeline inventory, and optimization evidence.
- `core/reference-study.md` — reference-runtime clone, feature inventory, reference study, Figma source, video references, acceptance mapping, and worklog evidence.

The broad docs below remain supplementary topic references. They do not replace `workflow.md` routing or the `core/*` modules.

1. `workflow.md` — required preflight, task routing, worklog gate, and verification routing.
2. `assembly-workflow.md` — how the app must be assembled.
3. `decision-contract.md` — hard rules, defaults, heuristics, and escape hatches.
4. `schema-reference.md` — how to write `src/app/app-schema.ts`.
5. `component-rules.md` — component-specific layout and behavior rules.
6. `acceptance-testing.md` — how every visible entity proves it works.
7. `performance.md` — performance matrix and responsiveness gates.
8. `renderer-technique.md` — how GPU pass semantics create backend pressure, preview/export surfaces choose WebGL/WebGPU and a concrete provider, and opt-in provider setup, target-readback export, and bounded VGPU verification stay canonical.
9. `agent-worklog.md` — implementation decision trail, evidence, verification, and risks.
10. `custom-controls.md` — how to register custom controls without editing `src/toolcraft`.
11. `custom-control-visuals.md` — neutral token roles, state colors, area limits, geometry, focus, and contrast rules for product-owned custom control visuals.
12. `module-authoring.md` — framework capability ownership, common mechanisms, registration and extension proof fixtures.

Follow [Proportional Planning And Autonomous Execution](workflow.md#proportional-planning-and-autonomous-execution): small edits proceed without spec/plan files; substantial work gets a concise agent-owned plan followed by implementation without another approval gate. Explicit plan-only requests and authority boundaries still apply.

`agent-worklog.md` starts as a neutral starter template. Once the folder becomes a product, change it to `Mode: product`, add a `Decision Trail`, and record concrete product decisions under `workflow.md`. Later small edits use a compact entry with the request, changed owner, result and focused checks, without rewriting unchanged decisions or inventing alternatives. The first delivery receipt owns its complete plan and evidence; later entries record the focused checks actually run.

Use focused tests while implementation is changing. Protected functional delivery runs once for the first product version; steering and later fixes do not create another aggregate gate.

## Automatic Delivery Lifecycle

- **First product delivery:** bare `npm run verify:delivery` proves complete product contracts, performs one production build, runs full functional acceptance, and runs no measured performance. It preserves any independent performance baseline.
- **Later ordinary edits:** run only directly relevant feature tests and browser checks. A repeated bare command is a protected no-op that preserves the initial receipt.
- **Localized or clarified targeted work:** classifier output establishes complaint authority only and never path localization. Only a localized complaint or a post-clarification targeted choice records an exact request quote and canonical affected path IDs in the worklog, then one bare delivery runs one targeted iteration and returns the verified app for evaluation. Unresolved localization creates neither performance-iteration intent nor canonical path authority regardless of classifier result.
- **Adaptive complaint route:** a localized complaint lets the agent choose affected paths without a question; an ambiguous complaint gets one visible-operation choice between targeted diagnosis and a complete performance review; a broad problem may receive the same recommendation, while only an explicit request or accepted offer authorizes the full review.
- **Full audit:** only an explicit operator request or accepted offer authorizes `npm run verify:perf`, which performs one fresh build and the complete maximum-fixture performance matrix.

Use the current AI agent's controlled browser for targeted diagnosis and visual checks.

Performance workload limits come from reachable schema and enforced runtime/input boundaries. Targeted development and performance iterations use compiled development fixtures; operator full certification proves the applicable maximum without reducing selected quality or silently narrowing the product range.

The first product version is not delivered until `npm run verify:delivery` records its protected initial receipt. Later edits complete through directly relevant focused checks and do not mint another functional receipt. Filename, diagnostic classification, and touched subsystem never force the full audit. Protected receipts own initial and performance plans, reports, measurements, and pass/fail evidence.

Fresh folders or dependency changes need `npm install` before verification. First delivery starts the local app after the gate:

```bash
npm run verify:delivery
npm run dev
```

Do not kill existing local servers to free `3002` during a first start. Dev, preview, and browser verification prefer `3002`, then move to the next free port only while assigning this app's first saved port. After that, normal dev/preview starts use the saved port; if that port is already serving this app, report the existing URL instead of creating a second server. A launch is successful only after the selected port serves this app's Toolcraft server identity endpoint plus the `toolcraft-app-title` marker from `index.html`; never trust a port only because some server responds there. When restarting the same app server, use `pnpm dev:restart` or `pnpm preview:restart`; restart mode reuses the saved app port and stops only the listener on that exact port before starting again, forcing it only when the soft stop does not release the port, then verifies the identity before saving/reporting the port.
