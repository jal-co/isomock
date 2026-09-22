# Performance

<!-- toolcraft-performance-lifecycle: first-delivery=functional-complete; later-edits=focused-only; complaint=one-authority-targeted-performance-iteration; full-audit=explicit-only -->
<!-- toolcraft-performance-iteration: authority=exact-request-evidence+canonical-path-ids; fixture=reachable-development; after-pass=return-app-to-user+stop -->
<!-- toolcraft-performance-full-authority: automatic=forbidden; recommendation=two-compatible-iterations-or-broad-unlocalizable-problem; command=pnpm verify:perf; authority=explicit-user-request-or-accepted-offer -->
<!-- toolcraft-performance-routing: localized=agent-targeted; ambiguous=one-user-facing-choice; broad=offer-targeted-or-full; full=explicit-only -->

Read this module before changing renderer technique, animation, canvas, media, export, render scale, workload controls, or performance tests.

## Normative Sequence

Use this order for every product:

1. Reachable controls and inputs.
2. Workload dimensions and enforced boundaries.
3. Pass cost, frequency, lifecycle, and invalidation.
4. Render-plan assessment and capture of any protected kernel benchmark requirement.
5. Derived paths and combined fixtures.
6. Targeted functional and browser development checks.
7. Lifecycle-appropriate proof: complete first-delivery functional proof with no measured performance, later feature-focused checks only, or one authority-backed targeted performance iteration. Full certification is a separate explicit operator/CI action.

Do not begin renderer implementation before steps 1-4 are represented in typed configuration and the render-plan assessment has no structural errors. An unresolved kernel benchmark requirement remains explicit pending work; first delivery defers it without weakening envelope, pipeline, path, fixture, or adapter validation. Later edits run the focused structural tests for what they change.

## Envelope

- Inventory every reachable schema control, runtime-state input, and external input.
- Mark workload controls explicitly with `performanceRole: "workload"`; never infer workload from labels, target names, units, option text, or keywords.
- Map every workload role to exactly one numeric `workloadEnvelope` dimension.
- Each dimension declares a stable id, unit, source, mapping, `defaultValue`, and every applicable `interactiveMax` or `batchMax`.
- `interactiveMax` and `batchMax` mean maximum workload for that profile, not the numerically largest value. A numeric `schema-target` source declares `workloadBoundary: "minimum" | "maximum"`; every declared profile boundary equals that selected schema endpoint. A lower endpoint is valid when smaller values create more work.
- Declare only boundaries consumed by passes of that profile. A control may change a batch-only dimension without claiming an `interactiveMax` when interactive passes do not consume it.
- Schema-backed limits equal schema limits. Other limits equal enforced runtime or input boundaries.
- Slider and range controls use their effective numeric domain. Any other schema control is numeric only when it declares a complete finite `min`, `max`, and numeric `defaultValue`; partial, inverted, or out-of-range domains fail validation instead of being guessed from the control type.
- The neutral starter declares `workloadEnvelope: { dimensions: [] }` and omits `fixtureAdapters`.

## Render Plan

Custom renderers declare `rendererPipeline.runtimeId`, passes, and exact interaction invalidation before renderer code. Every pass declares:

- workload dimensions and cost relationship;
- execution frequency;
- lifecycle and resource scope;
- execution location and output quality;
- concrete inputs, invalidators, and cache keys where applicable.

Include `initial-render` and every reachable interaction that executes or intentionally avoids renderer work. Run `assessToolcraftRenderPlan` and resolve every structural error. If it returns a benchmark requirement, keep that requirement pending during functional work and delivery. Declare `kernelBenchmarkDecisions`, implement only their executable candidates in `e2e/app-kernel-benchmarks.ts`, and run protected `npm run verify:kernel` only inside an exact request-authorized performance iteration or explicit full audit. The protected runner measures the exact workload, verifies equal deterministic full-quality output, and records a current-source receipt; authored timing values are invalid. High-frequency variable-cost pixel-transform, rasterize, and composite passes compare a Canvas 2D baseline with WebGL, independent of the already-selected execution location; WebGPU joins the comparison only when it is the selected implementation.

