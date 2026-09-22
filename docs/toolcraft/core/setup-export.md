# Setup, Background, And Export

Read this module before changing Setup, canvas sizing, background, image export, SVG export, video export, sticky actions, render scale, or timeline visibility.

## Runtime Setup

- Runtime Setup consists of a settings file/defaults action block followed by the mandatory `Settings` section, before all product sections. The schema IDs are `runtime.defaults` and `runtime.setup` respectively; the existing Settings identity and value targets stay stable.
- Explicitly user-requested application modes occupy the first product section immediately after Setup (Settings); the canonical rule and typed inventory are in [Explicit Product Modes](./layout.md#explicit-product-modes). Only controls applicable to the selected mode remain visible; hidden values are preserved.
- `Settings` uses the standard section header, scoped Reset and collapse controls. It stays mounted in every product mode; only its body collapses. Its collapse state persists as the usual panel preference.
- `Import Settings` and `Export Settings` share an equal-width row in the headerless, noncollapsible section above `Settings`. Local `Save State as Default` occupies a full-width row above them when source authoring is available. The panel-header Reset controls action remains available and restores the active schema defaults.
- Do not add settings import/export through `panelActions`, route-local file inputs, or app-authored controls.
- Source authoring is provided by the local development host. Preview and deployed builds keep Import/Export Settings and hide only Save State as Default. Import reads a user-selected JSON file; Export downloads JSON to the browser. Neither writes project files. Import and source save share one operation lock per runtime store, including panel remounts; file actions and Save stay disabled until the operation finishes or is cancelled.
- The runtime settings actions use JSON v3 to store control values, finite/Infinity canvas sizing, timeline playback settings and every runtime attachment's available source paths plus durable resource references. It does not embed file bytes or archive the whole workspace/keyframe timeline. Browser uploads expose file names or folder-relative paths, never absolute disk paths; model packages also record their internal source paths. Paths are metadata, not instructions to fetch a URL or reopen a disk file.
- The settings API validates the current app-specific settings envelope, checks attachments independently in the browser's Toolcraft repository, then applies settings and the available attachment list as one undoable operation. Missing, corrupt or malformed attachments are skipped, not inserted as unavailable placeholders and never allowed to fail otherwise valid settings. The list is restored in exported order with stable media IDs for per-file controls; an empty or wholly unavailable list restores no attachments. Non-media product layers remain intact. A different origin/browser or cleared repository may make every attachment unavailable even if the original file still exists on disk; the JSON is not a portable project archive. Do not create app-owned restoration or legacy-format fallbacks.
- Product-output, exportable, shader, procedural, reference-clone, and uploaded-background/source apps use `editable-output`.
- Product apps declare the standard background state pair in one authored `Background` source section. Runtime removes that visible section and places a `Background` switch beside `Infinity canvas` in Settings, with Background first.
- Runtime places `Background color` below that row, before finite canvas sizing.
- Runtime adds `Workspace` (`canvas.workspaceBackground`) to the right of `Background color` in an equal-width row. Without a product Background color it remains a standalone selector. Its options are `Blanc` and `Dots` (default). Workspace does not render a help icon; the selector remains available in Infinity and for other enabled canvas sizing modes. This non-keyframeable editor preference decorates the workspace only, independently of the product Background switch/color. It follows pan/zoom and persists with normal values, history and Save State as Default. Dots are SVG vectors using the local foreground token at 10% opacity, with 3px diameter / 24px center-to-center spacing at 100% zoom. They stay outside product scene bounds and all export formats.
- Background and Infinity are independent by default (`canvas.infinityBackgroundPolicy: "optional"`). Turning Background off keeps Infinity active and leaves PNG/SVG transparent. An explicitly required policy couples them for specialized hosts.
- Finite `Aspect ratio`, `Canvas width`, and `Canvas height` follow Color; optional `Resolution scale` follows sizing.
- When present, `Timeline` and `Lock rotation` share the final Setup row, with Timeline on the left.
- Timeline and Infinity canvas are self-explanatory runtime switches and do not render help icons.
- App-authored sections must not declare runtime Setup targets: `runtime.settingsTransfer`, `canvas.infinity`, `canvas.aspectRatio`, `canvas.size.width`, `canvas.size.height`, `canvas.renderScale`, `canvas.rotationLocked`, `canvas.workspaceBackground`, or `panels.timeline.extended`.

## Save App Defaults

During local development, the dedicated runtime action section above Settings exposes `Save State as Default` above Import Settings / Export Settings. Import a settings file, then save to make the resulting current workspace the default. Click once to make the complete current workspace the application's starting state. The host saves files into the project, atomically replaces `src/app/app-defaults.json`, and reloads the application. The standard Button loading indicator remains active during resource capture, uploads and the final write, keeps its width and blocks duplicate clicks. Failures restore the idle button with a retryable error.

- Keep the generated JSON import with `with { type: "json" }` and `defaults: appDefaults` input in `defineToolcraft({ base, defaults, modules })`. The file starts as `null`; new saves use version 2 (`appId`, `state`, `resources`, `theme`). Version 1 parameter snapshots remain readable. Existing apps receive the updated source template and host integration through regeneration.
- The snapshot captures all runtime values, including hidden branches, compound and per-file values, collections, selection, Background, rotation lock, Resolution scale and export settings. It also saves finite/Infinity mode and dormant finite dimensions, canvas pan/zoom, panel positions/visibility/scroll/collapsed sections, layers and their order/visibility, and timeline duration, playhead, playback/loop state, keyframes and easing. Parameter values and keyframes remain separate; saving does not bake the evaluated frame into parameters. Theme preference is saved too.
- Uploaded resources are copied from the runtime repository into immutable `public/toolcraft-defaults/<folder>/<sha256>.bin` files. Images use `images/`, ordinary attachments use `files/`, and model resources use `models/sources/`, `models/bundles/`, `models/documents/`, `models/repairs/` and `models/textures/`. The JSON records project paths and resource metadata while preserving original source filenames/paths and stable media IDs. A path alone never substitutes for missing bytes. Missing resources or unfinished file operations prevent saving the snapshot. Legacy flat resource paths remain readable; the next save migrates active files into the appropriate folders.
- New workspaces start from this full snapshot even when local workspace persistence is disabled or excludes some slices. Existing local workspace data retains precedence until Reset. The panel-header Reset restores the saved workspace, media and theme; document Reset remains undoable. Section resets remain scoped and use the saved values/media for their targets. Undo/redo history, active uploads/repairs/exports and transient rendering resources are session operations and are not published as startup defaults.
- Editable slider scales are captured in optional `state.controlRanges` together with current values. Old version 2 snapshots without this field remain readable. Blur/Enter applies slider edits synchronously; only Save State as Default writes source files and uses the loading button.
- Builds include both JSON and packaged files, so media restoration works in a clean browser. Preview and deployed builds expose neither the source-writing endpoint nor Save State as Default. Header Reset remains available. Publishing remains a separate action.
- The host validates app identity, the full snapshot through canonical workspace/control codecs, resource reachability and byte hashes. Local session tokens and stale-revision checks protect writes. It atomically replaces the fixed JSON file only after every referenced binary exists; validation or commit failure preserves the previous snapshot and its files. New uploads are recorded durably before publication, with their file identity and a 24-hour retry grace period. Files left by a failed or abandoned save do not change active defaults; a later successful save removes expired unused uploads, including after a server restart. Upload scratch files live under `.toolcraft/scratch/default-uploads/` and are removed on completion; interrupted scratch is eligible for explicit file cleanup. Filesystem writes belong to the signed host, never product controls or routes.
- After committing the snapshot, the host removes files from previous saved defaults that are no longer referenced, then removes empty managed folders. Shared files and transitive model resources remain while the current snapshot needs them. Cleanup only considers previously recorded managed paths, including owned uploads whose retry grace has expired, and verifies their original bytes and unpublished-file identity; unrelated project files, edited files and symlinks are never deleted. A host-private pending-cleanup record survives interruption and retries on the next save. If cleanup fails after the JSON was committed, the panel reports that defaults were saved but file cleanup is incomplete, and retains the new revision so Save State as Default can retry.
- When changing schema targets or accepted values, migrate the saved workspace with the schema. Malformed or lossy state is rejected rather than silently discarded. Source default values are separate from the runtime's authored initial defaults: a saved user-selected Resolution scale or rotation lock becomes the new reset value without changing the authoring contract for these controls.

## Canvas Size Defaults

- When no explicit product size is provided, the default canvas size is `16:9` / `1920x1080`.
- Runtime aspect presets apply canonical canvas sizes; `16:9` is `1920x1080`.
- A prompt-provided, reference, fixed-format, or base/default size is only the initial `canvas.size`.
- Fixed/reference/base dimensions are not reasons to hide `Aspect ratio`, `Canvas width`, or `Canvas height`.
- Canvas width/height edits commit on blur or Enter, preserve the selected preset or custom proportion, and recalculate the other pixel dimension with integer rounding. Recommitting the same dimension is a no-op. `Custom` reveals `Ratio W` / `Ratio H` for positive integer proportions, independently of pixel dimensions. Selecting Custom preserves the current size; editing its proportion anchors the current canvas width and recalculates height. Invalid ratio input restores the last accepted value and Escape cancels the draft. Ratio, pixel dimensions and canvas bounds change atomically through history and survive persistence and Save State as Default.

The generic-section-title restriction applies to product-authored sections. Runtime-owned `runtime.setup` keeps the mandatory Settings title even when it contains the Background controls; those controls still require behavioral acceptance.

## Infinity Canvas

- `Infinity canvas` is the one runtime-owned mode switch for an unbounded workspace. Product code does not mirror it in `state.values` or create another canvas-mode control.
- Turning it on removes only the finite artboard boundary and clipping. `Aspect ratio`, `Canvas width`, and `Canvas height` disappear because they do not constrain the workspace.
- Every outer SVG and wrapper allows overflow in both modes (`overflow: visible`, no paint containment), preserving viewBox and geometry. Only deliberate artistic masks may clip content. Prove pixels beyond affected artboard edges in Infinity and their absence in finite mode; the mode observer checks every outer SVG, including unmarked roots beside raster output.
- Effects retain overflow and prove processed edge pixels, Background off and finite restoration; follow [intermediate output bounds](runtime-boundary.md#intermediate-output-bounds).
- Runtime owns both live background surfaces. In finite mode it renders one pointer-transparent evaluated background layer below model/image media and below the transparent product foreground. Infinity mode omits that finite layer and fills the complete viewport with the same evaluated `Background color`; product code must not draw either background surface.
- Product output that semantically represents an editor environment rather than
  bounded scene geometry may use the `scene.infiniteCanvasContent` port.
  Runtime mounts it only in Infinity mode, below the transformed product world,
  across the full viewport, with pointer input disabled. It does not pan, zoom,
  contribute to `sceneBoundsProvider`, or enter image/SVG/video export.
- The last finite `canvas.size` remains dormant and immutable while Infinity canvas is on. Turning it off restores that exact size and clipping at the current offset and zoom without centering; reset, undo/redo, persistence, and settings transfer preserve the same canonical `canvas.mode` behavior.
- Offset, zoom, product/image/model world frames, mounted component and renderer identity, and live custom-renderer backing remain unchanged in both mode transitions. Zoom, pan, radar, and model orientation change presentation, not scene geometry or export bounds.
- `scene.canvasContent` declares one `scene.sceneBoundsProvider`: exact-state world rectangles in both modes, never a registry, DOM measurement, intrinsic image size or time-range envelope. Runtime resolves their union into one canonical scene surface and gives live output and export the same rect. Only provider-less finite compositions may fall back to the artboard.
- Canvas 2D, WebGL and WebGPU call `useToolcraftProductSceneFrame()` in `scene.canvasContent` for backing dimensions and world-to-local translation. Mode toggles preserve the backing and canonical rect. The hook returns `ready`, `empty` or `unavailable`; empty/unavailable Infinity never uses finite fallback geometry.
- Image source pixels and image scene geometry are separate: intrinsic dimensions describe the decoded resource, while the runtime image transform supplies its world frame.
- Still renderers may supply `getContentBounds(context)` using the `renderFrame` model and context (frame, state, pipeline, signal, time). Return world-space overflow rectangles without DOM measurement or changing layout. Runtime awaits and validates them before Infinity allocation; rendering keeps its original frame. Respect cancellation. PNG/JPG presets keep their selected long edge.
- Finite PNG/JPEG/SVG export uses the saved centered artboard. Infinity still export uses the outward-rounded union of visible image/model/product bounds and renderer-declared content overflow. Pan and zoom never affect that union; Background affects fill only. Hidden or unavailable layers, runtime media suppressed by the composition, and editor-only handles or gizmos remain excluded. SVG requires real vector content; runtime media/model pixels are not traced or wrapped in SVG.
- Prove unavailable-image exclusion with `createToolcraftUnavailableImageResourceFixture` and `expectToolcraftInfinityCanvasUnavailableImageExportEvidence`; product tests never mutate storage/state or call the reserved bridge, and evidence publishes only after deterministic cleanup restores the ready resource.
- Video exports the same saved artboard in both modes. Runtime evaluates the provider once per scheduled frame while encoding; there is no separate bounds-union prepass. Resolution, duration, frame schedule and background remain unchanged by Infinity.
- Missing/invalid required product bounds and artifacts above `8192px` per edge or `67,108,864` pixels produce typed `scene-bounds-unavailable` or `scene-export-too-large` failures. Invalid video frame geometry cancels the encoder and releases backing resources. Empty scenes retain the same background-only behavior as finite mode.

Infinity image proof checks actual downloads against separate finite/Infinity sizes, bounds and decoded pixels. Use parity helpers only for equal crops; video retains parity. Cover shifted content, different artboards and transparency. Unavailable-image exclusion does not prove content.

For a processing source image, `finite-media-stacking` proves Background → processed product with `mediaVisible: false`. For a visible runtime image/model, it proves Background → media → product with `mediaVisible: true`. Observed visibility must match the expected presentation before and after the Background action; only visible contributors occur in `layerOrder`. Keep upload/remove/persistence proof regardless of presentation.

## Resolution Scale

- Non-vector raster, Canvas 2D, WebGL, and WebGPU previews author `canvas.renderScale` as `true` or `{ step }`. For this control, product code may customize only the slider step; it cannot author `enabled`, `min`, `defaultValue`, or `max`.
- Runtime resolves the enabled slider to canonical `min: 1`, `defaultValue: 2`, and `max: 2`; the default step is `0.25`.
- A custom step must be finite, between `0.01` and `1`, and evenly partition the canonical `1..2` range so the `2` maximum remains reachable. Invalid or non-partitioning steps fail schema resolution instead of being clamped.
- Runtime then appends `Resolution scale` after canvas sizing.
- `Resolution scale` changes backing pixels from `1` to `2` without changing visible CSS size or product output dimensions.
- The product acceptance matrix adds exactly one browser runtime row targeting `canvas.renderScale` with `renderScaleCoverage: { kind: "selected-backing-pixels", states: ["interaction", "steady"] }`; insert `"playback"` in sorted order when timeline is enabled.
- The product browser scenario uses `expectToolcraftCanvasRenderScaleEvidence` for every declared state. Only after CSS size remains stable and actual backing dimensions equal `css size × devicePixelRatio × selected scale` within the one-physical-pixel tolerance does the protected reporter emit `canvas-render-scale-backing`.
- Any quality clamp or lower-resolution stretch is a functional failure without measured performance.
- DOM/SVG/vector-native previews should not use render scale.
- Performance fixes must preserve the user's selected render scale. Do not pass budgets by silently downsampling, stretching a lower-resolution backing canvas, blurring output, or clamping render scale below the chosen value.

## Timeline Setup Switch

- When a Timeline module is present, runtime adds the `Timeline` mode switch to Setup.
- Off shows compact Play-only transport.
- On shows the extended timeline with scrubber, duration, loop, and keyframe UI.
- The switch controls runtime presentation only. It does not pause playback, change product values, remove keyframes, alter export, or reset with `Reset controls`.
- When no Timeline module is present, the Timeline switch must not appear.

## Rotation Lock

- An app with an `orientationGizmo` receives the runtime-owned `Lock rotation` switch (`canvas.rotationLocked`), off by default. It sits right of Timeline in the final Setup row, or alone when Timeline is absent; it does not enable Timeline. Apps without a gizmo do not receive this switch.
- Turning it on stops manual gizmo drag, axis snap, double-click reset, and direct model orbit. Active gestures release pointer capture and pending snap/orbit frames are discarded immediately. Unlocking never replays those frames or changes the current pose.
- The complete gizmo, including its backing, remains visible at `1 / 1.5` (two-thirds) normal opacity and exposes `aria-disabled`. Pan and zoom remain available; a locked model press passes through to canvas navigation.
- This is a manual-interaction lock, not a fixed-camera product declaration: timeline evaluation, explicit runtime pose commands, settings import, undo/redo and export keep their normal semantics. The boolean uses canonical runtime values, local workspace persistence and settings transfer; Reset controls restores its source-saved value, or the initial default `false` when no source snapshot exists. It is not keyframeable.
- Product code must not author a duplicate switch, rotate through a separate gesture handler, or recreate disabled gizmo visuals.

## Background

- Every product app declares one authored `Background` source section containing:
  - `export.includeBackground` as a switch;
  - the product background color control.
- Runtime consumes that pair into Setup, labels the switch `Background`, places it left of `Infinity canvas` in an equal-width row, and labels the color below it `Background color`. The `Blanc` / `Dots` workspace selector sits to the right of the color in the same row.
- Background does not change canvas mode by default. Its switch controls preview fill and PNG/SVG alpha; Infinity remains usable with Background off.
- A separate visible Background section is stale layout and fails acceptance.
- Use a schema `color` target such as `appearance.background` or `scene.background`.
- Do not hardcode a configurable background in CSS, Canvas `fillStyle`, or WebGL clear color.
- Live preview never paints a product-owned bounded background. Runtime removes its finite layer when Background is off or Infinity canvas is on, and uses the timeline-evaluated Background color for the one active finite or Infinity surface.
- Runtime image export reads Background directly: PNG can be transparent, while JPG remains opaque.
- Runtime SVG export reads Background directly: enabled output gets one runtime-owned vector background rectangle; disabled output remains transparent.
- Runtime video export keeps the selected background even when Background is off.

## Artifact Export Intent

Use this sequence as the single authority for choosing product artifact delivery:

1. Start every product with image export.
2. Add SVG export only when the user explicitly requests SVG delivery.
3. Add video export only when the user explicitly requests video delivery.
4. Do not infer SVG from an SVG preview renderer, or video from animation, playback, keyframes, or timeline.
5. Keep image with requested SVG/video unless the user explicitly requests image removal.
6. Record all three decisions in `productReadiness.exportIntent`.

Product-mode readiness requires all three discriminated decisions. Image uses `toolcraft-default`, `user-requested`, or `user-removed`: `user-requested` requires non-empty structured user-message evidence, and `user-removed` requires non-empty structured user-removal evidence. SVG and video each use `not-requested` or `user-requested`; `user-requested` requires non-empty structured user-message evidence. Do not add optional modes, legacy fallbacks, or schema-derived inference.

### Primary Request Evidence

Before planning an optional export module, inspect the original user message,
not an earlier agent's claim about that message. Every nondefault decision uses
`ToolcraftExportRequestEvidence` with exactly these four fields (synthetic example):

```ts
video: {
  mode: "user-requested",
  evidence: {
    source: "user-message",
    messageRef: "conversation-id/user-message-id",
    messageText: "Make a six-second loop. Add MP4 video export as well.",
    quote: "Add MP4 video export as well.",
  },
}
```

- `messageRef` locates the inspected primary message: a host conversation/message
  identifier or an actual transcript path with a message/line locator. A date,
  invented identifier, plan path, or worklog reference is not sufficient.
- `messageText` preserves the complete original user message relevant to this
  decision. `quote` is a nonblank verbatim contiguous substring, including the
  context needed to understand the requested artifact or removal. Do not
  translate, normalize whitespace/Unicode, paraphrase, or clip away a negation.
- Plans, worklogs, assistant messages, summaries, and reference apps are not
  primary request evidence. Do not copy their attributed quotes forward without
  finding the original. Generic approval to execute a plan does not authenticate
  a quote that the plan attributed to the user. For a short acceptance of an
  explicit export offer, inspect the actual offer/answer exchange; keep the
  user's answer verbatim and record the interpretation separately in the worklog.
- Reconcile later user exclusions before reusing earlier evidence. A request for
  animation, a loop, timeline, presets, reference parity, or static comparison
  renders does not request video delivery. Adding an export capability and
  executing an artifact render are separate scope decisions.
- If the primary request is unavailable or does not establish explicit artifact
  intent, leave SVG/video `not-requested` and image `toolcraft-default`. Do not
  invent consent or add optional export code/tests as a precaution. Preserve an
  already established explicit user removal; ambiguity is not permission to
  reverse it. Record the uncertainty rather than promoting an agent assertion.

The protected validator checks source shape and exact quote membership. It does
not authenticate chat authorship, fetch `messageRef`, or decide natural-language
permission. Fabricating both `messageText` and `quote` cannot be detected without
a trusted host transcript source; the agent must inspect and assess the original.
Passing structural validation alone is not proof of user authorization.

Image/video settings keep their existing base layout:

| Resolved delivery       | Settings layout                                                                                | Sticky export actions                          | Artifact acceptance               |
| ----------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------- | --------------------------------- |
| Image only              | `Image Export` directly above sticky actions                                                   | Image action primary                           | Complete image coverage only      |
| Image and video         | `Image Export` immediately before `Video Export`; `Video Export` directly above sticky actions | Image action secondary, Video action primary | Complete image and video coverage |
| Video only              | `Video Export` directly above sticky actions                                                   | Video action primary                         | Complete video coverage only      |
| Explicit no image/video | No image or video settings section                                                             | No image or video export action                | No image or video artifact row    |

SVG is an orthogonal enabled capability: enable `svgExportModule()` and complete its SVG artifact row. When image export is also enabled, runtime adds SVG to `export.image.format` and presents one still-export button. The typed image and SVG actions remain separate internal dispatch/proof records, not separate visible buttons. SVG-only products keep a single Export SVG button with no raster settings. Image Export/Video Export adjacency is unchanged. SVG-only requires explicit SVG request evidence plus explicit image removal and video `not-requested`. Explicit no-export requires non-empty image-removal evidence with SVG/video both `not-requested`.

## Export Job Lifetime

- Image, SVG, and video share one active export slot per runtime store. A second export reports `export-busy`; it is not queued. Non-export controls/actions remain usable, and hiding or remounting the panel does not replace the job.
- Runtime captures one isolated, deeply readonly state snapshot when it accepts the export. Live edits apply to the next export, not an in-flight file. Product callbacks must treat their supplied `state` as immutable and use it instead of reading the live store.
- Raster and SVG `renderFrame` contexts include an `AbortSignal` named `signal`. Check `signal.throwIfAborted()` around asynchronous work and pass the signal to cancellable APIs. Cancellation is cooperative: runtime waits for actual callback/encoder settlement and cleanup; it never frees an in-use resource to pretend that a job finished.
- Root teardown and renderer-pipeline replacement cancel the affected export. Runtime checks cancellation again before downloading, so a late renderer, encoder, or `toBlob` result cannot download after cancellation. There is no product-owned queue or additional Cancel control.
- Runtime retains source, model, and renderer resources for the job and releases them after settlement. Image decoding is cached within that job only; repeated frames or assets sharing a resource reuse the decoded source while retaining their own scene transforms.
- Video retains the saved finite artboard crop, selected resolution and 30 FPS cadence in both modes. Video evaluates immutable frame states on demand without a bounds prepass or retaining complete state copies.
- Low-level runtime export requests now require `signal` and readonly state; runtime scene rendering also receives the session image loader. Generated product code continues to supply `scene.rasterFrameRenderer` / `scene.vectorFrameRenderer` callbacks, not low-level exporters or resource owners. Cleanup failures remain failures, including when cancellation or rendering also failed.

## Image Export

- Every app with `Export PNG` exposes a separate `Image Export` section.
- `Image Export` uses two `select` controls in one compact two-column inline row:
  - `export.image.format`, default `png`, with exactly `PNG` and `JPG`, plus `SVG` only when `svgExportModule()` is enabled;
  - `export.image.resolution`, default `4k`, with `2K`, `4K`, and `8K`; normal schema applicability hides this control while SVG is selected and preserves its value for the next raster export. Format keeps the left half of the two-column row; the right half stays empty.
- Image-only apps place `Image Export` directly above sticky footer actions.
- Apps with both image and video export place `Image Export` immediately before `Video Export`.
- `imageExportModule()` owns the typed action/settings. Runtime resolves the current scene frame, selected format and resolution, allocates the exact backing, composites background plus visible runtime media/models, awaits `scene.rasterFrameRenderer`, encodes the selected artifact, downloads it, and reports typed progress/failures.
- Product code supplies only the shared deterministic `scene.rasterFrameRenderer.renderFrame` callback in scene coordinates. It must not allocate an export canvas, call `toBlob`/`toDataURL`, create object URLs, or download the artifact.
- The selected `export.image.resolution` must produce real 2048/4096/8192px long-edge PNG output for 2K/4K/8K. Retina sizing is only the fallback for current/omitted resolution.

When `rendererTechnique.gpu.export` selects VGPU, follow the canonical
[`Renderer Technique: Opt-In VGPU Setup`](../renderer-technique.md#opt-in-vgpu-setup)
before authoring export code. Each export call renders the exact artifact state
into a fixed offscreen VGPU target, reads its RGBA pixels, and paints them into the
runtime-supplied CanvasRenderingContext2D. Runtime still owns bounds, resolution,
background composition, validation, encoding, download, and typed failures; the
product never reuses a prior destination paint or encodes the canvas itself. A
preview-only VGPU selection adds no VGPU export requirement.

## Video Export

- Only products with video `user-requested` intent and non-empty explicit user-request evidence expose `Export Video`; animation and timeline behavior do not authorize it.
- Any app with `Export Video` must enable the top Toolcraft timeline.
- Apps with `Export Video` expose a separate `Video Export` section directly above sticky footer actions. When image export is also enabled, `Image Export` sits immediately before it.
- `Video Export` uses two `select` controls in one compact two-column inline row by default:
  - `export.video.format`, default `mp4`, with baseline `MP4` and `WebM` options;
  - `export.video.resolution`, default `current`, with baseline `Current` and `4K` options.
- Stack the pair only when labels or selected values would clip, and record that fit reason in the worklog.
- Runtime uses the pinned Mediabunny timestamped encoder to select an actually supported container and codec. It reports the real MIME/extension or a typed visible failure.
- `MOV` and `ProRes` are not baseline browser outputs; use them only with a custom encoder/transcoder plus acceptance and performance coverage.
- Use `getToolcraftVideoExportSize` for video dimensions. `current` uses current canvas/output size with even encoder-safe rounding; `4k` fits inside 3840x2160, preserves aspect ratio, and returns even dimensions.
- Runtime renders the same shared product frame callback at a fixed 30 FPS offline schedule, evaluates each immutable frame state at its timeline timestamp, and writes explicit packet timestamps/durations. Renderer wall-clock cost changes export latency only, never media cadence or duration.
- Product code must not instantiate `MediaRecorder` or `VideoEncoder`, call `canvas.captureStream()`, import `mediabunny`, or provide a wall-clock fallback.
- Protected browser acceptance decodes representative video frames, enumerates actual encoded packet timings, and proves dimensions, duration, cadence, background, and changing product pixels before publishing evidence.

## SVG Export

- Only products with SVG `user-requested` intent and non-empty explicit request evidence expose `Export SVG`.
- SVG means a standalone, self-contained, editable vector artifact. Raster-in-SVG (`image`, data URLs), `foreignObject`, scripts, event handlers, animation elements, external resources, and external `url(...)` references are rejected.
- SVG has no separate settings section or raster resolution. Combined image/SVG apps select SVG in Image Export and use the same still-export button. Runtime derives `width`, `height`, and `viewBox` from the same finite or Infinity scene frame used by artifact export.
- Use `svgExportModule()` and provide the renderer value as `scene.vectorFrameRenderer` through `composeToolcraftApp`. The product `svgExportRenderer` callback appends namespace-aware vector nodes only to the supplied detached group:

```ts
export const svgExportRenderer = {
  baseFileName: "column-graph",
  renderFrame: ({ container, frame, state }) => {
    const rect = container.ownerDocument.createElementNS(
      "http://www.w3.org/2000/svg",
      "rect",
    );
    rect.setAttribute("data-column-track", "true");
    rect.setAttribute("x", String(frame.x));
    rect.setAttribute("y", String(frame.y));
    rect.setAttribute("width", String(frame.width));
    rect.setAttribute("height", String(frame.height));
    rect.setAttribute("fill", String(state.values["appearance.foreground"]));
    container.append(rect);
  },
} satisfies ToolcraftProductSvgExportRenderer;
```

- Product code never receives the final `<svg>` root and never serializes XML, constructs the Blob, opens a file picker, creates an object URL, or downloads the artifact. Runtime owns root/frame/background assembly, strict validation and reparse, serialization, progress, typed failures, and `.svg` download.
- Canvas 2D, WebGL, WebGPU, photos, videos, and models are not automatically vectorized. If the requested product output cannot be represented as vector geometry/text, record the incompatibility instead of emitting a fake SVG.
- Browser coverage for combined image/SVG apps first selects SVG in the Format control, then activates the single Export SVG button. Format option coverage includes SVG; resolution coverage exercises PNG/JPG and proves absence during SVG plus restoration of its retained value.
- Acceptance declares `all-required-svg-export-behavior` and uses `expectToolcraftSvgExportArtifact` on the real Playwright `Download`. The protected recipe verifies the exact downloaded bytes, `.svg` filename, strict XML/namespace, dimensions/viewBox, vector-only self-containment, native decode, SHA-256 hash, and non-empty exact product element expectations before attaching `svg-export-artifact` evidence. Generic exported-artifact evidence cannot satisfy this requirement.

## Sticky Product Actions

- Export actions in sticky `panelActions` match the resolved artifact intent exactly. Explicit no-export products have no image, SVG, or video export action.
- Clipboard copy may be an additional product action, but it never changes or substitutes for the recorded artifact intent.
- Runtime button text and accessible names follow the selected format: `Export PNG` / `Export JPG` / `Export SVG` from `export.image.format`, and `Export MP4` / `Export WebM` from `export.video.format`. SVG-only products show fixed `Export SVG`. This applies immediately, after restore/import, Undo/Redo and reset. Typed backend roles and action values stay fixed; the shared still button retains its identity and dispatches the selected typed image or SVG action. Schema labels are metadata, not current-format authority. Product code must not rename or replace these actions. Keep the runtime export icon `upload-simple`. Changes during an export affect the next request, not the accepted job snapshot.
- Runtime export actions own their real Promise and report render/encode/download progress through the sticky footer indicator.
- Async non-export download/copy/generate/apply handlers return the real Promise from `actions.onPanelAction` and use `reportProgress(0..1)` when determinate progress is available.
