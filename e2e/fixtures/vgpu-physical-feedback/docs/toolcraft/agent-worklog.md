# Implementation Worklog

## Status

Mode: product

## Decisions

### Renderer
- Decision: Use WebGPU through the Toolcraft-pinned VGPU provider for preview and export.
- Reason: Compute, storage-texture feedback, and deterministic Node/browser execution create direct WebGPU pressure.
- Evidence: src/app/pipeline.ts, src/app/feedback-storage.ts, src/app/feedback-compute.ts, src/app/feedback-presentation.ts, src/app/feedback-canvas-lifecycle.ts, src/app/use-feedback-canvas-lifecycle.ts, src/app/use-physical-feedback-renderer.ts, src/app/feedback.wgsl, src/app/render.wgsl, and src/app/app-performance.ts.
- API seam: The catalog-pinned VGPU high-level `compute().set()` does not accept reflected storage-texture bindings, so only the storage-texture bind group and compute dispatch use the raw `GPUDevice` exposed by the same VGPU-owned `Gpu`. This limited seam creates neither a second device nor a native-provider fallback; VGPU still owns initialization, lifetime, textures, sampled rendering, browser state, and disposal.
- Preview presentation: The public Toolcraft `target-readback` adapter owns a retained VGPU `Target`, exact scene-frame sizing, serialized readback, committed backing evidence, and Canvas2D presentation to the visible runtime canvas. This avoids the catalog-pinned VGPU `CanvasSurface` losing its external instance on the second SwiftShader frame while keeping compute, render, target lifetime, and readback on the one VGPU provider. The final preview/export renderers are Canvas2D presentation surfaces, while their offscreen compute/render passes remain VGPU. Complete simulate-plus-destination jobs use one FIFO, viewport inputs coalesce before either pass, and resource disposal drains that queue before releasing presentation and compute. No native fallback, second device/provider, or dummy CanvasSurface is created.
- Generation ownership: A monotonic product lifecycle epoch advances on every Field disable/enable renderer generation and final retirement. Each preview captures the current epoch; destination work checks it, the public target-readback adapter checks it again after readback immediately before Canvas2D paint, and runtime ready/snapshot commits require the same epoch. Disabled cleanup captures its disabled epoch, so delayed retirement from an old generation cannot clear a newly enabled canvas. Deterministic deferred unit proof covers stale paint, evidence, and cleanup, while the browser teardown case repeats an immediate disable/re-enable overlap and requires the new renderer to become ready.
- Executable pass boundary: surface-specific uncached `preview-present` and `export-present` passes are outer logical operations. Inside the one FIFO, `resources` retains the one provider/storage owner, the matching uncached `*-simulate` pass performs compute for its truthful preview or export pixel domain, and `*-present` renders and paints before release. Preview runs `resources → preview-simulate → preview-present`; export runs `resources → export-simulate → export-present`. No mutable simulation resource escapes or crosses a surface cache. Storage/compute allocation is transactional, ownership clears before teardown, every disposal step is attempted in order, and failures are aggregated without making repeated disposal non-idempotent.
- Backing limit: Preview validates and rejects backing above its real 44,736,000-pixel interactive ceiling before GPU allocation while retaining the 256,000-pixel default. All simulation rejects any edge above 8,192 pixels or total above 44,736,512 pixels. The export ceiling equals the fixture's 8K 192:128 scene crop; neither boundary clamps render scale or output quality.

### View Interaction
- Decision: Use non-spatial view interaction.
- Reason: The physical field is two-dimensional and has no model camera.
- Evidence: appProductReadiness.viewInteraction.

### Interaction Ownership
- Decision: `field-toggle` owns `simulation.enabled` on the panel, `impulse-entry` owns `simulation.impulse` on the panel, `viewport-pan` owns runtime `canvas.setOffset` on the canvas, and `viewport-zoom` owns runtime `canvas.setViewport` on the canvas.
- Reason: The panel owns discoverable global field properties; the canvas owns continuous spatial navigation. No capability/target pair is mirrored across surfaces.
- Evidence: The typed inventory in `src/app/app-acceptance-data.ts` is linked one-to-one to `renderer.teardown`, `renderer.impulse`, `renderer.viewport`, and `renderer.viewport-zoom` acceptance rows.