## Compiled Fixtures And Paths

- Derive paths with `deriveToolcraftPerformancePaths`; never author path ids by hand.
- Declare exactly one scenario for each canonical path. The scenario uses that path's `pathId` and exact `coversTargets`; do not create one scenario per equivalent control.
- Equivalent controls share a path when interaction, invalidated passes, execution locations, workload dimensions, and profile are equal.
- Register one `fixtureAdapters.dimensions` adapter per envelope dimension. Each adapter only applies and observes exact numeric values; envelope boundaries and central path profiles remain the sole sources of load and budget policy.
- Finite inputs use an `exhaustive-discrete` entries domain that binds each numeric workload value to the product value actually applied. Schema `select` and `segmented` domains match all schema options one-to-one; other finite sources carry exhaustive provenance aligned with the dimension source.
- A development checkpoint moves from each `defaultValue` toward its declared maximum-workload boundary, including numerically downward ranges. It is available only when the combined vector has exact normalized development pressure `0.8` within the runtime tolerance. For discrete dimensions every value must also belong to the exhaustive domain; otherwise development is unavailable. Maximum remains independently available and execution observes every applied value exactly. Inverse checkpoints use the same domain.
- Discrete path search is deterministic and lazy. The runtime-owned `toolcraftDiscreteDimensionBudget` is 256 searched dimensions and `toolcraftDiscreteCombinationBudget` is 4096 combinations. Dimension overflow, cardinality overflow, or a path above either budget is an actionable planning error, not an unavailable exact vector. A valid exact inverse checkpoint for a custom or benchmark development path bypasses search budgets because no search runs, while its full vector still requires exhaustive-domain membership and exact normalized pressure `0.8` within tolerance.
- Compile development and maximum vectors with `compileToolcraftPerformanceFixturePlan`.
- Combined fixtures include every dimension on the path.
- Add measured inverse full-vector evidence only when a dimension mapping is `custom` or a pass relationship is `benchmark`.
- Performance profile names and budgets come from the runtime-owned profile manifest shared by runtime validation and generated runners. Product scenarios and copied scripts do not redefine those thresholds.

Browser checks apply compiled values through the real UI, observe every dimension, exercise the real preview or export path, assert the product result, and then check the budget. Export scenarios keep exact `actionValue`, visible `controlLabel`, and `completionEvidence` proof.

Selected image/SVG/video dimensions, decoded output quality, strict SVG validity/vector policy, video duration, and exact 30 FPS packet cadence are functional correctness and never require measured performance authority. Export completion latency and UI responsiveness are measured only for a user-authorized targeted iteration or explicit full audit.

## Verification Triggers

Design product module boundaries so ordinary later edits can run one focused feature test without loading unrelated product areas. Keep frequently changed defaults and domain logic outside the public `app-schema.ts` assembly module when their acceptance coverage is narrower. This organization improves feedback speed but never authorizes measured performance. For raster zoom, prefer viewport transforms, but when exact render-scale backing requires rerasterization, declare one off-main `rasterize` pass with `quality: "retina"` owned by `viewport-zoom`. No other expensive viewport invalidation is accepted.

Performance adapters measure one primary user operation per phase; do not include an inverse cleanup action inside the measured operation. Non-animation interaction probes retain at least 20 post-action frames so nearest-rank p95 is statistically distinct from the maximum frame without weakening either threshold.

Performance-adapter-only changes run code health and directly affected unit proof, but do not infer measurement. Their path candidates become executable only through exact complaint authority or an explicit full audit.

Run targeted functional and browser checks during development. Only exact request authority can create a measured targeted performance iteration; a changed pipeline, workload boundary, adapter, interaction, measured output, owner, pass, path, filename, tier, or subsystem cannot. During an authorized iteration, the targeted Playwright reporter binds passed test names, pass ids, canonical path ids, nonce, and current source hash; product code and prose cannot mint that evidence.

