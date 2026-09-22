# Toolcraft App Template Assembly Guide

<!-- toolcraft-performance-lifecycle: first-delivery=functional-complete; later-edits=focused-only; complaint=one-authority-targeted-performance-iteration; full-audit=explicit-only -->

This is a standalone Toolcraft template app generated from the base starter.

## Standalone by default

An ordinary request to build, port, or change an app means a standalone Toolcraft product. Do not introduce website-adapter work, install `@pixel-point/toolcraft-bridge`, `@pixel-point/toolcraft-workspace` or the separate `@toolcraft/toolbar`, create website entry points or mount registrations, or add Global/site controls as preparation for a possible future integration. The standard runtime toolbar remains part of the app.

## Required Preflight

Treat this `AGENTS.md` as the active project contract. Before planning or editing app code, runtime code, controls, canvas, panels, renderer, timeline, layers, export, or tests:

1. Read `docs/toolcraft/workflow.md` in full.
2. Select every task route that matches the requested surface.
3. Read the selected routes' Plan phase as contract context before implementation; it does not require a plan document. Use the proportional planning policy below to decide whether a written plan is warranted.
4. Read their Implementation phase immediately before editing code.
5. Read their Verification phase before writing or running proof.

Process matching routes sequentially within the current phase and skip repeated documents already read in that phase. Open exactly one listed document per terminal or tool read, including documents from the same route and phase. Do not concatenate multiple documents, routes, or phases into one large output, and never continue from truncated output. Choose and record one verification tier before first product delivery; for later edits record only the focused checks selected for the changed behavior. Do not edit implementation files until the Plan and Implementation preflight is complete.

## Quick Entry Contract

Runtime owns the evaluated finite/Infinity Background below runtime model/image layers; product output stays a transparent foreground and never recreates a bounded preview background. Compound `collectionActions` fields opt into keyframes individually with `keyframeable: true`; selectable collections declare one nullable `selectionTarget`, and panel/canvas code dispatches structured collection commands instead of encoding nested timeline addresses or mutating arrays.

