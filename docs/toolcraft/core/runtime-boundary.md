# Runtime Boundary

Read this module before changing app assembly, routes, runtime surfaces, custom renderers, canvas output, panels, toolbar, timeline, layers, or controls.

## Required Runtime Shell

- Build through `defineToolcraft({ base, modules })`.
- Create the product composition through `composeToolcraftApp(appSchema, ports)`.
- Render through `ToolcraftApp`.
- Read `appSchema.assembly` before adding custom JSX. It lists the enabled runtime surfaces, capabilities, commands, and assumptions for the current app.
- Keep app state in the Toolcraft runtime schema and runtime commands.
- Keep product assembly in typed `src/app/app-composition.tsx`; the signed route only hosts `ToolcraftApp`.
- Do not replace Toolcraft with copied reference UI, route-local panels, standalone forms, or hand-built editor chrome.

## Allowed Extension Points

Use only these app-specific extension points. Shared runtime changes happen upstream and reach generated apps through regeneration:

- schema controls;
- product-owned `base.canvas`, `base.panels.controls`, `base.toolbar`, `base.persistence`, `base.media`, settings transfer, and canonical capability `modules`;
- `scene.canvasContent` for product output only;
- `scene.infiniteCanvasContent` for editor-only product output that must fill the
  complete Infinity viewport without inheriting world pan, zoom, product scene
  bounds, or export bounds;
- `scene.renderDefaultCanvasMedia: false` only when a product renderer replaces generic image/file preview; it does not suppress runtime model layers;
- typed custom `modelPresentation`; omission is the standard runtime preview/export owner, while `{ mode: "custom", consumers }` is only for declared model targets with checked consumers;
- `controls.renderers` only for true custom controls that pass the built-in fit check;
- one `scene.rasterFrameRenderer` that draws a deterministic product frame for runtime-owned image/video export;
- one `scene.vectorFrameRenderer` that appends namespace-aware editable vector content for runtime-owned SVG export;
- one `scene.sceneBoundsProvider` that returns exact-state product world-space rectangles for live output and runtime-owned export in both finite and infinite modes;
- `actions.onPanelAction` for non-export sticky product actions;
- optional `renderer.pipelineRegistration` for one compiled executable custom-renderer pipeline shared by product work, runtime evidence, and performance assessment;
- runtime commands and hooks, including `useToolcraftProductSceneFrame` inside `scene.canvasContent` when a raster/WebGL renderer needs the active finite or infinite frame.

## Forbidden Rebuilds

- Do not hand-compose `ToolcraftRoot`, `CanvasShell`, `ControlsPanel`, `LayersPanel`, `TimelinePanel`, `ToolbarPanel`, or panel containers in product routes.
- Do not render built-in control components such as `SliderControl`, `SelectControl`, `ColorControl`, `GradientControl`, `FontPickerControl`, `FileDropControl`, or `PanelActionsControl` directly in app code.
- Do not import anything below `src/toolcraft/ui/components/controls/**` (or the equivalent workspace package path), even when the private symbol name is not a public control. Private popovers, parsers, inputs, and state helpers are implementation details.
- Do not substitute native or primitive `input` types `color`, `range`, `file`, `checkbox`, or `radio`, or native `select`/`textarea`, for schema controls. Generic text inputs and product-specific primitives remain available inside a justified custom interaction.
- Do not recreate controls, panels, toolbar, timeline, layers, canvas shell, drag handles, section headers, section reset, history, or runtime surfaces by hand.
- Do not create product-owned export canvases/documents, SVG serializers, encoders, file pickers, object-URL downloads, or direct Mediabunny integrations; runtime owns typed image/SVG/video actions end to end.
- If a shared behavior is wrong, fix the shared runtime/template source and regenerate or sync the copied Toolcraft source instead of patching one exported app.

## Canvas Boundary

- `canvasContent` contains product output only: WebGL, Canvas 2D, SVG, DOM product text, shaders, generated previews, export previews, or product editing handles.
- `infiniteCanvasContent` follows the same product-output-only rule. Runtime
  mounts it only in Infinity mode as a pointer-transparent viewport layer below
  the transformed world. It is not a scene-bounds or export extension point.