Functional performance coverage uses the runtime-owned deferred validation policy: all structural envelope, renderer pipeline, path, fixture, and adapter errors still fail, while unresolved kernel benchmark decisions remain visible as pending assessment requirements and require no kernel receipt. Strict/default validation and every authorized performance run continue to require the decision and protected current-source evidence.

Targeted performance iteration verification requests the compiled development fixture at exact normalized pressure `0.8`. Each selected path must have its exact reachable development fixture or verification fails with a configuration error; it never falls back to maximum. The separate operator/CI certification command uses compiled maximum fixtures across the complete current matrix.

The protected conversational lifecycle is automatic:

- **First product delivery:** bare `npm run verify:delivery` runs complete product contracts, one production build, and full functional acceptance with no measured performance. It preserves any independent full-performance baseline and cannot claim targeted or full performance evidence.
- **Later ordinary edits:** run only the tests and browser checks directly relevant to the edited feature. A repeated bare command is a protected no-op that preserves the initial receipt and performance checkpoints and cannot silently invoke measured performance.
- **Localized or clarified targeted work:** only a localized complaint or a post-clarification targeted choice records domain authority in the latest Decision Trail—an exact request quote and canonical affected path IDs—then one bare `npm run verify:delivery` runs one targeted iteration against the reachable development fixture. Classifier output establishes complaint authority only and never path localization. Any unresolved localization creates neither performance-iteration intent nor canonical path authority, whether classification returned high-confidence `performance-iteration` or `needs-agent-judgment`. The same authority cannot produce a second successful iteration. Deliver the verified app, then stop and wait for user evaluation. Each later localized request may create one new bounded iteration from the immediately previous successful delivery.

Request classification is tri-state. High-confidence performance language returns `performance-iteration`; high-confidence ordinary product work remains ordinary; ambiguous or unrecognized language becomes `needs-agent-judgment`, and the AI decides from the complete request. Classifier output establishes complaint authority only and never path localization. A localized complaint lets the agent select affected canonical paths and run one targeted iteration without asking the user. For an ambiguous complaint, ask one user-facing question naming visible operations and offering targeted diagnosis or a complete performance review; never ask the user for internal path IDs, and create neither performance-iteration intent nor canonical path authority before the answer. A broad or honestly unlocalizable problem may lead to that single targeted/full choice with a recommendation for complete performance review, but the user still chooses. An explicit complete-performance-review request runs `npm run verify:perf` directly. Local negation and product commands are interpreted in their own clause rather than through a global phrase list. Before a performance iteration, the worklog must contain a nontrivial exact raw substring of Request as evidence. Whitespace and Unicode code units must match exactly; invented, whitespace-collapsed, NFKC-equivalent, or otherwise mismatched text is rejected. Complaint wording, repetition, filename, diagnostic classification, and touched subsystem never launch the complete matrix automatically.

Store agent-produced browser diagnostics under `.toolcraft/browser-artifacts/`, or use external tool-owned storage when the browser integration owns the artifact. Diagnostics never become product source or performance authority.

Every protected targeted performance report stores the independently validated `cold`, `warm`, and `sustained` numeric observations for each selected canonical path. When the immediately previous successful delivery contains compatible targeted measurements, the next complaint records metric deltas against that report; otherwise it records an explicit non-comparable result. Deltas are diagnostic evidence, not a noisy strict-improvement gate: the current iteration must pass its absolute profile budgets, then return to the user without launching another optimization pass.

Use `npm run verify:delivery` for first product delivery and authority-backed targeted performance iterations, not as an ordinary later edit boundary. A targeted failure starts targeted diagnosis and architecture repair; it does not automatically expand into the full suite. After the selected evidence passes, return the app to the user instead of continuing speculative optimization. When two consecutive compatible protected performance iterations have passed, the runner emits an evidence-backed recommendation and the agent must offer the user a slower complete audit if performance remains unacceptable. A demonstrably broad or unlocalizable cross-system problem may justify the same offer earlier through agent judgment; a path-count threshold is not authority.

