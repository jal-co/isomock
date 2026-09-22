# Acceptance Testing

> Reading route: `workflow.md` first; core generated-app rules are in `core/*`. This file covers acceptance.

Prove every visible entity through state/output changes, command effects, timeline frames, layers, media lifecycle or viewport behavior.

## Required Files

- `src/app/app-acceptance-data.ts`
- app-specific tests under `src/app` outside the reserved `app-acceptance.*` framework namespace
- `src/app/app-performance.ts`
- `src/app/app-performance.test.ts`
- `docs/toolcraft/agent-worklog.md`
- `e2e/app-browser-acceptance.spec.ts`
- `e2e/app-controls.spec.ts`
- `e2e/app-performance.spec.ts`
- `e2e/app-kernel-benchmarks.ts`
- `e2e/product-observable-helpers.ts`

See **Proof Boundaries** for lifecycle execution. A performance complaint authorizes one targeted iteration; an explicit full audit permits `npm run verify:perf`.

## Product Readiness

Only neutral templates keep `appProductReadiness.mode: "starter"`. Products use `mode: "product"` and declare:

- `productName`;
- `productSummary`;
- `requestedBehavior`;
- required `exportIntent`;
- `viewInteraction`.

`productReadiness.exportIntent` owns artifact delivery. Acceptance, actions, and applicable settings must match its image, SVG, and video capabilities. SVG has no settings section and means self-contained editable vectors. See `core/setup-export.md`; never infer intent from renderer technology, animation, or timeline state.

`viewInteraction` classifies the product as `non-spatial`, `orbit`,
`fixed-camera`, or `timeline-camera`. Editable spatial scenes default to orbit;
fixed/timeline modes require the positive typed authority detailed under
Orientation Gizmo. Static frames prove composition, not locked interaction.

Product readiness also requires product surface: controls, layers, timeline, `canvasContent`, `infiniteCanvasContent`, `renderDefaultCanvasMedia: false`, or acceptance coverage. Folder names do not prove readiness.

## Implementation Worklog

Record renderer, view, timeline, layers, controls, export and performance choices in `docs/toolcraft/agent-worklog.md` after material decisions and before delivery.

The worklog declares `Mode: product`. Initial `Decision Trail` entries record `Request:`, `Task type:`, `User-visible result:`, `Source/reference checked:`, `Reference inputs:`, `Docs/contracts read:`, `Contract rules applied:`, `View interaction intent:`, `Interaction ownership:`, `Decision:`, `Alternatives rejected:`, `State/output mapping:`, result-narrative `Verification:`, and `Risks:`. Focused entries: see `workflow.md`. Reference inputs list every asset or `None`; state/output mapping links state to output or export.

The `Renderer`, `View Interaction`, `Interaction Ownership`, `Timeline`, `Layers`, `Controls`, `Export`, and `Performance` sections each include `Decision:`, `Reason:`, and `Evidence:`. View interaction adds mode, source, alternatives, and targets. Performance adds workload, lifecycle, assessment, paths, and for complaints exact `Performance request evidence:` plus unique canonical `Performance paths:`.

Protected receipts own files, plans, checks, reports, measurements and results. Decision Trails neither duplicate nor authorize them. `Risks` lists `Risk:` entries or `None:` with a reason.

Missing worklogs, `Mode: starter` and absent decision evidence fail acceptance.

## Acceptance Rows

Acceptance rows cover every visible control, custom renderer feature, media lifecycle, timeline, layer, canvas sizing behavior, toolbar command, sticky action and product editing handle.

Rows name:

- stable `id`;
- `kind`;
- runtime `target` when the entity edits state;
- `componentType`;
- fixture data;
- real user action;
- expected product-level observable;
- evidence type;
- exact `automatedTestName`;
- exact browser descriptor `{ file, testName, budget }`: the product-owned spec path, stable browser test name, and protected semantic budget.
- `controlPartCoverage` when the control is compound.
- `canvasSizingCoverage: "fixed-output-size"` only for non-product/internal `fixed-output` fixtures.
- `canvasSizingCoverage: "intrinsic-media-size"` only for explicit media-viewer/source-native upload apps where imported media natural dimensions intentionally own `canvas.size`.
- `persistenceCoverage: "reload"` when schema `persistence.storage` is `"localStorage"`.
- `persistenceSlices` exactly equal to resolved `schema.persistence.include` for reload coverage.
- `timelineLoopProof` on playback rows whose `timelinePlaybackCoverage` includes `"loop"`. It declares `direction: "forward-only"`, `reversePlayback: "forbidden"`, `seam: "first-last-match"`, and `durationChange: "reproved-after-edit"`; browser evidence still proves the real sampled frames.