1. Build through `defineToolcraft({ base, modules })` and `composeToolcraftApp(appSchema, ports)`; the signed route alone renders `ToolcraftApp`. Preserve the generated `app-defaults.json` import and `defaults: appDefaults` input; local Setup saves source defaults through the host-owned path in `docs/toolcraft/core/setup-export.md#save-app-defaults`.
2. Keep app state in Toolcraft runtime schema and commands.
3. Keep product output in `scene.canvasContent`; never render app UI there. The signed host owns `ToolcraftApp`, bootstrap, routes, global runtime styles, and one canonical product scene across finite and infinite modes; product code supplies ports only through `composeToolcraftApp`. `scene.sceneBoundsProvider` declares the product frame in both modes, finite mode shows the centered artboard boundary and clipping, and Infinity removes only their on-screen presentation and the size controls while preserving view, world frames, component/renderer identity, and live backing. Product export receives the same provider rect as live output; only finite mode may fall back to its artboard rect when no provider exists. Image source pixels and image scene geometry are distinct. Infinity never fits or clips generated graphics to the artboard; source generation/transforms and intermediate raster/filter/trace passes preserve actual content bounds, stroke/filter tails, sampling scale and origin in both modes. In editable-output products, every source/intermediate/preview pass declares `sceneBounds`: an authored finite domain (`intrinsic` with a reason) or content-derived bounds (`content` with overflow proof). Only an intentional artistic mask may clip product content. Prove overflow for processed output as well as raw geometry. Finite still export uses the saved centered artboard; Infinity still export uses the visible image/model/product composition, including renderer-declared overflow. Background affects fill only and remains independent of Infinity by default. Custom raster/WebGL output consumes `useToolcraftProductSceneFrame`. A preview-only environment that must fill the complete Infinity viewport uses `scene.infiniteCanvasContent`; it remains pointer-transparent and outside world transforms, scene bounds, and export. Model upload preserves supported authored appearance from standalone files, folders, and bounded ZIP packages; omit `modelPresentation` for runtime ownership and use checked consumers only for custom presentation. `scene.renderDefaultCanvasMedia: false` never hides runtime model layers. If upload/import is part of the source-material flow, do not invent canvas placeholder artwork, CTA copy, helper text, fake sample output, or preset source designs before real content exists.
4. Use built-in Toolcraft controls before custom controls. Product sliders with adjustable scales opt into typed `editableRange`; distinguish initial min/max from justified semantic hard limits, and follow `docs/toolcraft/core/slider-ranges.md`. Built-in values have one canonical runtime representation across defaults, live edits, persistence, settings import, and keyframes; product code consumes that representation and never decodes component callback payloads. Use `sourceCollection` when a source/runtime workflow owns array cardinality and users edit existing built-in item values; use `collectionActions` when users own add/remove cardinality. Any necessary custom UI follows the Design System Fit order in `docs/toolcraft/custom-controls.md`: reuse → extend → compose. Before controls or canvas interactions, declare typed `interactionOwnership`: user request, inspected reference, or product usability selects one primary surface for each operation; complementary operations may share related state, but canvas and panel must not mirror the same operation. Property edits declare `selectionScope` as global or selected-entity; selected-entity properties link to their selection owner and prove two-entity isolation. Every product also declares typed `viewInteraction` before renderer code; a visible editable spatial scene defaults to `orbit` and uses schema `orientationGizmo` plus runtime model-orbit interaction. Fixed or timeline-owned cameras require positive typed `authority`: either `explicit-user-request` with a verbatim `requestQuote`, or `inspected-behavioral-reference` with `referenceId` and observed interaction behavior. A still image, screenshot, or desired output frame may establish the default composition but never locked camera interaction.
5. Do not hand-compose runtime surfaces or render built-in control components directly in app code; use schema controls plus the `scene`, `controls`, `actions`, and `renderer` ports of `composeToolcraftApp`. Product code never imports modules below `src/toolcraft/ui/components/controls/**` or substitutes native `color`, `range`, `file`, `checkbox`, `radio`, `select`, or `textarea` value models for schema controls. Product artifact surfaces must correspond exactly to required `productReadiness.exportIntent`; SVG requests mean self-contained editable vectors and use `svgExportModule()` plus `scene.vectorFrameRenderer`, never raster bytes wrapped in SVG. Use `docs/toolcraft/core/setup-export.md` for the canonical export decision sequence.
6. Before writing controls, export `appControlSectionInventory`. Every product section declares stable `entityId`, human-readable `entity`, exact targets, and `groupingReason`. Explicitly user-requested application modes use one always-reachable selector in the first product section immediately after runtime Setup (Settings). Declare its `finiteSelectors` branch `productMode` with primary request evidence and exact `sharedTargets`; all other product controls directly gate on that mode, inactive controls and empty sections are absent, and hidden values are preserved. Follow `docs/toolcraft/core/layout.md#explicit-product-modes`; do not infer modes or add hidden scope state. Every product control explicitly declares `applicability` as `always` or `conditional`; inactive branches are absent. Every bounded finite selector is classified exactly once in the required `finiteSelectors` array as `branch` or `parameter`: a branch names the exact always-visible peer targets it affects, explicit applicability predicates add their dependents automatically, and a parameter proves its own accepted outcome without expanding unrelated controls. Predicate owners must be branches; continuous controls are absent from `finiteSelectors`, and the field remains required as `[]` when a section has no bounded selector. Ten declared controls is a non-blocking density-review threshold, not a section limit. Group by user task, dependency cohesion, and reset scope; inspect simultaneously visible controls and compound-editor complexity. A coherent section may exceed ten controls, and smaller entities may use justified workflow stages with the same entity identity, unique `workflowStage`, and concrete `splitReason`. Never split or merge solely to satisfy a count. Group by product meaning, never by UI component type or target namespace.
7. Keep control `label` short but semantically sufficient with the nearest visible section/group context, and put product-specific behavior help in schema `description`; runtime renders the label help tooltip only when that description adds meaning beyond the label.
   Spatial Vector pads must move the visible product feature in the direction of the gesture on both axes. Preserve canonical values; perform world/UV/sampling basis conversion once in the renderer. Use the protected `vector-screen-motion` browser recipe from `docs/toolcraft/acceptance-testing.md`; state changes and generic changed-image proof do not establish direction.