- App UI, CTAs, upload prompts, helper copy, placeholder instructions, buttons, menus, forms, and settings do not belong in `canvasContent`.
- If upload/import is part of the source-material flow, the pre-content canvas stays neutral and runtime-backed. Upload affordance belongs in `fileDrop`.
- DOM product text rendered inside `canvasContent` must be marked with `data-toolcraft-product-output` or `data-toolcraft-product-text` so tests and performance fixtures can target product output instead of app chrome.
- Product editing handles must be textless overlays, write to runtime state, and stay out of export/copy output.
- Preserve the runtime canvas backing. Runtime owns both finite and Infinity background surfaces; product renderers draw a transparent foreground and must not duplicate the configurable background or hide, replace, or make the Toolcraft canvas shell/backing transparent. Follow `core/setup-export.md` for background and export semantics.
- Runtime owns one product scene surface across finite and infinite modes. It resolves `sceneBoundsProvider` for the exact committed state in both modes and applies the same product rect before mounting live output or invoking product export. Product code does not position another scene wrapper from `canvas.size`, source pixel dimensions, or DOM measurement.
- Finite mode centers the artboard as a clip and output boundary around that canonical scene. A composition without `sceneBoundsProvider` may use the finite artboard rect as a finite-only product-frame fallback; Infinity has no such fallback.
- SVG presentation roots and transport wrappers allow overflow in both modes; the runtime artboard is the finite presentation clip. Library-created SVG viewports must not retain browser-default clipping. A product-owned mask/clip may implement an intentional artistic boundary, never an incidental source, layout, or buffer edge. Follow [intermediate output bounds](#intermediate-output-bounds) and the edge-pixel proof in `core/setup-export.md#infinity-canvas`; outer CSS cannot recover already clipped SVG or raster output.
- Canvas 2D, WebGL, and WebGPU product output reads `useToolcraftProductSceneFrame()` for the canonical product rect, backing size, and world-to-local translation. Mode toggles preserve the mounted component, renderer, and live backing. `empty` and `unavailable` are explicit Infinity states and never fall back to dormant finite dimensions.
- Imported image source pixels describe the resource, not its scene geometry. Runtime image transforms provide explicit world frames independently of intrinsic pixel size.

### Intermediate Output Bounds

- Intermediate rasterization, filters and vector tracing retain out-of-frame graphics. Derive their work area from actual geometry including signed extents, stroke widths and full filter support; preserve sample density and origin, then restore the result to the same layout coordinates. Do not clamp, fit or rescale graphics to the saved artboard. Source sampling bounds do not clip generated output. Size this work area from content in both modes, not from the Infinity toggle; only the runtime finite boundary crops its presentation. Resource exhaustion must report failure rather than silently crop or reduce quality.
- Edge-pixel proof for `content` passes covers the active generation, processing and preview paths: output beyond all affected edges, Background on/off and restored finite crop. Test a fully out-of-frame contributor and filter tails too. CSS overflow assertions alone cannot prove these cases.
- Every source/intermediate/preview pass in an `editable-output` product declares `sceneBounds` in its executable renderer inventory. This classification requirement excludes editor-only overlay and artifact-only export passes. A pass output role or operation kind does not determine its bounds classification.
- `{ kind: "intrinsic", reason }` declares a finite domain defined by the meaning of the output. The reason identifies that domain and explains why all intended output belongs within it. This classification requires no overflow acceptance case. Implementation limits do not establish an intrinsic domain. Intentional artistic clipping requires product/reference intent.
- `{ kind: "content", proofIds: [...] }` declares bounds determined by the output content and requires executable overflow proof. Each referenced `infinityOverflowCoverage` case includes the declaring pass in `passIds` and exercises its active processing path. A case may cover several passes when it observes each of them. Every declared content pass must have this proof.
- Generation and source transforms preserve geometry before rasterization, including fully out-of-frame contributors. Derive source work bounds from primitives, transform extents and filter support; carry buffer origin and sample scale through sampling, blending, tracing, live placement and export. An expanded buffer is not a larger image to fit back into the old frame. Test partial overflow, wholly outside contributors and scale/translation without coordinate or density changes. Do this in both modes; Infinity cannot restore pixels that a source stage has discarded.
- Each overflow row declares exact `passIds`, visible branch `controlValues`, and affected `edges`. Run the protected `expectToolcraftInfinityOverflowEvidence` recipe: it resolves the registered row, verifies branch controls and fresh pass execution/cache consumption, reads outside-artboard pixels with Background on/off, and checks finite clipping plus restoration. The recipe emits `infinity-output-overflow` only after all assertions succeed. Each content pass requires bounds evidence for its own active processing path. See [acceptance coverage](../acceptance-testing.md#infinity-canvas-coverage).
- Overflow rows use `kind: "runtime"`, `evidence: "rendered-pixels"` and a concrete browser descriptor. Import the helper from `e2e/browser-infinity-overflow-evidence`; supply the registered `requirementId`, a `prepare` action using real controls, and one probe per declared edge (`edge`, `along` between 0 and 1, `offset` of at least 2 CSS pixels, expected RGBA `colors`). Start on a mounted product. Declare every native selector/slider value that activates the branch. Preparation must execute or consume its passes. Samples lie within the runtime viewport, beyond the finite artboard; choose distinctive opaque colors that cannot match the empty canvas. Screenshots are decoded in memory, without image diagnostics. Test fully disconnected contributors and filter tails in the renderer's focused unit tests too.

## Model Presentation Boundary

- Runtime presentation is the default and owns model preview, hit testing, appearance resources, export composition, and cleanup.
- `scene.renderDefaultCanvasMedia: false` controls only generic image/file media. It never hides a standard runtime model layer.
- Custom model presentation is explicit: set `modelPresentation.mode` to `"custom"`, declare one unique consumer id per model `sourceTarget`, and include the matching visible `orientationGizmo` target when the model orbits.
- A custom canvas consumer calls `useToolcraftModelPresentationConsumer(declaration)` and acquires/releases presentation leases. It does not decode source formats, call `resolveDocument` to build a second Three cache, or reconstruct materials.
- Runtime reports typed retryable feedback when a declared consumer is missing or cannot acquire the presentation. Successful acquisition clears that feedback without deleting the committed model.

## State Boundary

- Bind every visible control to runtime schema state or a runtime command side effect.
- Use `defaultValue` for resettable controls.
- Use runtime commands such as `controls.reset`, `controls.resetTargets`, `media.import`, `media.delete`, `canvas.center`, `history.undo`, and `history.redo`.
- Do not keep final product settings in isolated local React state when they need reset, persistence, import/export, keyframes, browser acceptance, or product export.
- Runtime workspace persistence is enabled by default and owned by `ToolcraftRoot`: values, canvas, and panels are the base slices, with enabled timeline, layers, and media added automatically. Product code does not call localStorage or IndexedDB directly.
- localStorage is the versioned metadata boundary. Binary media bytes belong to the Toolcraft IndexedDB repository; state, history, settings JSON, and snapshots carry typed resource references instead of durable data URLs.

## Generated App Source Boundary

- Generated applications keep their public entry surface in `src/app/app-composition.tsx` and `src/app/app-schema.ts`. Supporting product modules may live anywhere under `src`; every product production module is discovered by the same source inventory and checked by the same AST boundary.
- `src/app/app-identity.ts` is generator-owned and protected even though it lives beside editable product modules. Choose the product identity and title with the CLI `--name` option before generation; import the generated `appIdentity` into `base.identity` without editing that file or duplicating its values. A different generated identity requires fresh generation, not an integrity-manifest rewrite.
- The signed framework bootstrap includes `index.html`, `src/main.tsx`, `src/router.tsx`, `src/routes/index.tsx`, `src/routes/root.tsx`, and `src/styles.css`. Do not edit or replace those host files in a generated app.
- Product styling is local by construction: use locally imported `*.module.css` files only. Every selector starts with a compound containing a local class. A first-compound `:is()` or `:where()` remains local only when every branch is locally anchored; `:not()` and `:has()` do not create a local anchor. Descendants may style product-owned children, but `:global`, bare/root selectors, host-attribute selectors, sibling escapes, CSS `@import`, package CSS imports, and product-created global `<style>`/`CSSStyleSheet` injection are rejected because they cross the product/runtime boundary.
- Product `import()` and `require()` specifiers must be statically resolvable from literals, same-file constants, templates, or string concatenation. Production and test source share this rule, so computed module loading cannot hide a runtime/control import or a protected evidence channel. Every deep control implementation import is rejected regardless of imported symbol name, and JSX control-substitute checks follow public `Input` aliases.
- Product production modules must not import product tests, test-support modules, or protected browser-evidence internals, directly or through a product bridge. Runtime evidence is emitted only by the protected public acceptance/performance helpers after their assertions pass; product-owned source must not import, re-export, assemble, or forge the reserved evidence module names and payload identifiers.
- Product production modules must form an acyclic dependency graph. The code-health gate resolves relative imports, directory `index.*` modules, configured TypeScript path aliases, and local package exports. Type-only imports, external packages, tests, and copied Toolcraft framework internals do not create product dependency edges. When a cycle exists, the gate prints the complete shortest cycle so the ownership boundary can be corrected directly.
- Imported product source remains under `src`. Code health and product-boundary analysis consume the same canonical source-inventory semantics instead of maintaining independent recursive walkers. The signed Vitest reporter uses the canonical framework-ownership policy to distinguish product-owned runner results, while acceptance and performance requirements derive from typed app configuration.
- Do not edit `src/toolcraft` in a generated app. It is an immutable signed copy of the shared runtime. Fix the monorepo runtime and regenerate the app.
- Generated integrity protects the copied runtime, signed host/bootstrap, framework validators/tests, `AGENTS.md`, local contract docs under `docs/toolcraft`, `LICENSE.md`, `NOTICE.md`, TypeScript/Vite/Vitest/Playwright root configuration, and the commands of the original package scripts. Alternate root config files in those verification families are rejected instead of silently creating a second test path. `docs/toolcraft/agent-worklog.md` is the required editable product worklog, and `docs/toolcraft/workflow-observation.md` is the optional editable post-delivery observation; every other file added under `docs/toolcraft` is rejected as unrecorded contract input. Product dependencies, unrelated product scripts, product source, the worklog, and the observation remain editable, but all product production modules are AST-checked for host-surface and built-in-control bypasses. The worklog stays inside verification inputs, while the post-delivery observation stays outside `sourceHash` so recording results cannot stale a successful receipt. Added `pre*` or `post*` lifecycle hooks for a protected script are rejected because they can execute across a verification boundary. Run the checker directly before the final gate; `npm run test` must fail when any protected file changes, or when the copied runtime tree or its signed integrity manifest is missing, changed, or contains unrecorded source.
- Generated apps must not contain monorepo app/package folders, workspace-protocol dependencies, or workspace package imports.