The test gate rejects rows unless the real Vitest and Playwright runners select exactly one product-owned test with the declared name and that test finishes passed. A matching name in a comment, string, local fake runner, focused/skipped test, conditional branch, or uncalled registration function is not execution evidence.

Protected Vitest and Playwright reporters evaluate passed runner results plus matching runtime evidence instead of test-source spelling. They reject missing, duplicate, skipped, failed, retry-failed, invalid, or forged evidence.

`src/app/app-acceptance.ts`, `src/app/acceptance`, supplied `app-acceptance.*` meta-tests, and the generic browser harness are framework-owned and signed. Edit only `app-acceptance-data.ts` for product rows/readiness/inventory/transfer intent. Put registered browser scenarios in `e2e/product-<domain>.spec.ts`; reserve `app-controls.spec.ts` for unregistered smoke checks or the `app` domain.

The `e2e/app-browser-*` prefix is reserved for signed framework specs.

## Proof Boundaries

The immutable initial delivery receipt is the lifecycle boundary. Before it exists, first delivery runs one complete bare `npm run verify:delivery` and no measured performance. First delivery may still collect the complete product catalog. Later edits after receipt run the exact unit/component test while developing and `npm run test:feature -- <acceptance-id>` once after the behavior is stable. On failure, diagnose and rerun only the failed acceptance ID.

Do not automatically run typecheck, AI/code-health, build, raw full browser, delivery, export/reload/theme/DPR matrices, framework tests, benchmarks, or measured performance. Each conditional extra requires a direct reason tied to the changed behavior. A repeated bare delivery is a protected no-op.

The command loads current app source once through Vite and starts one Playwright process restricted to the selected file set. It does not run Playwright `--list` or collect the global Playwright catalog; unrelated specs stay unloaded. Invalid IDs, titles, or plans fail before browser startup.

Every browser proof uses the exact descriptor `{ file, testName, budget }`. `standard` is 30 seconds; semantic `extended-io` is 120 seconds and requires declared I/O evidence. Product code cannot set arbitrary browser timeouts.

Classifier output establishes complaint authority only; unresolved localization creates no intent/path regardless of result. Only localized/clarified work starts an iteration.

Contract docs are signed except product-owned `agent-worklog.md` and optional `workflow-observation.md`; only the observation stays outside `sourceHash`.

Framework meta-tests are product-invariant: their synthetic validator cases use protected neutral contract fixtures, never the editable app schema, product acceptance rows, transfer intent, or section inventory. Put exact product targets, defaults, option values, and product-specific expectations in separate app-owned tests. The product gates still read `app-schema.ts`, `app-acceptance-data.ts`, product test names, worklog evidence, and browser scenarios dynamically.

For performance work, edit `app-performance.ts`, product performance path adapters, and the kernel candidate harness when assessment requires it. Do not edit supplied `app-performance.*` meta-tests, protected reporters, receipt writers, or `app-performance-test-utils.ts`; they validate product inputs and own execution evidence.

Slider and range slider rows must prove live behavior. Browser tests should drag the real thumb and assert the runtime value and product-level canvas observable update during the drag, not only after pointer release, blur, an Apply action, or a final commit. Performance-sensitive sliders still need this live acceptance; jank is handled through renderer optimization and targeted performance coverage, not by making the slider deferred by default.

`fixed-output` is invalid for generated product/export apps; prompt/reference dimensions are editable `canvas.size` defaults. Use `intrinsic-media` only for source-native viewers. Product background/source uploads stay `editable-output`; browser proof uses a mismatched aspect ratio to confirm upload preserves canvas size and renders cover/crop.

## Infinity Canvas Coverage