### Timeline
- Decision: Use the standard two-second playback timeline as the single renderer clock.
- Reason: Backward time must reset and replay feedback from the same seed while forward time advances deterministically.
- Evidence: appTransferMode.animationIntent and src/app/app-composition.tsx.

### Layers
- Decision: Do not enable layers.
- Reason: The fixture edits one physical field output.
- Evidence: appSchema.panels.layers is omitted.

### Controls
- Decision: Use built-in switch and slider controls; `imageExportModule()` owns image settings and the export action.
- Reason: Field availability, impulse strength, and PNG delivery map directly to existing Toolcraft components.
- Evidence: src/app/app-schema.ts and appControlSectionInventory.

### Export
- Decision: Supply deterministic VGPU pixels through one runtime-owned image export action and the registered renderer pipeline only.
- Reason: Runtime owns scene cropping, image encoding, download, and typed failure while product export obtains its retained provider/storage exclusively through the pass context `getOrCreateResource`; a missing pipeline or Canvas2D context rejects deterministically and creates no fallback owner.
- Evidence: `composeToolcraftApp` receives `scene.rasterFrameRenderer` and `scene.sceneBoundsProvider`.

### Performance
- Decision: Declare the five-pass surface-specific resources/preview-compute/preview-present/export-compute/export-present VGPU pipeline, its Canvas2D final presentation surface, and bounded surface-pixel × replay-step workload without running measured performance.
- Reason: Initial delivery proves functional GPU output; measured performance remains separately authorized.
- Phase preparation boundary: Canonical path ids include `preparationInvalidates` separately from measured invalidation and retained access. Field disable lists only `preview-simulate` there because each cold/warm/sustained preparation restores one enabled settled preview before the baseline; resource and presentation changes are already declared by its measured invalidation. Prepared-boundary evidence allows those declared monotonic changes, requires equality outside the measured/preparation/retained sets, and still rejects any measured disable simulation.
- Authoritative settle and maximum boundary: The product adapter waits for exact operation-started/settled and retirement-started/settled generation equality before each baseline. Retirement started advances on enqueue, while a failure-recovering retirement FIFO advances settled monotonically only after every earlier cleanup completes, preventing false equality during overlap. The grouped canvas path prepares render scale 1 and acts to render scale 2 without toggling Infinity. Its full maximum proof keeps Field disabled, applies backing/replay fixtures in declared order, performs that real scale transition, and proves the compiled backing plus a transparent center pixel; resized disabled backing relies on the canvas bitmap reset while same-size cleanup clears explicitly. Canvas quality accepts the prepared 1x backing only until the first committed 2x observation and rejects any later regression. A separate bounded reachable cold/warm/sustained run executes real resources/simulate/present callbacks without collecting measured timing.
- Protected harness ownership: Maximum and grouped-canvas execution stays in the signed neutral `e2e/vgpu-performance-canvas-browser-case.ts` helper because it invokes protected fixture, pipeline, and runtime-evidence authorities. The closed product fixture supplies only its typed adapters and outcomes and never imports or bridges those reserved channels.
- Generation evidence parsing: Settlement and replay read every started/settled attribute through one strict reader. Only canonical non-negative safe-integer strings (`0` or a nonzero decimal without sign, whitespace, fraction, or leading zeros) are valid; missing or malformed attributes fail instead of coercing to generation zero or comparing as `null === null`.
- Evidence: src/app/app-performance.ts, src/app/feedback-pipeline-contract.ts, src/app/feedback-workload.ts, src/app/feedback-performance-fixture.ts, src/app/feedback-canvas-lifecycle.ts, and the generated e2e workload adapters. Compute cost is the product of the already-counted surface pixels and exactly one reset plus `min(24, floor(seconds × 12))` replay dispatches. The replay adapter exhaustively applies whole counts 1 through 25 through the editable timeline and observes the exact committed renderer step attribute, so development pressure cannot invent or round a fractional dispatch. Each compiled path receives only its own exact dimension applications. Initial render navigates freshly. The canonical browser lifecycle runs `preparePhase`, settles, records the pipeline before-snapshot/baseline, and only then runs the action. Fixture preparation restores Field disable/enable, Impulse, and Play baselines outside the action before each cold, warm, and sustained sample; Play ends paused with stable frame evidence, while Field disable retains a blank exact-backing Canvas2D quality surface and remains observable through persistent wrapper disposal generations after GPU cleanup. No GPU work continues disabled. A non-measured browser contract runs the same adapter hooks sequentially, including Impulse minimum-to-maximum behavior and canonical backing checks after every baseline and outcome. Its maximum proof disables Field before applying the ordered preview-backing and exact replay-step fixtures, observes the bounded visible canvas, and toggles background inclusion reversibly at that maximum. Preview presentation is linear in preview pixels; export presentation is linear in export pixels. The browser fixture applies and observes real Canvas width/height/render-scale backing and Infinity resolution. Infinity, aspect-ratio, width, height, render-scale, background, timeline, viewport, and export paths declare actual retained resource lookups separately from invalidation; protected evidence permits only a `resources` cache hit. Field disable retires resources and runs bounded preview-clear presentation; Field enable recreates resources and preview output; viewport activity runs no passes until release submits the current input.