`npm run verify:perf` is the single protected operator/CI full-audit command: it performs one fresh production build, runs maximum fixtures across every canonical path, writes `full-performance` evidence, and creates or refreshes the durable baseline without advancing the delivery anchor. It runs only after an explicit natural-language request for the complete audit or explicit acceptance of the agent's offer; the user does not need to know the command name. A complaint, repeated complaint, filename, diagnostic classification, or changed subsystem alone never authorizes it. The full audit is diagnostic and certification evidence, not an automatic optimization loop: repair failed paths with focused checks, then run the complete matrix once at the requested certification boundary.

`TOOLCRAFT_PERFORMANCE_VERIFICATION_LIFECYCLE` is runtime-owned: protected Playwright owns functional, performance-iteration, and operator full-certification receipts. Product config cannot override this lifecycle.

Completion wording must name the evidence level. Functional delivery reports functional proof only and states that measured performance was not run. A performance iteration reports only its exact targeted proof and asks the user to evaluate the verified app. After the second consecutive compatible iteration it also offers the slower complete audit without launching it. Never describe targeted iteration evidence as a complete audit, baseline, maximum-workload proof, or full certification. Only the separate explicitly authorized operator command may report certification after `full-performance` evidence and its durable baseline pass.

## Render Scale And Quality

Render Scale preserves selected backing resolution and visible quality. A raster product with `canvas.renderScale` declares typed `renderScaleCoverage: { kind: "selected-backing-pixels", states }` on one browser runtime row targeting `canvas.renderScale`. Exact sorted states are `["interaction", "steady"]`, plus `"playback"` when timeline is enabled.

The product browser scenario supplies real state transitions to `expectToolcraftCanvasRenderScaleEvidence`. The protected helper keeps CSS size stable, checks actual canvas backing pixels against `css size × devicePixelRatio × selected scale` in every state, and only then emits `canvas-render-scale-backing` for each `<acceptance-id>#<state>`. A clamp or downsample is a functional failure without measured performance. Every measured path in a render-scale-enabled raster product proves actual `CSS size × devicePixelRatio × 2` backing after each measured phase before `performance-render-scale` evidence may be emitted.

Do not pass budgets by silently reducing selected quality, backing resolution, product range, source fidelity, export fidelity, or live interaction semantics. Diagnose pass cost, invalidation, cache lifetime, scheduling, and execution location first.

## Slider Responsiveness

Slider Responsiveness means the real product response remains live through the gesture. Model the slider's reachable interaction and invalidated passes, then measure its derived path; a label, target name, or control kind never classifies workload by itself.

Source lifecycle guards remain mandatory: resources are created outside React render, retained according to the declared lifecycle, reused across unrelated interactions, and released during cleanup. Animation frames are cancelled during cleanup, and timeline-only updates do not recreate source-bound resources.

## Non-Normative Examples

These examples illustrate the model; they do not define product categories or minimum fixture sizes:

- An export selector can adapt an option value to a numeric output-width dimension.
- A collection editor can adapt runtime items to a numeric item-count dimension.
- A source importer can expose numeric source dimensions as external-input dimensions.

Choose dimensions from the real product cost model and enforced boundaries, not from these examples.

## Model Appearance Paths

Model `fileDrop` performance proof names six affected passes: `package-extraction`, `canonical-decode`, `model-presentation`, `canvas-orbit`, `export`, and `resource-cleanup`. Extraction and canonical decode execute in the worker; presentation, orbit, export, and cleanup execute on the main thread/GPU boundary.

Use fixtures for authored textures/materials, vertex colors, fallback-only models, equivalent folder/ZIP packages, missing dependencies, multiple roots, and hostile archives. Derive a combined geometry-plus-texture envelope from normalized `modelLimits`; source bytes alone are insufficient because decoded RGBA pixels and GPU resources coexist with canonical geometry. Measure visible completion and frame gaps, cache reuse across preview/export or replacement, and zero active presentation leases after remove/reset/failure/unmount. Do not pass by dropping textures, changing the selected root, replacing authored appearance with fallback, or rendering only metadata.