8. Enable Layers only when the user explicitly requests a workflow with layers. Multiple uploads or editable objects alone do not authorize `layersModule()`. Lab demonstration fixtures do not enable Layers in generated products. Enable timeline when product behavior requires it, then test the real UI. Product animation loops are seamless forward-only by default: first and last frames stitch, direction does not reverse, and mirror/yoyo/ping-pong behavior requires explicit user intent.
9. Animated preview renderers suspend or coalesce non-essential animation work during canvas drag, pan, pinch, zoom, and radar/center interactions, then resume without changing user playback state.
10. If a Figma URL is provided, inspect the Figma file through MCP and rebuild from its structure; never implement from a screenshot or by eye.
11. For every supplied video, GIF, screen recording, contact sheet, or extracted-frame sequence, register one typed `referenceInputs` item and run `npm run reference:study` before product code. Cover the dense evidence with complete phases, classify every detected event, map each behavior to acceptance plus browser `reference-parity`, and use `docs/toolcraft/core/reference-study.md` for the canonical command and evidence contract. Products without a motion reference declare `referenceInputs: []` and run no preprocessing.
12. Runtime workspace persistence is enabled locally by default: values, canvas, and panels are the base plan, while enabled timeline, layers, and media add their slices. `{ storage: "none" }` is the only opt-out and requires a recorded reason. Test exact resolved slices through a real reload; product code never writes localStorage or IndexedDB directly.
13. Generated apps follow the mandatory runtime Setup, Infinity canvas/finite canvas sizing, render scale, Timeline switch, Background, Image Export, Video Export, and sticky action rules in `docs/toolcraft/core/setup-export.md`. Do not duplicate or reinterpret those controls in app-authored sections.
14. Media uploads, image/file mode, source images, multi-upload sorting, default assets, and image transform actions follow `docs/toolcraft/core/media-upload.md`.
15. Keep `docs/toolcraft/agent-worklog.md` current with a decision trail, product decisions, explicit reference inputs, evidence, verification, and risks. Reference-runtime-clone apps also declare `referenceStudy` plus `referenceFeatureInventory` so every inspected reference feature has feature-level behavior evidence and maps to Toolcraft implementation and acceptance coverage.
16. Prove every visible entity through acceptance, browser, and performance coverage. Browser acceptance and performance pass only when protected helpers emit matching runtime evidence after successful assertions; source-code spelling and acceptance prose are not outcome authority. Control applicability derives case-scoped presence/absence and product-outcome evidence from declared branch `affectedTargets` plus explicit applicability dependents; parameters do not create peer cases. Background output keeps its fixed typed recipe. Raster products with `canvas.renderScale` declare `renderScaleCoverage` for interaction and steady state, plus playback when timeline is enabled, and prove real backing pixels with `canvas-render-scale-backing`; clamping quality is a functional failure without measured performance. Every measured path in a render-scale-enabled raster product proves actual CSS × devicePixelRatio × 2 backing after each measured phase. Generic acceptance outcomes prove command side effects only; use the fixed media, persistence, viewport, compound-control, layer, and timeline semantic recipes for specialized evidence.
17. Performance planning follows one sequence: reachable controls and inputs; workload dimensions and enforced boundaries; pass cost, frequency, lifecycle, and invalidation; render-plan assessment and protected kernel benchmark when required; derived paths and combined fixtures; targeted functional/browser development checks; first-delivery proof or request-authorized performance proof. Only exact request authority may create a measured targeted performance iteration. Details live in `docs/toolcraft/core/performance.md` and `docs/toolcraft/performance.md`.
18. Custom renderer apps compile one canonical `renderer.pipelineRegistration`, supply it through the `renderer.pipelineRegistration` port, reuse that registration as `rendererPipeline` in performance assessment, and derive paths and fixtures from it. GPU passes declare compute/render stage, storage-resource pressure, feedback state, and preview/export surfaces before renderer code; backend/provider is selected separately per `rendererTechnique.gpu` preview/export surface. New custom WebGPU uses provider `vgpu`, capability `shader-webgpu-vgpu`, and version policy `app-pinned`; `browser-compatibility`/`reference-parity` WebGL, native API gaps, reference runtimes, and runtime-owned providers are typed evidence exceptions. Each surface has one primary provider, and an unavailable path reports unsupported explicitly. The neutral starter has no registration, runtime provider, or fixture adapters.
19. Classify the first user-visible product delivery with a verification tier before editing and run the protected delivery gate once. After that first proof, ordinary edits use only the smallest feature-focused tests and browser checks; commit, push, deploy, preview, steering, and fixes do not create another aggregate delivery batch.

Renderer provider versions follow `docs/toolcraft/renderer-technique.md#vgpu-provider-version-authority`. Toolcraft stores a versionless descriptor. First activation automatically resolves latest stable, verifies it in isolation, installs exact app-local dependencies and lockfile, and records compatibility in `toolcraft.rendererProviders.vgpu`. Do not ask the user to select a version, approve installation or approve routine integration repairs. Fix adapter incompatibilities in source Toolcraft and regenerate. Existing apps stay pinned; never silently choose an older release or edit the catalog or compatibility record manually.

Export request provenance follows `docs/toolcraft/core/setup-export.md#primary-request-evidence`: inspect the original user message before planning optional export. Nondefault export decisions require structured `source: "user-message"`, `messageRef`, `messageText`, and exact `quote`; plans, summaries, and worklogs do not authorize SVG/video. Missing primary permission keeps optional export off, and later user exclusions override earlier evidence. Local structural validation does not authenticate chat authorship.

## Design System Fit

Inspect built-in schema controls and the public `@/toolcraft/ui` barrel before authoring product UI. Check complete public controls and composites before public primitives. Use the order reuse → extend → compose: reuse a semantic fit, extend the canonical monorepo owner and regenerate when a generally reusable capability is missing, or compose a product-specific interaction from public primitives. A local visual preference is insufficient reason to bypass a public owner. Never import private paths below `src/toolcraft/ui/components/**`, and do not hand-style standard controls, states, borders, radii, or spacing.

## Starter Baseline

