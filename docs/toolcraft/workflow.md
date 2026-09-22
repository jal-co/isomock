# Toolcraft Workflow

<!-- toolcraft-performance-lifecycle: first-delivery=functional-complete; later-edits=focused-only; complaint=one-authority-targeted-performance-iteration; full-audit=explicit-only -->
<!-- toolcraft-performance-iteration: authority=exact-request-evidence+canonical-path-ids; fixture=reachable-development; after-pass=return-app-to-user+stop -->
<!-- toolcraft-performance-full-authority: automatic=forbidden; recommendation=two-compatible-iterations-or-broad-unlocalizable-problem; command=pnpm verify:perf; authority=explicit-user-request-or-accepted-offer -->
<!-- toolcraft-performance-routing: localized=agent-targeted; ambiguous=one-user-facing-choice; broad=offer-targeted-or-full; full=explicit-only -->
This file is the app-local routing layer for Toolcraft work. It does not replace the detailed contracts; it tells an agent which contract to read and which verification path to use before editing.

## Required Preflight

Before planning or editing app code, runtime code, controls, canvas, panels, renderer, timeline, layers, export, or tests:

1. Confirm the nearest `AGENTS.md` is the active project contract.
2. Classify the project type:
   - **Generated app**: use local `docs/toolcraft/*`.
   - **Starter source**: use `starter/AGENTS.md`, local starter docs, and runtime contracts.
   - **Runtime/template source**: use root `AGENTS.md` and runtime contracts.
3. Classify the task type.
4. Read the task-specific docs below.
5. Record whether this is first product delivery or later feature work, plus its focused development checks, before implementation.

Do not edit implementation files until this preflight is complete.

Renderer and performance work also completes this pre-code sequence: reachable controls and inputs; workload dimensions and enforced boundaries; pass cost, frequency, lifecycle, and invalidation; render-plan assessment and protected kernel benchmark when required; derived paths and combined fixtures. Development uses feature-focused functional and browser checks without minting delivery evidence. First delivery runs no measured performance; only exact request authority creates one targeted iteration. Full certification is a separate operator/CI action described in the canonical performance docs.