Continuity proves frame, view and identity. Each `content` pass requires `infinityOverflowCoverage` proof: actual edge pixels, branch values, pass execution, Background on/off and finite crop. See the [typed inventory and protected recipe](core/runtime-boundary.md#intermediate-output-bounds). Still-image/SVG proofs verify complete Infinity composition; video retains saved-artboard parity. See [export invariants](core/setup-export.md#infinity-canvas).

## Render Scale Coverage

For a raster product with render scale, add one `canvas.renderScale` browser row: `renderScaleCoverage: { kind: "selected-backing-pixels", states: ["interaction", "steady"] }`; timeline adds `"playback"`.

Run `expectToolcraftCanvasRenderScaleEvidence` per state. CSS size stays fixed and backing must equal `CSS × devicePixelRatio × selected scale` within one pixel before `canvas-render-scale-backing`; mismatch fails. Every measured path in that product proves exact `CSS × devicePixelRatio × 2` after each phase.

Default local persistence requires one runtime row with `evidence: "persistence-state"`, `persistenceCoverage: "reload"`, and `persistenceSlices` equal to the resolved plan. Browser proof changes each slice, waits for status `success`, reloads, then verifies restored state and real output before evidence. Settings import/export is not reload proof.

## Compound Controls

Compound controls have multiple semantic value parts inside one visible control. Their acceptance row must declare `controlPartCoverage`, and the browser test must explicitly exercise each required part against product output.

Required parts:

| Control             | Required `controlPartCoverage`                                                                                                                                                            |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `anchorGrid`        | `anchorGrid.position`                                                                                                                                                                     |
| `channelMixer`      | `channelMixer.activeChannel`, `channelMixer.values`; only for RGB channel matrix behavior                                                                                                 |
| `collectionActions` | `collectionActions.add`, `collectionActions.remove`, `collectionActions.items`                                                                                                            |
| `sourceCollection`  | `sourceCollection.items`                                                                                                                                                                  |
| `colorOpacity`      | `colorOpacity.hex`, `colorOpacity.opacity`                                                                                                                                                |
| `curves`            | RGB variant: `curves.activeChannel`, `curves.points`; `variant: "single"`: `curves.points`                                                                                                |
| `fontPicker`        | `fontPicker.fontId`, `fontPicker.fontWeight`, `fontPicker.fontSize`, `fontPicker.letterSpacing`, `fontPicker.lineHeight`, `fontPicker.textCase`, `fontPicker.color`, `fontPicker.opacity` |
| `gradient`          | `gradient.gradientType`, `gradient.angle`, `gradient.stops.position`, `gradient.stops.color`, `gradient.stops.opacity`                                                                    |
| `palette`           | `palette.family`, `palette.shade`                                                                                                                                                         |
| `rangeInput`        | `rangeInput.start`, `rangeInput.end`                                                                                                                                                      |
| `rangeSlider`       | `rangeSlider.lower`, `rangeSlider.upper`                                                                                                                                                  |
| `vector`            | `vector.x`, `vector.y`                                                                                                                                                                    |

Testing only one sub-control is not enough. For example, a `gradient` test that changes only a stop color must fail if the app also renders Gradient type, Angle, Position, or Opacity controls.

Palette acceptance must also prove live behavior: selecting a family or shade updates runtime state immediately, before delayed persistence or commit timers settle, and the next canvas/product interaction uses that selected token.

For `curves`, the acceptance row must match the intended variant. Semantic one-dimensional curves such as acceleration, bend, easing, response, depth, mask, opacity, threshold, or remap curves must set `variant: "single"` and prove `curves.points`; RGB active-channel coverage is reserved for color-correction or channel-specific curves.

For `fontPicker`, product output evidence must come from actual rendered/exported product text after changing the font, weight, size, letter spacing, line height, text case, color, and opacity. Runtime value changes, selected labels, or popup font previews are preflight checks, not final acceptance.

For `vector`, prove both axes and stable user-authored parameter ownership, never timeline/input/simulation-owned state. Spatial pads, including nested fields, additionally require schema-derived `vector-screen-motion`: four real drags with matching pixel direction, not generic changed-output proof. Read [Vector direction proof](vector-controls.md) before implementing spatial mapping or browser acceptance.

For `orientationGizmo`, use one `kind: "canvas-handle"` row per handle with `canvasHandle.writesTarget` set to its schema pose target and `testId: "toolcraft-orientation-gizmo"`. Declare `orientationGizmoCoverage: "all-required-orientation-gizmo-behavior"` or every required part: axis drag, axis snap, model drag, canvas miss-pan with Space + primary drag, shared pose/output, undo/reset, and export-clean.

Orientation coverage begins with product readiness. `orbit` targets are
non-empty, unique, and exactly match schema gizmos. Other modes reject gizmos.
Fixed/timeline authority is either `{ kind: "explicit-user-request",
requestQuote }` with verbatim text or `{ kind:
"inspected-behavioral-reference", referenceId, observedBehavior }` from an
observed interaction; static frames do not qualify. Timeline camera also needs
timeline intent and an enabled Toolcraft timeline. This blocks silent fixed-camera
choices from escaping gizmo acceptance.

Use protected `expectToolcraftOrientationAxisDrag`/`AxisSnap`/`ModelDrag`/`CanvasMissPan`/`UndoReset` recipes. Axis drag finds blank circular background and performs the pointer drag; axis snap projects and clicks the requested endpoint from canonical pose. Evidence follows pose/output/ownership/history assertions. Arbitrary mutations, endpoint-only or generic drag, source spelling, and value changes do not qualify. Use `expectExportExcludesCanvasHandles` for export-clean proof.

`expectToolcraftOrientationAxisDrag` validates paused playback and maximum `canvas.renderScale` when those standard controls are present. Product tests prepare those states through real UI before capturing their baseline; the protected helper does not toggle playback or quality, so one drag remains one history transaction. This is functional browser proof, not measured performance evidence.

## Control Selection Gates

Acceptance must catch wrong-substitution failures. If the prompt, spec, or app behavior needs a value model owned by a built-in control, the schema must use that built-in or include a documented built-in fit check.

High-confidence wrong-substitution cases:

- gradient, stops, angle, fill transition, or adjustable gradient without `gradient`;
- typography without `fontPicker`;
- sibling typography controls that split case, color, opacity, size, weight, letter spacing, or line height away from `fontPicker`;
- color plus opacity without `colorOpacity`;
- source-sized repeated item sets without `sourceCollection`, or user-editable cardinality without `collectionActions`;
- from/to range without `rangeSlider` or `rangeInput`;
- curve, remap, easing, or response without `curves`;
- manual stable two-axis position, direction, focus, anchor, light, or vector parameters without `vector`;
- user-rotatable 3D model/view orientation implemented as `vector`, paired sliders, axis buttons, or custom gizmo instead of `orientationGizmo`;
- a visible editable spatial scene classified as fixed/non-spatial without positive typed authority from a verbatim user request or observed behavioral reference;
- source upload without `fileDrop`;
- app-wide transport in the controls panel instead of timeline;
- segmented choices that clip instead of falling back to `select`;
- custom controls recreating built-ins.
- one user operation mirrored across canvas and panel, even when the two copies use different labels, ids, or chrome.

## Interaction Ownership Evidence

`interactionOwnership` gives each operation one surface; linked canvas/panel operations must be complementary, not renamed copies. Property edits declare global or selected `selectionScope`; selected properties name a selection owner and `selectionScopeCoverage: "two-entity-isolation"`. Protected Canvas/Panel pixels prove selection is inert, editing A changes only A, editing B changes only B, and the control rebinds. `selectedLayer.*` reuses this recipe; whole-canvas/signature/direct-command proof is invalid.

`fileDrop` rows prove upload/admission, clear/remove, reset/default restoration, and binary/model lifecycle. Without Layers ownership they also prove image rotate/flip and `multiple` reorder. With `panels.layers` and typed media-management ownership, omit those claims from `fileDrop`: runtime `layerCoverage: "reorder"` and `"selected-layer-controls"` rows prove order and selected-transform output. Clear-only proof is invalid; Reset restores defaults or removes uploaded media.

A model `fileDrop` row declares `modelImportCoverage: "all-required-model-import-behavior"` or every typed item: `advertised-format-import`, `staged-preview`, `clean-commit`, `package-extraction`, `deterministic-root-selection`, `appearance-preservation`, `fallback-appearance`, `presentation-consumer-readiness`, `pixel-output`, `repairable-diagnosis`, `repair-action`, `repair-progress`, `verified-repair`, `fatal-rejection`, `persistence-restore`, `resource-unavailable`, `preview-output`, `export-output`, and `history-reset`.

Protected browser evidence imports every format plus folder/ZIP; proves first-root choice, runtime/custom readiness, nontransparent RGBA, and authored signatures versus fallback. Metadata, changed pose, or a canvas node is not proof. Fatal input keeps the prior commit. `Fix model` requires a deterministic topology plan and verified result; appearance warnings never expose it. Processing preview is `40%`; committed preview/export is `100%`. Both share document, appearance key, pose pixels, and omit gizmo chrome. Reload proves repository-backed appearance; corrupt refs become `unavailable`. History/reset proves removal, enabled undo/redo, and default restore through import.

Custom-control rows require `customControlCoverage` and typed `builtInFitCheck`; see `custom-controls.md` for the canonical shape. The fit check records capabilities, checked controls, the closest control (or `"none"`), the missing interaction, and observable proof. One `custom-*` capability is required; collection/command chrome alone is insufficient.

A fit check containing `custom-interaction` also requires `interactionId` and a
panel ownership entry. The fit check compares built-in controls; ownership
separately proves why the operation belongs in the panel instead of directly on
the canvas. Passing one gate never bypasses the other.

Collection-like custom controls must check `sourceCollection` and `collectionActions`, plus `actions` when commands exist. Arrays, `{ items: [...] }`, selection, cardinality, ordering, or item commands establish collection behavior; product nouns and unrelated controls do not.

Custom controls cannot be justified by icons, layout, styling, compactness, or custom buttons alone. `whyInsufficient` must name the product interaction or value model that built-ins cannot express.

## Valid Evidence

Valid acceptance evidence includes:

- rendered product pixels;
- exported image/SVG/video bytes;
- canvas hash or DOM-visible product result;
- clipboard, file, or blob payload;
- cleared media preview and canvas;
- selected layer output;
- changed canvas viewport;
- changed timeline playback state plus rendered frame.
- restored persisted value or product output after browser reload.

Artifact acceptance follows `productReadiness.exportIntent`. Image/video use complete artifact coverage; requested SVG adds `all-required-svg-export-behavior` and protected exact-download vector proof. Explicit no-export products have no artifact rows. Renderer technology never adds SVG, and timeline behavior never adds video. Clipboard proof cannot replace recorded artifact intent.

Export-content proof is distinct from export mechanics: content inspects selected artifact semantics; mechanics proves lifecycle, format, dimensions, transport, and errors. Neither substitutes.

Cover every image format (PNG/JPG plus enabled SVG) and raster resolution; decode downloads to prove format and dimensions. SVG hides resolution; returning to raster restores its value. Verify button labels after edits, restore/import, Undo/Redo and reset: Export PNG/JPG/SVG or Export MP4/WebM. Select each format before clicking the shared still button; keep separate image/SVG artifact proofs. Video proof never replaces image proof.

Runtime Export acceptance must prove the sticky footer top accent indicator advances through real render/encode/download work and hides only after the artifact settles. Async non-export Download, Copy, Generate, or Apply acceptance must prove the indicator is visible while the returned `onPanelAction` Promise is pending, advances when `reportProgress(0..1)` is called, and hides after it settles.

Every video-enabled app exercises two video formats and resolutions. It proves real bytes, dimensions, actual MIME/container or typed capability failure, timeline duration, 30 FPS timestamps/durations from actual encoded packet metadata, decoded product motion, current even-safe sizing, and aspect-preserving 4K inside 3840x2160. Renderer/encoder/muxer errors reject; `blobSize`, metadata alone, assumed FPS, synthetic frame counts, or substituted expectations are invalid. Animated output requires distinct decoded frame hashes.

Footer action acceptance must not include Reset. Reset is already available in the controls panel header and uses schema `defaultValue`; duplicating it in sticky `panelActions` fails acceptance.

Local `actions` acceptance clicks every action and proves nearby runtime state or product output changed. A single-button label adds context instead of duplicating its button. Visual acceptance rejects side labels and puts labels above the grid or compact navigator. Action grids above four resolved rows use previous/dropdown/next; prove the four/five-row boundary, equal 28px heights, both navigation directions, end states, keyboard activation, repeated menu commands, and unchanged command/Undo effects.

`collectionActions` keeps parts `collectionActions.add`, `collectionActions.remove`, `collectionActions.items`. Prove limits, full-default add, sibling-preserving edit, preview/export, and whole-record removal. For compound records, `collectionItemKeyframeCoverage` exactly matches `keyframeable: true` fields and derives one `timeline-keyframes` requirement per field; selected scope binds the exact `selectionTarget` and proves two-entity isolation. `sourceCollection` proves source count, item edit, output, and no add/remove.

Image export proves background changes in preview/artifact/Infinity. Background off preserves the active mode, removes runtime background fill, and makes PNG transparent while JPEG/video stay opaque; restoring it restores fill in the same mode. Media-enabled apps prove `finite-media-stacking` for actual visible contributors: Background → product for input-only images, Background → media → product for visible layers. Expected media presence and observed order must agree. Artifact proof decodes real type, dimensions, product pixels/bounds, and hash; bytes or dimensions alone are insufficient.

Hard acceptance semantics are typed, not inferred from prose. Both selector roles come from required `finiteSelectors`. Applicability cases come only from a `branch` selector's exact `affectedTargets` plus explicit `applicability` predicates; no section-wide fanout exists. A `parameter` still proves its own accepted outcome and option coverage but adds no peer cases. Predicate owners are branches, preserving missing-predicate detection. Non-matches prove absence; matches and declared branch peers prove presence plus the row's existing product outcomes under canonical case-suffixed requirement IDs. The `export.includeBackground` row separately declares `backgroundOutputCoverage` for preview exclusion, transparent image alpha, and preserved video background when exposed. Its protected recipe verifies those preview and artifact semantics. `expectedObservable` and `userAction` remain human-readable context; words such as “hidden”, “PNG”, or “video” never satisfy evidence by themselves.

Invalid final acceptance evidence:

- control exists;
- app `data-*` or SVG signature changed;
- runtime state was mutated directly;
- DOM text changed but product output did not;
- shader uniform changed without output proof;
- helper fixture proves a function but not the app behavior.

If a behavior cannot be proven through product output or a side effect, remove the entity or ask whether it is required.

## Browser Gate

Browser proof uses real UI/stable canvas; direct commands are for command APIs.

See [VGPU setup](renderer-technique.md#opt-in-vgpu-setup).
`rendererTechnique.gpu.preview` proves provider, public `canvas-surface` or
`target-readback`, backing/pixels, unsupported, teardown;
`rendererTechnique.gpu.export` proves offscreen target-readback pixels/typed
rejection; preview-only VGPU selection: no export proof;
export-only VGPU selection: no preview proof; asynchronous retained-resource
feedback/storage apps settle `operation-started`/`operation-settled`
and `retirement-started`/`retirement-settled`.

Acceptance rows with `product-output`, `rendered-pixels`, or `timeline-output` evidence use protected `expectToolcraftProductObservableToChange` with the row `id` as `requirementId`. The generic `expectToolcraftAcceptanceOutcome` is intentionally limited to `command-side-effect`; it cannot emit media, persistence, viewport, layer, timeline, or compound-control evidence. Use `expectToolcraftMediaLifecycle`, `expectToolcraftPersistenceState`, and `expectToolcraftViewportSideEffect` for those state semantics. These recipes require an exact expected outcome after the real action and a bounded stability window; persistence additionally requires a real reload, media requires changed item ids plus product-output semantics, and viewport requires changed offset/zoom while output dimensions stay stable. Generic changed-output proof first samples a stable pre-action baseline. If the product output is autonomous or animated, pause/fix its phase or observe a stable expected semantic result; the next unrelated animation frame is not action evidence. A transient or merely different value is not proof. `getToolcraftProductObservableSnapshot` may establish a baseline, but a snapshot read alone is not mutation evidence. Product tests must not import the internal attachment recorder or reserved evidence contract directly or through product-owned bridges.

Specialized state, layer, compound, and timeline recipes begin with `createToolcraftBrowserProofSession(page)`. Create observations with `session.observe(...)`, where the reader executes inside the current visible Toolcraft runtime root, and actions with `session.action(...)`; persistence uses `session.reload()` for the reload step. Raw callbacks, forged objects, stale pages, and observations/actions from different sessions are rejected before evidence is attached. This binds semantic evidence to the current app identity and browser DOM instead of allowing an in-memory object to impersonate product behavior.

Exported-byte rows use `expectToolcraftExportedArtifact`. The action produces a non-empty artifact and the verifier returns a typed inspection with positive integer `byteLength`; decoded `width`, `height`, and `frameCount` are positive integers, `durationMs` is positive and finite, and `mediaType`/`contentHash` are non-empty strings when present. Missing/empty artifacts, void callbacks, `{ ok: true }`, fractional or zero-byte observations, and fractional decoded dimensions cannot emit evidence. Clean-export checks for canvas handles compare decoded product semantics through `contentHash` plus media metadata, not raw encoded bytes or file size, because two valid encoders may produce different bytes for the same output.

Specialized metadata adds evidence for the same row: canvas handles prove drag and a separate clean-export test compares real exported artifacts with handles visible and hidden; segmented/discrete controls use their protected layout helpers; every declared compound-control part uses `expectToolcraftCompoundControlPartOutcome` and gets its own `row-id#part` evidence; layer selection emits only `layer-selection`; output rows separately use the public pixel/export helper. Other layer recipes emit base evidence only after output changes; reference parity uses `expectToolcraftReferenceParity` to compare the inspected result with the reference baseline. Playback uses the fixed `expectToolcraftTimeline*` recipes. Duration binds runtime duration and renderer cycle to the same expected value; scrub binds time to rendered output; pause/resume proves a stable paused window and resumed time/output; keyframes bind keyframe data, evaluated value, and output. Loop evidence requires normalized forward samples with exactly one end-to-start wrap, equal seam signatures, and the same proof again after changing duration. The reporter derives these requirements from acceptance plus schema; naming a helper in source or passing a desired evidence type to a generic helper is never proof.

Animated viewport tests must also prove that canvas drag, pan, pinch, zoom, and radar/center interactions suspend or coalesce non-essential animation preview work without changing the user's play/pause state. After the interaction, the renderer must resume from the correct timeline or autonomous time and keep canvas zoom/offset stable.

## Video References

When a video, GIF, screen recording, contact sheet, or extracted-frame sequence
is used as a reference, acceptance is driven by typed
`appTransferMode.referenceInputs`. Each authored behavior points to one
observable acceptance row, and that row owns the exact reverse
`motionReferenceCoverage` pair plus browser `reference-parity` evidence. The
semantic validator requires complete phases and exactly one classification for
every detected event. Follow `core/reference-study.md` for preprocessing,
sampling, artifacts, timing, worklog records, and the no-reference fast path.

Do not accept a motion-reference implementation proved only by a single
screenshot, a visual summary, generic canvas hashes, or static style checks.

## Reference Clone

Reference clone coverage is driven by `appTransferMode.referenceFeatureInventory`.

- `appTransferMode.referenceStudy` records source inspection plus original/reference behavior checked by running the original or restoring it locally when possible;
- list every user-visible and output-affecting reference feature before implementation;
- include source evidence, feature-level behavior evidence from the reference study, reference behavior, Toolcraft mapping, status, and one `acceptanceId` for each item;
- map every `referenceCoverage` and `referenceTimelineCoverage` acceptance row from the inventory;
- cover canvas sizing, control mapping, renderer loop/state, pause/resume, restart, export/copy, media lifecycle, persistence/randomization/reset, and custom reference timeline behavior when those exist in the reference;
- mark behavior as `intentionally-changed` only with explicit user approval or redesign/change-request evidence.

Do not treat a few generic checks as a complete reference transfer. The acceptance set must prove that the reference functionality inventory was implemented, not merely that the app renders.

## Timeline And Layers

When animation controls exist without `panels.timeline`, acceptance validation requires `appTransferMode.animationIntent.mode = "autonomous"`. That intent must explain why the animation is decorative/self-running and must cover no user-facing transport, no play/pause, no scrub, no duration control, no loop control, and no export-at-time.

Playback timeline coverage must prove play/pause, scrub, duration, loop, restart when exposed, non-looping Play at the end restarts from 0, and export/copy at selected time when relevant. Timeline animation intent must match the enabled timeline module mode and declare `loopDuration` with source, seconds, and evidence; `timelineModule({ mode, defaultDurationSeconds })` must match that value. Reference clones using `referenceTimeline.mode: "toolcraft-playback"` or `"toolcraft-keyframes"` must declare the same proof on `referenceTimeline.loopDuration`. Duration coverage must edit the real `Edit timeline duration` control, prove the playback range changes, and prove the renderer maps one full product animation cycle to `state.timeline.durationSeconds`. Loop coverage must prove a seamless forward-only product loop: motion advances in one direction, mirror/yoyo/ping-pong/reverse fallbacks are absent unless explicitly requested, first and last frames stitch without a visible jump, and the same seam holds after changing timeline duration. Tests should compare visible or exported output at 0, midpoint, end minus epsilon, and the wrapped first frame after changing the timeline duration. Prefer `getToolcraftTimelineLoopTime` or `getToolcraftTimelineLoopProgress` in the renderer so this phase math is shared. Do not accept a renderer that uses a separate fixed local duration while the timeline displays another duration, and do not accept a renderer effect that watches `state.timeline.durationSeconds` only to dispatch `timeline.setDuration` back to a computed local value.

Keyframe timeline coverage must prove diamond creation, expanded rows, keyframe updates on control change, scrub/playback evaluation, and product output changes for every inferred keyframe-capable control. Tests must prove renderers consume typed evaluated values from the Toolcraft keyframe evaluator; checking `valueLabel`, row count, or source strings is not enough.

Layer browser coverage must use the real LayersPanel UI: click rows, toggle visibility, drag rows to reorder, and drag rows into groups.

## Component Variants

Component variants are acceptance requirements.

- Discrete sliders must render `[data-slot="slider"][data-variant="discrete"]`, show the expected full-width markers, and remain smooth while dragging.
- Schema sliders must stay full-width and stacked; only `fontPicker` may pair its internal letter-spacing and line-height footer sliders.
- Continuous stepped sliders must not render discrete markers.
- Range sliders must stay full-width, start with different lower and upper defaults, and accept built-in manual range separators such as slash, hyphen, spaces, and dashes.
- Segmented controls must preserve cell padding and avoid label collision.
- Select, segmented, and image-picker controls should cover every visible option unless options come from separately tested runtime data.
- Custom controls must declare `customControlCoverage` and `builtInFitCheck`. Coverage proves the custom control is not a built-in replacement, uses kit chrome, keeps only necessary UI, writes through runtime state, and changes product output; the fit check proves which built-ins were considered and why the custom interaction is necessary. Custom interactions also bind `interactionId` so surface ownership is validated independently from built-in fit.

Performance browser tests use the derived path matrix. Each path has one browser adapter, compiled development and maximum fixtures, a centrally profiled budget, and protected measurement evidence bound to the same `pathId`. Every mutating measurement supplies `observeOutcome`; generic change evidence first proves a stable baseline and then requires the product outcome to remain different through the stability window. Autonomous products use `expectedOutcome` with a stable semantic observation or measure at a deterministic fixed phase. Latency ends at that expected result, never at an incidental animation frame. Fixture adapters apply and observe every compiled dimension exactly before measurement. The reporter requires matching path, fixture phase, product outcome, measurement, pipeline, completion/interaction, and budget evidence. Do not hardcode budget numbers, toy values, or toy baseline app states; `app-performance.ts`, the runtime profile catalog, and derived paths are the authoritative inputs.

## Fixtures

Use fixtures that make each behavior visible. For example, background character-size controls need visible background characters, transparency needs alpha-sensitive pixels, selected-layer controls need multiple layers, timeline controls need deterministic playback or keyframe fixtures, and mode-specific controls need fixtures for every mode branch. Applicability coverage proves matching controls visible, non-matching controls absent, values preserved after switching away and back, and the accepted renderer/export outcome in every derived branch or predicate case. Count-controlled control banks prove the numeric boundary states; the test fails if inactive controls remain visible or a visible control is ignored by the renderer.

Generic hash differences are not enough for semantic controls. If a control promises a direction, test that direction.