Every product app requires an agent-created cover of a real composition produced by that app before first delivery or Website Workspace registration. Follow `docs/toolcraft/core/app-cover.md`: capture the actual output without editor UI, keep `app-cover.json`, the raster asset and reproducible cover settings in the app, and never substitute an unrelated illustration or a gallery lookup. The neutral starter has no product cover until its purpose and composition exist.

The generated folder starts as a neutral Toolcraft shell: canvas upload plus toolbar. It intentionally does not include demo controls, prompt fields, layers, or timeline. Do not treat test fixtures or documentation examples as product requirements. Add controls, timeline, sticky actions, and custom renderers only after the requested product or reference app requires them; add Layers only for an explicit user-requested layer workflow; base workspace persistence already exists.

When the folder becomes a real product, update `src/app/app-acceptance-data.ts` from `appProductReadiness.mode: "starter"` to `mode: "product"` and fill `productName`, `productSummary`, `requestedBehavior`, required typed `exportIntent`, typed `interactionOwnership`, and typed `viewInteraction`. Compare canvas and panel for each operation that could plausibly live on either surface. A visible editable 3D scene uses `orbit`; `fixed-camera` and `timeline-camera` require positive typed `authority` from a verbatim user request or an inspected behavioral reference. Static visual references cannot establish locked interaction. Renamed product folders are not allowed to keep neutral starter readiness.

## License

This project includes Toolcraft source code available under the MIT License in `LICENSE.md`. `NOTICE.md` explains that generated apps include Toolcraft runtime, starter, UI component, documentation, and template source code.

## Local Reference Docs

Use this `AGENTS.md` as the entry contract. Use local docs for detail; the app must remain buildable without the website.

- `docs/toolcraft/workflow.md` — required preflight, task routing, worklog gate, and verification routing.
- `docs/toolcraft/core/runtime-boundary.md`, `docs/toolcraft/core/setup-export.md`, `docs/toolcraft/core/control-selection.md`, `docs/toolcraft/core/layout.md`, `docs/toolcraft/core/media-upload.md`, `docs/toolcraft/core/timeline-animation.md`, `docs/toolcraft/core/performance.md`, `docs/toolcraft/core/reference-study.md` — focused core modules routed by `workflow.md`.
- `docs/toolcraft/assembly-workflow.md` — runtime assembly, canvas output, and reference clone path.
- `docs/toolcraft/decision-contract.md` — rule ids, levels, and enforcement expectations.
- `docs/toolcraft/schema-reference.md` — schema authoring rules for `src/app/app-schema.ts`.
- `docs/toolcraft/component-rules.md` — slider, segmented, color, upload, image picker, vector, orientation gizmo, layers, timeline, and footer action rules.
- `docs/toolcraft/acceptance-testing.md` — app entity matrix and browser acceptance for `src/app/app-acceptance-data.ts`.
- `docs/toolcraft/performance.md` — performance roles, scenarios, and workload coverage for `src/app/app-performance.ts`.
- `docs/toolcraft/renderer-technique.md` — DOM, SVG, Canvas 2D, WebGL, and mixed renderer choices.
- `docs/toolcraft/agent-worklog.md` — implementation decision trail, evidence, verification, and remaining risks.
- `docs/toolcraft/custom-controls.md` — custom control registration through `controls.renderers`.
- `docs/toolcraft/custom-control-visuals.md` — neutral tokens, state colors, geometry, focus, and contrast rules for product-owned custom control visuals.

## Edit Surface