## Decision Trail

### Delivery 1 - VGPU physical feedback compatibility
- Request: Prove an approved VGPU renderer through one generated Toolcraft app lifecycle.
- Task type: Renderer provider, physical shader fixture, export, browser evidence, and generated delivery.
- User-visible result: A two-color impulse and decay field renders on finite and Infinity canvas and exports its scene crop.
- Source/reference checked: Toolcraft GPU provider contract, the catalog-pinned VGPU package API, and Chromium upstream webgpu-swiftshader flags.
- Reference inputs: None.
- Docs/contracts read: renderer-technique.md, setup-export.md, workflow.md, acceptance-testing.md, and performance.md.
- Contract rules applied: renderer-gpu-provider, renderer-technique-inventory, infinity-canvas-scene-bounds, output-export-required, and workflow-required.
- View interaction intent: non-spatial; the field has no spatial model or camera.
- Interaction ownership: Panel `field-toggle` and `impulse-entry` own field availability and impulse; canvas `viewport-pan` and `viewport-zoom` own runtime pan/zoom; runtime owns timeline and export.
- Decision: Select WebGPU/VGPU because compute, feedback, and storage textures create typed WebGPU pressure for both surfaces.
- Alternatives rejected: WebGL without a browser/reference exception, native WebGPU outside a documented provider gap, and a parallel product-owned device cache.
- State/output mapping: Field and Impulse feed one retained renderer resource through surface-specific uncached simulation/presentation operations; Toolcraft timeline time resets/replays it on a committed 12 fps cadence; `useToolcraftProductSceneFrame` supplies live bounds; the public target-readback adapter commits VGPU pixels and actual backing to the visible Canvas2D; runtime export supplies artifact bounds through the safe queued `withExportTarget` path and publishes an exact visible `vgpu-export-*` status on failure.
- Performance intent: ordinary-product-work
- Verification: One bare `pnpm verify:delivery` will derive and run the protected proof.
- Risks: SwiftShader must expose navigator.gpu; the isolated unsupported case proves the typed unavailable path.