Renderer-provider version work follows [VGPU Provider Version Authority](renderer-technique.md#vgpu-provider-version-authority). The agent automatically resolves and verifies latest stable on first activation and records exact versions in the application's `toolcraft.rendererProviders.vgpu` metadata and lockfile. The version check is read-only. Existing applications never auto-update; a deliberate migration moves dependencies, lockfile, adapter and compatibility proof together. Routine activation and integration fixes require no user confirmation.

## Local Contract Authority

The signed local `AGENTS.md` plus `docs/toolcraft/*` are sufficient and mandatory workflow input for a standalone generated app. Use available skills only at the task's actual scale under the proportional planning policy below. Missing skills never invalidate `--no-skills` generation: continue with local reasoning, debugging and the relevant verification, without installing skills, restarting the session or adding spec/plan files solely for a ritual. `pnpm ai:check` enforces local code health and the product AST boundary only; it neither discovers nor validates workflow skill installations.

Core modules are required reading when listed by the routing table. Read each listed module fully, one phase at a time. Open exactly one listed document per terminal or tool read, even when several documents belong to the same route and phase. Do not concatenate documents or rely on a truncated excerpt; finish the current phase, then open the next phase when the work reaches it. The signed host and runtime validators enforce platform boundaries, while product organization remains open inside those boundaries.

## Proportional Planning And Autonomous Execution

This policy applies to building, porting, changing, fixing and reviewing Toolcraft apps and their shared source. Judge scale by behavior, coupling and unresolved design decisions, not by line count, verification tier, or the number of required checks.

- **Small, localized edits:** inspect the relevant owner, implement the requested change, and run focused checks. Do not create a written spec or implementation plan, propose ceremonial alternatives, or wait for approval. Examples include a label font change from 11px → 12px, a known spacing/token correction, or a bounded bug fix with an established behavior.
- **Substantial work:** a new multi-capability product, a cross-subsystem behavior change, a state/persistence migration, or a renderer redesign warrants a concise agent-owned implementation plan. State the concrete reason it is substantial; include necessary design decisions, affected owners, dependencies, risks and relevant checks in that one plan. A separate design document is not mandatory. If inspection reveals a substantial scope, announce it, write the plan, then continue without waiting for plan approval.
- **Read-only and plan-only requests:** inspection or review does not authorize implementation. If the user requests only a plan, provide the plan and stop; an explicit user-requested approval gate remains binding. Do not infer implementation permission from a request to diagnose.
- **Autonomous implementation:** a request to build, port, change or fix authorizes the necessary in-scope work. Choose a safe approach from the request, reference and existing contract; do not ask the user to approve an already specified value, review a spec, choose an execution method, or say “go ahead” again.
- **Questions and authority:** ask one concise question only when material ambiguity cannot be resolved from available evidence, an action is outside the authorized scope, or the user explicitly required approval. Planning never supplies permission for destructive actions, optional features, publication or external side effects. Existing explicit authority requirements, including optional export and performance work, remain unchanged.
- **Skill scope:** Generic workflow skills support this policy; they do not impose universal spec/plan files, repeated approval, visual-companion offers, extra worktrees, delegation, or an execution-choice ceremony. Use brainstorming for necessary design reasoning and writing-plans when substantial work warrants a plan (or the user asks for one); for small edits, skip their document and approval rituals. Missing skills use the local equivalent without installation or session restart solely for workflow compliance.

Plan phase is a contract-reading phase and does not require a plan document. Read the relevant contract before editing even for a small fix; do not expand a localized task into unrelated doc routes. A plan does not broaden verification: keep the existing first-delivery versus focused-later-edit lifecycle and request-authorized performance boundaries. Small edits need only a compact worklog entry, not rewritten product inventories or invented alternatives.

## Manual Browser Surface Routing

[//]: # (toolcraft-browser-surface-routing: explicit=user-choice; manual=host-embedded-first; fallback=host-embedded-then-external; external=standalone-os-browser; automated=headless-playwright)

Explicit user browser choice wins. Otherwise select from callable browser capabilities, never from product names, environment variables such as `CODEX_*`, installed executables, or guessed host identity.

Surface ownership defines the categories. A host-embedded browser renders inside an agent host. A standalone external browser opens or attaches to a separate operating-system browser window; a browser controller or MCP remains external even when callable by the agent.

For manual diagnosis, visual inspection, and user-visible preview, use this order:

1. Use the host-embedded browser surface in the current agent environment, such as the Codex in-app Browser.
2. If that surface is unavailable or incompatible with the required operation, use another controlled browser surface embedded inside an agent host.
3. Use a standalone external controlled browser only when all host-embedded surfaces are unavailable or incompatible, and record the concrete fallback reason in the worklog or verification narrative.

If the user explicitly names a browser or browser family, that choice is authoritative. If the named browser is unavailable, report that limitation instead of silently substituting another browser. Opening an uncontrolled system browser is allowed only for an explicit user-facing preview request; it cannot prove that the agent inspected the UI. If no controllable browser exists, report browser verification as unavailable and do not claim live inspection.

Automated Toolcraft browser checks remain on the headless Playwright Test path. The `test:feature`, `test:browser`, and `verify:delivery` scripts keep their existing projects, fixtures, reporters, budgets, and protected evidence behavior. A separately and explicitly requested headed debugging session remains diagnostic and does not alter those gates. Manual browser inspection supplements automated checks, never replaces them, and never mints protected evidence. A headless Playwright Test process is not an unwanted external browser window.

## Task Routing

Use the smallest route set that covers the changed surface. When a task matches multiple routes, process them sequentially inside the phase currently in progress and skip documents already read in that phase; open each document separately and never concatenate route documents into one terminal output. Read Plan documents before the spec or implementation plan, Implementation documents immediately before code, and Verification documents immediately before writing or running proof. A broken behavior still starts with the failing test, log, or reproduction before its Plan documents; a Figma task still starts with Figma MCP/design context.

[//]: # (toolcraft-workflow-routes:start)
| Task route | Plan phase | Implementation phase | Verification phase |
| --- | --- | --- | --- |
| Working attachments, diagnostics, file placement and cleanup | `core/development-files.md` | `core/development-files.md` | `core/development-files.md` |
| App assembly, route structure, generated app porting | `core/runtime-boundary.md`<br>`assembly-workflow.md` | `decision-contract.md` | `acceptance-testing.md` |
| Reference app study, audit, or port | `core/reference-study.md`<br>`core/runtime-boundary.md`<br>`assembly-workflow.md` | `schema-reference.md`<br>`decision-contract.md` | `acceptance-testing.md` |
| Schema, controls, defaults, persistence, actions | `core/control-selection.md`<br>`core/layout.md` | `schema-reference.md`<br>`component-rules.md` | `acceptance-testing.md` |
| Custom controls | `core/control-selection.md`<br>`core/layout.md` | `custom-controls.md`<br>`custom-control-visuals.md`<br>`component-rules.md` | `acceptance-testing.md` |
| Renderer, canvas output, visual technique | `core/runtime-boundary.md`<br>`core/performance.md` | `renderer-technique.md`<br>`performance.md` | `acceptance-testing.md` |
| Timeline, keyframes, animation transport | `core/timeline-animation.md`<br>`core/performance.md` | `decision-contract.md`<br>`component-rules.md` | `acceptance-testing.md` |
| Layers | `core/runtime-boundary.md`<br>`core/layout.md` | `decision-contract.md`<br>`component-rules.md` | `acceptance-testing.md` |
| Export, copy, media, background | `core/setup-export.md`<br>`core/media-upload.md` | `schema-reference.md`<br>`component-rules.md` | `acceptance-testing.md`<br>`performance.md` |
| Broken control, visual mismatch, failed build, export bug, performance issue | `decision-contract.md`<br>`core/runtime-boundary.md` | `component-rules.md`<br>`renderer-technique.md` | `acceptance-testing.md`<br>`performance.md` |
| Figma implementation | `core/reference-study.md`<br>`core/runtime-boundary.md`<br>`assembly-workflow.md` | `schema-reference.md`<br>`component-rules.md` | `acceptance-testing.md` |
[//]: # (toolcraft-workflow-routes:end)

## Worklog Gate

For product app work, update `docs/toolcraft/agent-worklog.md` before reporting completion. A small edit needs only a compact entry with the request, changed owner, result and focused checks; do not rewrite unchanged decisions or invent rejected alternatives. For first delivery and substantial work, record:

- one `Decision Trail` entry for each coherent user-visible delivery batch, including:
  - request;
  - task type;
  - user-visible result;
  - source/reference checked;
  - docs/contracts read and contract rules applied;
  - typed view interaction mode, evidence, and orientation target mapping when the product has a spatial scene;
  - typed interaction ownership for operations that could live on canvas or in the panel, including evidence, selected surface, rejected duplicate surface, and complementary operations;
  - decision;
  - alternatives rejected;
  - state/output mapping from controls, commands, timeline, layers, media, or renderer to the visible product;
  - first-delivery proof or later focused-check narrative;
  - risks or follow-ups.
- for localized performance work, or a post-clarification targeted choice, an exact request quote and the canonical affected performance path IDs; classifier output establishes complaint authority only, and unresolved localization records neither performance-iteration intent nor canonical path authority regardless of classifier result.
- updated high-level decisions for renderer, view interaction, interaction ownership, timeline, layers, controls, export, and performance when those choices change.

If the folder is still the neutral starter, do not invent product decisions. Once it becomes a product, switch the worklog to product mode and keep it concrete.

Protected receipts own first-delivery and performance proof. The worklog records which focused tests and browser checks were selected for later edits; those edits do not create another functional receipt.

### Development files

Follow [Development Files](core/development-files.md) for file ownership, durable assets, diagnostics and cleanup. Working browser artifacts belong in `.toolcraft/browser-artifacts/`, agent scratch inputs in `.toolcraft/scratch/`. After adding working files run `pnpm files:check`; `pnpm files:clean` previews old disposable files and `pnpm files:clean -- --apply` removes only eligible files in those two roots. Preserve text journals, reference studies, verification receipts and framework-owned `.toolcraft/tmp/` transactions.

### Text journal

Use `pnpm journal` for text-only recovery of requests, changes, commands, errors and retries. It adds no screenshots, videos or binary browser traces. `docs/agent-journal/changes/<changeId>.json` holds the request and decision; `.toolcraft/journal/runs/<runId>/run.json` and `events.jsonl` hold one attempt and its ordered stdout/stderr. These diagnostic files do not grant execution authority or replace protected receipts.

Create a change from a JSON file with `title`, `request: { text, messageRef }`, `owners`, `decision`, `result`, `checks`, `risks` and `status` (`open` or `complete`). Unknown optional text is `null`; original request text is preserved.

```sh
pnpm journal -- change --input /absolute/path/change.json
TOOLCRAFT_CHANGE_ID=<changeId> npm run test:feature -- <acceptance-id>
TOOLCRAFT_CHANGE_ID=<changeId> TOOLCRAFT_RETRY_OF=<failedRunId> npm run test:feature -- <acceptance-id>
pnpm journal -- show --change <changeId>
pnpm journal -- show --run <runId>
pnpm journal -- update --change <changeId> --revision 1 --input /absolute/path/updated-change.json
```

`test:feature` journals automatically, including preflight failures. Without a change ID it records `unlinked`; use explicit IDs for useful recovery and parallel tasks. Wrap other focused commands with `pnpm journal -- run --change <changeId> -- <executable> <arguments>`; add `--retry <failedRunId>` before the separator for a retry. Do not wrap an already journaled feature command merely to create another log. Arguments are passed directly without a shell. Never place secrets in command arguments or journal input.

`pnpm journal -- list` is the compact entry point. `running` means unfinished with an unknown outcome; it is never inferred to have passed after a crash. Output is limited to 16 MiB per attempt and omitted bytes are reported explicitly. Source fingerprints cover selected files and product entrypoints, with Git/dirty context; they are deliberately marked incomplete and do not claim a complete source snapshot. No full inventory/build is added for logging. Copy `docs/agent-journal` and `.toolcraft/journal` together when transferring history; the latter is ignored by Git. There is no automatic deletion of attempts.

Import a legacy worklog with `pnpm journal -- import`. It preserves the original worklog, creates a byte-exact archive, extracts separate records and writes `docs/agent-journal/README.md`. Source order and duplicate headings are preserved; historical timestamps, revisions and message references are not invented. On older generated apps use the upstream `starter/scripts/toolcraft-journal.mjs` with `--project <app-path>`; do not patch copied framework scripts. Re-importing the same source is idempotent.

`Verification` is human result text, including command output summaries; it never authorizes performance. New worklog entries use unique `Change ID` values and an explicit `Active change: <id>`. Missing performance intent means ordinary work. Legacy consistently numbered history can be read in either direction; misplaced entries, duplicated numbers and ambiguous order require repair or explicit selection. The performance request, exact quote and canonical paths remain separately validated. First-delivery receipts retain their existing meaning.


## Runtime Boundary

Use the runtime extension points described in the current contracts:

- schema controls;
- `canvasContent` for product output only;
- `controls.renderers` only for true custom controls;
- `actions.onPanelAction` for sticky product actions;
- runtime commands and hooks.

Do not recreate controls, panels, toolbar, timeline, layers, canvas shell, or runtime surfaces by hand. If a shared behavior is wrong, fix the shared runtime/template source and regenerate when needed.

Browser verification is outcome-based. Protected helpers attach versioned evidence only after a persistent observable change, an observed fixture application, a decoded non-empty export inspection, a completed output action, an immutable scenario measurement, and its matching budget check. The signed reporter derives required evidence from acceptance and performance config and fails skipped, missing, duplicate, transient, unmeasured, or unbudgeted scenarios.

## Automatic Delivery Lifecycle

The normal product loop is:

```text
assemble first product
→ focused functional feedback
→ one protected initial delivery
→ later edits with feature-focused checks only
→ user evaluation
```

Use the smallest focused unit and browser checks while implementation is changing. Do not rerun the aggregate, export, or performance matrix after edits. Use this automatic sequence:

1. **First product delivery:** the immutable initial delivery receipt is the lifecycle boundary. Before it exists, one complete bare `npm run verify:delivery` proves complete product contracts, performs one production build, runs full functional acceptance, and runs no measured performance.
2. **Later ordinary edits:** after the receipt exists, run the exact unit/component test for the changed implementation while developing. Run `npm run test:feature -- <acceptance-id>` once after the behavior is stable. On failure, diagnose the failed behavior and rerun only the failed acceptance ID. Multiple changed behaviors use multiple explicit IDs. Use `npm run test:feature -- --all` only when a cross-cutting functional edit cannot be honestly bounded to acceptance IDs; `--all` still means all product acceptance, not all Playwright tests. Do not automatically run typecheck, AI/code-health, build, raw full browser, delivery, export/reload/theme/DPR matrices, framework tests, benchmarks, or measured performance. Each conditional extra requires a direct reason tied to the changed behavior. Commit, push, deploy, preview, steering, and fixes do not authorize aggregate proof. A repeated bare `npm run verify:delivery` is a protected no-op that exits before inventory, build, tests, export, and performance work and preserves the initial receipt byte-for-byte.
3. **Localized or clarified targeted performance work:** only a localized complaint or a post-clarification targeted choice records domain authority in the worklog—an exact request quote plus canonical affected path IDs—and runs one bare `npm run verify:delivery`. It executes one targeted iteration against the reachable development fixture, returns the verified app, and waits for user evaluation. Classifier output alone never localizes a path; unresolved localization creates neither performance-iteration intent nor canonical path authority, whether classification returned high-confidence `performance-iteration` or `needs-agent-judgment`.
4. **Full audit:** only an explicit operator request or accepted offer authorizes `npm run verify:perf`. It performs one fresh build and the complete maximum-fixture performance matrix without replacing the initial delivery receipt.

Before the focused loader evaluates current product code, it runs the canonical product source boundary over the current product modules and their CSS/import relationships. This catches new control restyles, native-model substitutions and cross-file wrapper changes after the initial receipt. Framework modules supply import context; their implementation is not subjected to product-only authoring rules. This source check does not run code-health budgets, typecheck, a build, the global test catalog, delivery or performance verification. A boundary violation stops before Vite/product evaluation and reports its source location. All current product modules participate because an unchanged wrapper or CSS module can affect the edited component; no editable cache or new delivery receipt bypasses the check.

Focused feature verification uses one Vite source load and one Playwright process restricted to the selected file set to derive and run the declared browser descriptors. It does not use Playwright `--list` or global Playwright collection, and it never loads unrelated spec files. Selector roles come from the Control Section Inventory's required `finiteSelectors`: a selected `parameter` remains bounded to its own acceptance row, while a selected `branch` expands by fixed point only to acceptance rows for its exact `affectedTargets` and explicit `applicability` dependents. No section-wide finite-selector fanout exists. Complete catalog collection remains allowed for first delivery because that lifecycle must prove the full product.

Performance authority and localization are separate decisions. Classifier output establishes complaint authority only and never path localization. A localized complaint lets the agent select the affected canonical paths and run one targeted iteration without asking the user. For an ambiguous complaint, ask one user-facing question that names the visible operation and offers targeted diagnosis or a complete performance review; never ask the user to choose internal path IDs, and record no performance-iteration intent or canonical path authority before the answer. For a broad or honestly unlocalizable problem, the agent may recommend the complete performance review in that single targeted/full choice, but the user still chooses. A direct request for the complete performance review runs `npm run verify:perf` without another clarification.

Store agent-produced browser diagnostics under `.toolcraft/browser-artifacts/`. Browser integrations may instead use their external tool-owned storage; diagnostic files never belong in product source.

The proven-product phase guard runs before current-source inventory, integrity, build, tests, or semantic proof collection. The initial receipt remains the durable first-version identity even after later source edits. `workflow-observation.md` is a post-delivery summary, not execution authority; `agent-worklog.md` remains part of first-delivery inputs.

After two consecutive compatible targeted iterations, offer the slower full audit if the user remains unsatisfied. A complaint, filename, or touched subsystem never authorizes it. Canonical classification details, failure behavior, and evidence wording live in `core/performance.md` and `performance.md`.

The first product version is not complete when its required checks are failed, incomplete, pending, blocked, or listed as skipped. Later work is not complete until its directly relevant focused checks pass. Resolve benchmark requirements with the protected internal kernel check before accepting the renderer. The delivery runner executes initial or authority-backed performance proof atomically; ordinary later edits do not advance or replace the initial receipt. Product prose and command arguments cannot select or broaden performance proof.