- Build the product through `src/app/app-composition.tsx`, `src/app/app-schema.ts`, and any focused product-owned modules imported by that composition. Product module location under `src` is unrestricted; the AST boundary and code-health inventory scan every product production module regardless of folder.
- Do not edit the signed framework bootstrap: `index.html`, `src/main.tsx`, `src/router.tsx`, `src/routes/index.tsx`, `src/routes/root.tsx`, or `src/styles.css`. The protected route owns the `ToolcraftApp` host and its `className`.
- Product styles use locally imported `*.module.css` files only. Every selector is anchored by a local class. A first-compound `:is()` or `:where()` is a valid local anchor only when every branch is locally anchored; `:not()` and `:has()` do not create an anchor. Do not add plain product CSS, CSS `@import`, package CSS imports, `:global`, bare/root selectors, sibling escapes, selectors that target Toolcraft host attributes, or global `<style>`/`CSSStyleSheet` injection.
- Product `import()` and `require()` specifiers are statically resolvable. Computed module loading is rejected in production and product tests. Production modules do not import product tests, test-support modules, or protected browser-evidence internals, directly or through product bridges; use the protected public acceptance/performance helpers instead of emitting reserved evidence.
- Product production modules form an acyclic dependency graph. Code health resolves relative imports, directory indexes, configured TypeScript aliases, and local package exports; type-only, external-package, test, and copied-framework edges are excluded. A failure reports the complete shortest cycle so ownership can be repaired instead of hidden behind a barrel or alias.
- Root Vite, Vitest, Playwright, and TypeScript verification configuration is signed platform code. Do not add alternate config files whose names resolve to those protected config families.
- Keep `src/app/app-acceptance-data.ts` aligned with every visible product entity.
- Do not edit `src/app/app-acceptance.ts`, `src/app/acceptance`, supplied `app-acceptance.*` meta-tests, or the generic browser acceptance harness. They are framework-owned files covered by the signed integrity manifest; add product-specific Vitest and Playwright tests in separate app-owned files.
- Keep `src/app/app-performance.ts` as app-specific performance matrix config only.
- Use `e2e/app-kernel-benchmarks.ts` only for executable candidates required by `assessToolcraftRenderPlan`, then run protected `npm run verify:kernel`. Do not put authored timing evidence in product files.
- Do not paste, restore, or duplicate runtime validators inside `src/app/app-performance.ts`.
- Do not edit the generated contract files under `docs/toolcraft` or the generated `LICENSE.md` and `NOTICE.md`; they are framework-owned and covered by the signed integrity manifest. `docs/toolcraft/agent-worklog.md` is the explicit editable exception for product decisions and verification evidence.
- Do not edit `src/toolcraft`. It is an immutable signed copy of the shared Toolcraft runtime; change the monorepo runtime and regenerate the app instead.
- Before first product delivery, replace the starter worklog with `Mode: product`, add one `Decision Trail` entry per coherent user-visible delivery batch, and record concrete product decisions under `docs/toolcraft/workflow.md`. Later small edits need only a compact entry with the request, changed owner, result and focused checks; do not rewrite unchanged product decisions or invent alternatives. Protected receipts own first-delivery/performance plans and proof. `npm run test` fails if the worklog is missing, lacks the decision trail, or still describes the neutral starter.
- `npm run test` includes Toolcraft source integrity and local docs checks. If a desired control style is missing, fix the schema or regenerate from the upstream template/runtime; do not patch copied `src/toolcraft` files for one app.

## Decision Contract Rule IDs

These ids mirror `TOOLCRAFT_DECISION_CONTRACT` in `@/toolcraft/runtime`. Keep this list synced so standalone instructions do not drift from runtime validators.