### Focused edit - pipeline-owned export and target presentation boundary
- Request: Remove product-owned export fallback lifecycle and keep every VGPU integration module within the Phase 2 size boundary.
- Task type: Focused VGPU export lifecycle and integration-module boundary correction.
- User-visible result: Preview/export pixels remain unchanged; export now rejects deterministic missing-pipeline/context misuse instead of constructing a second queue/provider/resource owner.
- Source/reference checked: Existing Phase 2 physical fixture, canonical VGPU provider/export adapter, and the Task 11 static review findings.
- Reference inputs: None.
- Docs/contracts read: renderer-technique.md, setup-export.md, workflow.md, and the approved VGPU provider design.
- Contract rules applied: renderer-gpu-provider, renderer-technique-inventory, output-export-required, and focused later-edit verification.
- View interaction intent: non-spatial and unchanged; the field has no spatial model or camera.
- Interaction ownership: Runtime image export owns the export action; the existing panel Field/Impulse and canvas viewport owners remain unchanged.
- Decision: Require the registered renderer pipeline/context for export and split target readback materialization from retained target coordination.
- Alternatives rejected: A product-owned fallback provider/resource queue and one oversized target-presentation module.
- State/output mapping: `feedback-export.ts` reaches retained feedback only through the registered resources pass context; `target-presentation.ts` retains target/provider/queue coordination, while `target-readback-materialization.ts` validates committed bytes and paints the visible Canvas2D output.
- Performance intent: ordinary-product-work
- Verification: One bare `pnpm verify:delivery` will derive and run the protected proof.
- Risks: None beyond the catalog-pinned API seams already recorded above.

### Focused edit - capability module assembly migration
- Request: Integrate the approved capability assembly API into the canonical physical feedback framework fixture without running the physical GPU compatibility story.
- Task type: Focused framework test-fixture schema, composition, and acceptance mapping migration.
- User-visible result: Image settings and the permanent image export action come from `imageExportModule()`; the two-second playback timeline comes from `timelineModule()`.
- Source/reference checked: Current module constructors, `composeToolcraftApp` named ports, the existing physical feedback fixture, and current canonical scene/background contracts. No excluded documentation branch inputs were used.
- Reference inputs: None.
- Docs/contracts read: workflow.md, core/runtime-boundary.md, assembly-workflow.md, decision-contract.md, core/setup-export.md, and acceptance-testing.md.
- Contract rules applied: runtime-shell-required, canvas-surface-preserved, infinity-canvas-scene-bounds, controls-section-inventory-required, output-export-required, and focused later-edit verification.
- View interaction intent: non-spatial and unchanged.
- Interaction ownership: Field and Impulse remain panel-owned; runtime owns timeline, background, viewport, and artifact delivery.
- Implementation plan: Migrate both schema definitions to `base`/`modules`; connect scene and renderer named ports; reconcile the module-owned image inventory and exact selector roles; then run source-level type, acceptance, and installer checks only.
- Decision: Preserve canonical scene bounds and enabled GPU passes verbatim. The product preview stays transparent so the runtime paints finite and Infinity backgrounds; raster export keeps the existing runtime background and decoded-pixel contract. The export action is always visible, including when Field is off. Disabled Field means no field contribution in preview or export: export returns without allocating resources, executing passes, or touching the runtime-painted destination. Field remains a branch only for the explicitly conditional Impulse control, and independent complete image export acceptance remains registered.
- Alternatives rejected: Compatibility aliases, duplicate authored image settings/actions, product-painted preview background, and retention of the obsolete conditional export footer behavior.
- State/output mapping: `base` retains Field, Impulse, Background, canvas defaults, and toolbar; modules supply image settings/actions and playback. `scene.rasterFrameRenderer`, `scene.sceneBoundsProvider`, and `renderer.pipelineRegistration` connect the existing export, canonical frame, and five-pass physical pipeline. Image inventory uses `runtime.image-export`; bounded selectors declare exact branch/parameter roles.
- Performance intent: ordinary-product-work
- Verification: The pre-migration source load reproduced `definition.modules is not iterable`. After migration, TypeScript reports zero diagnostics for schema, acceptance data, workload, and their complete dependency graph; all eight changed TS/TSX sources transpile; direct source loading confirms exactly image-export/timeline, two-second playback, one always-visible image action, and ten unchanged performance scenarios. Full acceptance validation returns no errors. All five fixture-installer contract tests pass. No delivery gate, browser, physical GPU execution, or measured performance ran.
- Disabled export regression: A focused mocked source-load test reproduced GPU execution while Field was disabled, then proved the early return leaves the destination untouched and executes no GPU work with background included or excluded. The installed fixture includes the matching mocked unit regression; enabled rendering still follows the unchanged GPU algorithm.
- Size-boundary ownership: `app-control-inventory.ts` owns the section and finite-selector inventory, reexported without copying through `app-acceptance-data.ts`. The disabled-export regression belongs to the existing operation-ownership test module. This extraction changes neither thresholds, algorithms, fixture values, nor test behavior. The four split sources transpile; the schema/acceptance/workload dependency graph has zero TypeScript diagnostics; full acceptance validation remains clean; and the updated closed-inventory installer tests pass 5/5.
- Risks: Physical browser pixels are not re-proved in this scoped migration; the existing compatibility browser story remains the physical-output authority.