[//]: # (toolcraft-contract:decision-rule-list:start)
- `runtime-shell-required`
- `canvas-no-app-ui`
- `canvas-surface-preserved`
- `infinity-canvas-scene-bounds`
- `canvas-handle-placement`
- `interaction-surface-ownership`
- `panel-host-behavior`
- `layers-enable-only-when-needed`
- `layers-enabled-behavior`
- `timeline-mode-choice`
- `timeline-enabled-behavior`
- `controls-product-coverage`
- `output-export-required`
- `controls-section-inventory-required`
- `controls-component-layout-invariants`
- `controls-layout-heuristics`
- `renderer-technique-inventory`
- `renderer-gpu-provider`
- `renderer-view-interaction`
- `model-appearance-presentation`
- `reference-clone-source-of-truth`
- `video-reference-analysis`
- `acceptance-product-observable`
- `performance-coverage-levels`
- `persistence-policy-explicit`
- `workflow-required`
[//]: # (toolcraft-contract:decision-rule-list:end)

## Runtime Contract

- Use `defineToolcraft({ base, modules })` from `@/toolcraft/runtime`.
- Export `appComposition = composeToolcraftApp(appSchema, ports)` from `src/app/app-composition.tsx`; never author the returned `ToolcraftAppComposition` object directly.
- Keep authored ports grouped under `scene`, `controls`, `actions`, and `renderer`, with optional custom `modelPresentation`; host `className` and `style` are not product extension points.
- Finite and infinite modes share the runtime-owned product scene from `scene.sceneBoundsProvider`; the finite artboard is only its clip/output boundary. Raster/WebGL renderers call `useToolcraftProductSceneFrame` for the canonical product rect and keep backing and renderer identity through mode changes; only a provider-less finite scene falls back to the artboard rect.
- Custom renderers use one compiled `renderer.pipelineRegistration` as the canonical declaration for runtime execution and new-envelope performance assessment. Product code receives only the disposal-free pipeline client through hooks and panel action context.
- Do not import `ToolcraftApp`, low-level runtime surfaces, built-in controls, or modules below `src/toolcraft/ui/components/controls/**` into product modules. Do not recreate schema control value models with native form elements. The signed host renders the shell; product modules use schema controls and supported composition fields.
- Use `scene.renderDefaultCanvasMedia: false` when a custom renderer replaces generic image/file preview. This flag does not suppress runtime model layers; use typed `modelPresentation` custom mode with checked consumers for declared model targets.
- Use `actions.onPanelAction` for non-export sticky footer product actions such as Generate, Apply, Copy, or Download. Typed image/video/SVG actions are module/runtime-owned and consume `scene.rasterFrameRenderer` or `scene.vectorFrameRenderer`.
- Product export renderers draw one deterministic scene-coordinate frame or append namespace-aware vector nodes and return/await their real work. Product modules never allocate export canvases/documents, choose encoders, serialize SVG, encode blobs, create download URLs, or duplicate runtime artifact composition.
- Keep final app behavior in the schema and runtime command bus, not in isolated local control state.
- For animated products, write an Animation Intent Inventory before coding: use top playback timeline for product transport, keyframes timeline for editable property animation, and no timeline only for explicitly autonomous decorative output with no video export. Any app with `Export Video` must enable the top Toolcraft timeline.
- For keyframes timeline apps, renderers read keyframed settings through Toolcraft evaluated-value helpers/hooks. Do not parse timeline `valueLabel` strings or read raw `state.values` for keyframed targets.
- Use schema `defaultValue` for every resettable control.
- Route editor-owned actions through runtime commands such as `controls.reset`, `media.import`, `media.delete`, `canvas.center`, `history.undo`, and `history.redo`.

## AI Workflow Skills And Local Fallback
[//]: # (toolcraft-browser-surface-routing: explicit=user-choice; manual=host-embedded-first; fallback=host-embedded-then-external; external=standalone-os-browser; automated=headless-playwright)

The signed local `AGENTS.md` and `docs/toolcraft/*` files are the mandatory workflow authority. Use the named workflow skills only when the proportional planning policy below calls for them; they are not a prerequisite for a standalone generated app to remain buildable and verifiable.

- Small, localized edits do not require a written spec or implementation plan: inspect the relevant owner, make the requested change, and run focused checks.
- For substantial work, use `brainstorming` for unresolved design decisions and use `writing-plans` for a concise implementation plan; then implement without waiting for plan approval. Keep necessary design decisions in that plan instead of mandating a separate spec.
- Explicit plan-only, review-only, or user-requested approval gates remain binding. Ask only for material ambiguity that cannot be resolved from the request/reference/contract, or for actions outside the authorized scope; otherwise choose the smallest safe in-scope approach and proceed.
- Before fixing any broken control, failed test, build failure, visual mismatch, export issue, or runtime regression, use `systematic-debugging` to find the root cause first.
- When the prompt includes a Figma URL, use Figma MCP/design context before implementation. Read the actual node, layer, component, variable, and asset structure; screenshots are only for final visual QA, not the source of truth.
- For manual visual inspection, explicit user browser choice wins. Otherwise select from callable browser capabilities and use a browser surface embedded in the current agent host first, then another controlled surface embedded inside an agent host. A browser controller or MCP that opens or attaches to a standalone operating-system browser window is external even when callable by the agent; use it only when host-embedded surfaces are unavailable or incompatible, and record the concrete fallback reason. Never infer browser availability from product names or environment variables. Automated Toolcraft browser checks remain on the headless Playwright Test path and are not replaced by manual inspection. The complete routing and fallback contract lives in `docs/toolcraft/workflow.md`.
- Use the available `browser` workflow to operate the selected surface. The default browser gate is `pnpm test:browser`; it excludes every Playwright test whose name contains `browser perf:`. Protected delivery owns exact targeted performance iterations. The complete matrix is reserved for the operator/CI `npm run verify:perf` command.
- Run `pnpm ai:check` before app generation or major changes. It enforces local code health and the product AST boundary. With an explicit `--no-install` generation the AST pass reports that it is deferred; normal `npm run test` and every final gate require installed dependencies and run the full boundary.
- If a workflow skill is missing or the app was generated with `--no-skills`, continue through the equivalent signed local workflow at the task's actual scale. Do not install skills or restart a session solely to satisfy a workflow ritual.
- Do not silently ignore a missing workflow capability: use the matching local requirement and note a material fallback briefly in the worklog, without creating a plan for a small edit.
- The Toolcraft app contract overrides generic brainstorming approval and visual-companion rituals, universal spec/plan requirements, execution-method questions, and mandatory extra worktrees or delegation. A request to build, port, change, or fix authorizes the necessary in-scope implementation and focused verification, not additional features or unrelated actions. Follow `docs/toolcraft/workflow.md#proportional-planning-and-autonomous-execution`.
- Do not ask the user to confirm decisions already covered by this contract, the prompt, or the reference app. Record only necessary decisions and continue.
- Do not ask whether to enable a browser companion during brainstorming. Browser verification is mandatory after the app runs locally.
- In standalone folders that are not git repositories, save spec/plan files without asking about commit requirements only when such documents are warranted; never create them for a small edit to satisfy a skill.

## Verification Tier Classifier

Before first delivery, write one short verification note. For later edits, use the same shape but list only directly relevant focused checks:

```md
Verification tier: Tier N
Reason: <changed surface and expected blast radius>
Run: <commands and browser checks>
Skip: <checks not needed for this pass and why>
```

Choose the tier by blast radius, not by line count. If uncertain, move one tier higher, not automatically to the full final gate.

| Tier                                          | Use When                                                                                                                                                                                                                                                                   | Required Checks                                                                                                                                                                                                                                                                   |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tier 0 — docs/copy                            | Documentation, comments, copy, labels, or titles change without schema targets, values, runtime behavior, renderer output, or layout mechanics.                                                                                                                            | Targeted docs/typecheck or targeted app test. Browser is not required unless visual text fitting is the risk.                                                                                                                                                                     |
| Tier 1 — local control presentation           | One control or panel visual state changes: spacing, hover, focus, disabled, marker visibility, label fit, or component variant display. Runtime state shape and product renderer are unchanged.                                                                            | Targeted unit/component test plus one focused browser check for the affected control or panel.                                                                                                                                                                                    |
| Tier 2 — schema/product behavior              | Controls, sections, defaults, persistence, panel actions, export actions, acceptance rows, or product behavior mapping changes.                                                                                                                                            | During development run relevant targeted tests and browser acceptance. Run bare `npm run verify:delivery` only when this is part of the first product delivery. Later edits stop after the focused checks pass.                                                                      |
| Tier 3 — renderer/canvas/runtime feature      | Custom renderer, animation loop, canvas sizing, upload/media, timeline, layers, toolbar, export bytes, WebGL/Canvas/SVG output, zoom, radar, history, heavy control behavior changes, or a post-generation iteration that touches renderer workload or viewport stability. | Run targeted functional and browser acceptance checks for the changed behavior. The tier and changed surface do not authorize measured performance. Run the protected delivery gate only for first product delivery or exact request-authorized performance work.                 |
| Tier 4 — first delivery/template architecture | Fresh generated app completion, folder export, dependency changes, runtime/template/contract/CLI changes, or broad first-product implementation.                                                                                                                           | Fresh folders run `npm install` once. Run `npm run verify:delivery` once when the first product version is ready, then start `npm run dev`. Later broad edits still use explicit focused checks for the affected features unless the user authorizes performance work or a full audit. |

Do not rerun `npm install` after every edit. Run it after fresh export, dependency changes, lockfile changes, or a missing package error.

Do not run the full browser performance suite for Tier 0-2 edits.

The immutable initial delivery receipt is the lifecycle boundary. Before it exists, first product delivery uses one complete bare `npm run verify:delivery` for product contracts, one production build, full functional acceptance, and zero measured performance. Once it exists, ordinary edits run only the smallest tests and browser checks for the feature being changed. A repeated bare `verify:delivery` exits before inventory, build, tests, export, and performance work and preserves the initial receipt. Classifier output establishes complaint authority only, never path localization. For a localized performance complaint, select affected canonical paths and run one targeted iteration without clarification. When localization remains unresolved, regardless of whether classification is high-confidence `performance-iteration` or `needs-agent-judgment`, ask one user-facing question naming visible operations and offering targeted diagnosis or a complete review; unresolved localization creates neither performance-iteration intent nor canonical path authority, and internal path IDs are never user choices. A broad or unlocalizable problem may justify recommending the complete review in that single choice, but the user still chooses; an explicit complete-review request runs `npm run verify:perf` directly. The canonical selection and evidence rules live in `docs/toolcraft/workflow.md`, `docs/toolcraft/acceptance-testing.md`, and `docs/toolcraft/performance.md`; do not duplicate their algorithm here.

Feature loops after the first working version run the exact unit/component test for the edited implementation while developing. Run `npm run test:feature -- <acceptance-id>` once after the behavior is stable. On failure, diagnose the failed behavior and rerun only the failed acceptance ID. Use explicit `npm run test:feature -- --all` only for a genuinely cross-cutting functional edit that cannot be bounded to acceptance IDs. Do not automatically run typecheck, AI/code-health, build, raw full browser, delivery, export/reload/theme/DPR matrices, framework tests, benchmarks, or measured performance. Each conditional extra requires a direct reason tied to the changed behavior. A repeated bare `verify:delivery` proves only that the initial receipt already exists and does not recollect semantic proof inputs.

Each browser acceptance row declares the exact browser descriptor `{ file, testName, budget }`. The protected budgets are `standard` at 30 seconds and semantic `extended-io` at 120 seconds; product code cannot set arbitrary timeouts. Focused verification performs one Vite source load and one Playwright process restricted to the selected file set. It does not use Playwright `--list`, capture a title catalog, or collect the global Playwright catalog. Complete catalog collection remains allowed for first delivery.

The first product version is not complete until bare `npm run verify:delivery` produces the protected initial receipt. Later feature work is complete when its directly relevant tests and browser checks pass; it does not mint another functional delivery receipt. Agent-controlled browser checks remain useful for targeted diagnosis and visual verification, but terminal prose cannot mint or upgrade performance evidence. Tier is human diagnostic vocabulary only and never grants performance execution authority.

## Required Checks

For the first product delivery, run:

```bash
npm run verify:delivery
npm run dev
```

The protected runner selects first-delivery functional proof, one localized-or-clarified targeted performance iteration, or the proven-product no-op. Ordinary later edits do not run it as a final gate. Classifier output alone never supplies path localization; unresolved localization creates neither performance-iteration intent nor canonical path authority regardless of classifier result. `npm run verify:perf` is the separate operator/CI full-audit command; run it only after an explicit user request or accepted agent offer, never as an inferred continuation of a complaint.

Use `npm install` before this final gate when the folder is fresh or dependencies changed.

`verify:delivery` runs the protected integrity checker directly and does not depend only on a mutable package script. `npm run test` includes local docs and app tests. The internal `pnpm test:browser` gate runs against the real app UI and product output but excludes Playwright tests whose names contain `browser perf:`. The protected full-audit path builds and serves the current production bundle, then runs the complete browser performance matrix sequentially so budgets exclude dev-server transformation and unrelated parallel e2e noise.

Do not stop or kill existing local servers to free a port during a first start. `npm run dev`, `pnpm preview`, and browser verification prefer port `3002`, but automatically move to the next free port only while assigning this app's first saved port. After a saved port exists, normal `npm run dev` / `pnpm preview` uses that same port; if that port is already serving this app, report that existing URL instead of starting a duplicate. Use `TOOLCRAFT_PORT`, `TOOLCRAFT_DEV_PORT`, or `TOOLCRAFT_TEST_PORT` only to change the preferred starting port before a saved port exists. A dev/preview launch is successful only after the selected port serves this app's Toolcraft server identity endpoint plus the `toolcraft-app-title` marker from `index.html`; never report a URL just because some server is listening there. When deliberately restarting this app server, use `pnpm dev:restart` or `pnpm preview:restart`; restart mode reuses the previously saved app port, stops the listener on that exact port if it is still running, force-stops it if it does not release the port, starts on the same port again, and verifies the identity before saving/reporting the port.

## App Completion Bar

The app is complete only when:

- the Toolcraft runtime shell is present;
- `scene.canvasContent` contains product output only;
- the runtime canvas backing remains visible behind product output;
- infinite product output uses the runtime-owned product scene surface, exact provider bounds, and real edge-pixel proof without clipping to dormant finite `canvas.size`;
- every product control declares explicit applicability, every non-matching finite branch hides it, and every visible finite branch proves product output or the accepted command side effect;
- reset returns schema controls to `defaultValue`;
- sticky footer export actions operate on final product output at `state.canvas.size`;
- artifact actions and settings correspond exactly to `productReadiness.exportIntent`; image export is the product default, SVG/video require explicit user-request evidence, and image removal requires explicit user-removal evidence;
- PNG export uses the background controls normalized into runtime Setup: `Background` beside `Infinity canvas`, then `Background color`; live preview hides product background when Background is off, and video keeps background;
- every PNG export includes `Image Export` format/resolution `select` controls; runtime resolves the selected settings and exact output size;
- products with both PNG and video export place `Image Export` immediately before `Video Export`;
- one shared `scene.rasterFrameRenderer` draws product pixels for image/video and a separate `scene.vectorFrameRenderer` appends editable vector content for SVG; runtime owns settings, scene crop, background, document/canvas allocation, validation, encoding/serialization, download, progress, and typed errors;
- layers are absent without an explicit user-requested layer workflow and fully working when enabled;
- timeline is absent, playback, keyframes, or custom reference timeline according to product behavior;
- performance checks cover workload and responsiveness for all relevant controls;
- detail-heavy or animated custom renderers pass real viewport drag and zoom stress checks;
- workload browser perf tests execute the compiled development or maximum fixture for the canonical derived path, apply every adapter value through the real UI, and observe every dimension before measurement;
- bounded numeric workload ranges and hard limits are derived from schema; scenario values cannot redefine them, custom metrics cannot bypass them, many-item fixtures apply at least 10 real items, and degraded ceilings prove every exact 10 percent step with matching scenario/target identity;
- browser tests verify upload/clear, controls, canvas sizing, toolbar, timeline/layers when enabled, sticky actions, output dimensions, and viewport stability.

Framework capability changes follow `docs/toolcraft/module-authoring.md`: implement them in the source runtime and regenerate this app; do not patch copied framework internals.

Development attachments, diagnostics and cleanup follow `docs/toolcraft/core/development-files.md`. Put agent diagnostics in `.toolcraft/browser-artifacts/` and temporary inputs in `.toolcraft/scratch/`; use `files:check` after adding working files and `files:clean` for an explicit cleanup preview. Never treat all `.toolcraft` contents as disposable.

Text-only change and run history follows `docs/toolcraft/workflow.md#text-journal`. Use `journal` for change IDs and command history; `test:feature` records attempts automatically. Bind runs with `TOOLCRAFT_CHANGE_ID` and retries with `TOOLCRAFT_RETRY_OF`. Journal text never grants performance authority.