### Compatibility delivery - verified provider updates
- Request: Certify the exact stable VGPU candidate and current adapter source before publishing a refreshed Toolcraft starter.
- Task type: Isolated first functional delivery of the canonical provider compatibility fixture.
- User-visible result: Candidate promotion requires correct translucent pixels, provider API compatibility, direct surface lifecycle, and the existing physical preview/export story.
- Source/reference checked: VGPU target/surface documentation, current public Toolcraft provider adapter, and the original physical feedback fixture.
- Reference inputs: None.
- Docs/contracts read: workflow.md, renderer-technique.md, core/runtime-boundary.md, core/performance.md, and acceptance-testing.md.
- Contract rules applied: renderer-gpu-provider, renderer-technique-inventory, output-export-required, and workflow-required.
- View interaction intent: non-spatial; no camera changes.
- Interaction ownership: Existing panel Field/Impulse, runtime timeline, background, canvas viewport, and image export owners remain unchanged.
- Decision: Keep straight-alpha bytes at target readback/Canvas2D boundaries; independently test the premultiplied public GPU surface. Preserve all earlier historical verification records.
- Alternatives rejected: Changing an approved version string without proof, inferring color correctness from changing hashes, or silently enabling measured performance.
- State/output mapping: The WGSL field output supplies straight RGB/alpha to target presentation and runtime export. Node pixels prove the analytic color and source-over result; the separate browser fixture proves direct surface frames, sizing, and disposal.
- Performance intent: ordinary-product-work
- Verification: One bare `pnpm verify:delivery` will derive and run the protected proof.
- Compatibility prerequisites: Focused adapter types, unit tests, and direct surface browser checks run before initial functional delivery. Direct surface proof uses the full Chromium headless channel: headless-shell reproduced an external-instance error, while full Chromium preserved color, second-frame output, resizing, and disposal.
- Risks: Physical tests require a working Node WebGPU adapter and Chromium software WebGPU. Any failed prerequisite or functional delivery rejects promotion; no fallback marks it successful.

## Evidence

- Source reviewed: typed pipeline inventory, provider and target-readback adapters, committed runtime evidence, WGSL validation, Node readback, browser pixels, scene export, and disposal evidence.
- Contract applied: exact pinned provider tuple, one provider per preview/export surface, no silent WebGL fallback, and no measured performance.
- Focused preflight: Fixture installer/runner units, generated TypeScript/provider API checks, generated Vitest product/runtime collection, deterministic stale-generation epoch/readback races, exact seven-scenario Playwright collection, concurrent preview/export FIFO, playing viewport coalescing, active-playback export, finite/Infinity/export/unsupported/disposal browser output, immediate disable/re-enable overlap, and reporter isolation passed before the protected delivery run.

## Verification

- First product delivery passed through the compatibility runner's one bare `pnpm verify:delivery`: product tests, build, neutral reload persistence, seven supplemental product acceptance scenarios, and all seven `browser vgpu:` scenarios completed successfully. The follow-up canonical target-readback boundary is re-proved by the same one generated compatibility story before release.
- Later feature work uses only focused unit and browser checks for the edited behavior.
- A localized performance complaint is diagnosed against its visible interaction before any measured run.
- A complete performance review runs `pnpm verify:perf` only when explicitly requested.
- Only exact request authority permits measured targeted performance work.

## Risks

- Risk: Software WebGPU availability is checked before protected browser assertions begin.
- Risk: The catalog-pinned VGPU high-level storage-texture and `CanvasSurface` gaps are intentionally bounded to the documented same-device compute seam and public retained target-readback presentation; removing either boundary requires repeating the compatibility story against the updated pinned provider.
