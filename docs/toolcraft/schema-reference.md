# Schema Reference

> Reading route: start with `workflow.md`. Core generated-app rules live in `core/*`; this file is a field reference for `src/app/app-schema.ts`.

Edit `src/app/app-schema.ts` as the public product surface. Use only `defineToolcraft({ base, modules })`: `base` owns product identity and product-authored facts, while canonical module factories own standard Timeline, Layers, media, spatial/canvas behavior, and artifact surfaces.

## Runtime Shape

Top-level product-definition fields are `base`, `modules`, optional source `defaults` and optional `authoredStateMigration`. Preserve the generated `app-defaults.json` import and `defaults: appDefaults` input; [Save App Defaults](./core/setup-export.md#save-app-defaults) defines capture, validation and Reset semantics. Product-owned schema fields live under `base`:

| Field              | Purpose                                                                              | Detailed rules                                                             |
| ------------------ | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| `identity`         | Required stable product id and human-readable title.                                 | `core/runtime-boundary.md`                                                 |
| `canvas`           | Product workspace, output size, upload/drop support, render scale.                   | `core/runtime-boundary.md`, `core/setup-export.md`, `core/media-upload.md` |
| `media`            | Predefined attached files, images, and models shown in `fileDrop`.                   | `core/media-upload.md`                                                     |
| `panels.controls`  | Product-authored control sections.                                                   | `core/runtime-boundary.md`, `core/layout.md`                               |
| `toolbar`          | History, radar, theme, zoom.                                                         | `assembly-workflow.md`                                                     |
| `persistence`      | Opt-out or additional product value targets; slices/key/version resolve canonically. | `performance.md`, `acceptance-testing.md`                                  |
| `settingsTransfer` | Runtime settings codec metadata; Setup owns source defaults.                            | `core/setup-export.md`                                                     |
| `modules`          | Opaque canonical factories for standard capabilities and surfaces.                   | `assembly-workflow.md`                                                     |

Schema controls always bind to a `target`, use `defaultValue` for reset behavior, and include `performanceRole` / `performanceReason` on visible non-action controls. Use built-in control `type` values before `controls.renderers`. Built-in targets have one canonical runtime value model through defaults, seeded/live state, undo/reset, persistence, settings transfer, and keyframes; renderers never decode React callback shapes. `color` state is an expanded uppercase `#RRGGBB` string even though Color emits `{ hex }`. Compound/collection values keep their documented models; ordinary `fileDrop` bytes stay outside `state.values`.

Representation changes use the pure [authored-state migration](./authored-state-migration.md) hook before canonical defaults, persistence and settings readers.
## Canvas

Canvas sizing modes:

- `editable-output`: product/export apps. Runtime `Setup` shows Background beside Infinity canvas, then Background color beside the Blanc/Dots workspace selector, `Aspect ratio`, `Canvas width`, `Canvas height`, optional `Resolution scale`, and finally optional `Timeline`. Background and Infinity are independent by default; an enabled background fills the infinite viewport with the selected color.
- `intrinsic-media`: explicit media-viewer/source-native products where imported media intentionally owns `canvas.size`.
- `fixed-output`: non-product/internal fixtures where users must not edit output size.

Product-output, exportable, shader, procedural, and reference-clone apps use `editable-output`. Uploaded background/source images inside a product canvas also use `editable-output`: keep the current canvas size and render the image as cover/crop inside current canvas bounds.

`canvas.mode` is runtime state with values `"finite"` and `"infinite"`; it is not a second schema sizing mode. `canvas.infinity` is the reserved built-in Setup target. Both modes share one product scene frame. Infinite mode preserves `canvas.size` only for later finite restoration; finite mode uses that size for the centered artboard clip/output boundary, not as a substitute for declared product bounds.

Editable-output apps may opt into Infinity for a fresh workspace and Reset with
`canvas.sizing: { defaultMode: "infinite", mode: "editable-output" }`. Omitting
`defaultMode` keeps the runtime default finite. A valid persisted or explicitly
provided initial canvas mode takes precedence over the schema default.

Custom product output declares bounds on the composition:

```tsx
export const appComposition = composeToolcraftApp(appSchema, {
  scene: {
    canvasContent: <ProductCanvas />,
    sceneBoundsProvider: ({ state }) => [getVisibleProductSceneRect(state)],
  },
});
```

The provider returns world-space `{ x, y, width, height }` rectangles for one exact state in both finite and infinite modes. Runtime uses the same provider rect for live product output and product export. Finite still export crops to the saved artboard. Infinity still export unions visible image/model/product bounds and optional renderer `getContentBounds` overflow, independently of Background. Video retains its saved-artboard boundary and evaluates each scheduled state once without a union prepass. Without a provider, only finite mode may fall back to the artboard rect. Canvas 2D, WebGL, and WebGPU product output calls `useToolcraftProductSceneFrame()` inside `canvasContent` for the canonical product rect, backing size, and world-to-local translation without remounting or reallocating solely for a mode toggle. Product code does not read DOM bounds, infer image scene geometry from source pixels, or author a time-range envelope.

Use `canvas.renderScale: true` or `canvas.renderScale: { step }` only for non-vector raster previews such as Canvas 2D, WebGL, or WebGPU. For this field, product code may customize only the slider step; authored schema cannot set `enabled`, `min`, `defaultValue`, or `max`. Runtime resolves enabled render scale to `{ enabled: true, min: 1, defaultValue: 2, max: 2, step }`, using `0.25` when no step is authored. A custom step must be finite, between `0.01` and `1`, and evenly partition the canonical `1..2` range so `2` remains reachable; invalid input fails fast. Do not enable it for DOM/SVG/vector-native previews. Enabling it requires one browser runtime acceptance row targeting `canvas.renderScale` with `renderScaleCoverage.kind: "selected-backing-pixels"` and exact sorted states `["interaction", "steady"]`, plus `"playback"` when timeline is enabled. The fixed `canvas-render-scale-backing` recipe proves actual backing pixels rather than timing.

## Media Defaults

Use `media.defaultAssets` for predefined files, images, or model packages with complete local appearance dependencies:

```ts
media: {
  defaultAssets: [
    {
      id: "default-source",
      assetKind: "image",
      dataUrl: "data:image/png;base64,...",
      fileName: "source.png",
      sourceTarget: "source.image",
    },
    {
      id: "default-model",
      assetKind: "model",
      fileName: "scene.gltf",
      sourceTarget: "source.model",
      sourceFiles: [
        {
          dataUrl: "data:model/gltf+json;base64,...",
          path: "scene/scene.gltf",
        },
        {
          dataUrl: "data:application/octet-stream;base64,...",
          path: "scene/geometry.bin",
        },
      ],
    },
  ],
}
```

`sourceTarget` must match a compatible `fileDrop` control target. Runtime shows the asset as an attached file, users can remove it, and Reset restores it. Model defaults require `assetKind: "model"`, a root `fileName`, and complete local `sourceFiles`; each source uses a serializable `dataUrl` plus its bundle-relative `path`. Runtime restores default models through the same validation, analysis, repair, repository, and rendering pipeline as a user upload. Persisted empty media remains empty until Reset and must not silently resurrect defaults.

For a multi-item `fileDrop`, `recommendedMaxItems` is advisory. `hardMaxItems`, when present, must be a finite nonnegative safe integer and is enforced before decode or storage allocation. Additive imports count current assets with the same `sourceTarget` plus the incoming logical batch; replacement imports count only the incoming batch. A `fileDrop` with `assetKind: "file"`, `multiple: true`, and `variant: "collection-actions"` may declare `itemControls`; each entry uses a supported built-in collection item control and declares `defaultValue`. Attached files render these controls directly beneath their upload row, values persist at the parent target as records keyed by `mediaId`, and file bytes remain runtime-owned media.

## Model FileDrop

Declare appearance-preserving 3D import through the built-in control:

```ts
model: {
  type: "fileDrop",
  assetKind: "model",
  target: "source.model",
  label: "Model",
  topologyProfile: "realtime-mesh",
  modelFormats: ["glb", "gltf", "fbx", "obj", "stl", "ply"],
  modelLimits: {
    maxTriangles: 1_000_000,
  },
  performanceRole: "workload",
  performanceReason: "Imported topology controls decode, analysis, repair, and render cost.",
}
```

`modelFormats` may narrow the production adapters but cannot advertise an unavailable format. `modelLimits` may narrow normalized runtime admission limits; do not widen protected ceilings in product code. `topologyProfile` is `"realtime-mesh"` or `"solid-mesh"`. Model upload is one package (`multiple: false`): a standalone root, a folder batch with relative paths, or one bounded ZIP. Runtime preserves the supported authored appearance subset, selects the first normalized supported root, and uses the Blender-compatible fallback only when authored appearance is absent. Product code does not add loaders, topology state, repair actions, material reconstruction, or a second model store/cache.

Composition declares the presentation owner:

```ts
export const appComposition = composeToolcraftApp(appSchema, {});
```

For a true custom model canvas, use `mode: "custom"` with unique `{ id, sourceTarget, orientationTarget? }` declarations and mount `useToolcraftModelPresentationConsumer` for each declaration. Custom consumers acquire and release presentation leases; they never parse source files or call format loaders. `renderDefaultCanvasMedia: false` does not suppress runtime model presentation.

## Panels

- `panels.controls` contains product sections after mandatory runtime `Setup`.
- `layersModule()` requires an explicit user request for a workflow with layers, such as selection, reorder, grouping, visibility, or layer-based media management. Multiple objects or uploads alone do not enable it.
- `timelineModule({ mode })` is required for product animation, keyframes, playback, and video export.

Timeline compact/extended presentation is runtime UI state owned by the auto-injected `Setup` switch. Do not create product targets for `panels.timeline.extended`.

## Toolbar

`toolbar` configures runtime-owned controls:

```ts
toolbar: {
  history: true,
  radar: true,
  theme: true,
  zoom: true,
}
```

History owns undo/redo and keyboard shortcuts. Do not add route-local undo/redo listeners. Standard shortcuts operate from focused non-text controls such as sliders and switches; active text-entry fields retain native text undo until editing ends.

## Control Fields

`ToolcraftControlSchema` is a closed discriminated union, including nested `itemControl`/`itemControls`. Built-ins accept only their own fields and default input, even through variables/spreads; use `satisfies ToolcraftControlSchema`. Unknown JSON/commands still use runtime decoding for bounds, option membership, and compound invariants. Custom types require `defineToolcraftCustomControlType` (see `custom-controls.md`): this is a source-only type/name migration, not a change to renderer-map keys, targets, persisted values, or keyframes. Shared semantics and component-specific fields:

| Field               | Purpose                                                                                                                                                                                                   |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `type`              | Built-in type or registered custom renderer type.                                                                                                                                                         |
| `target`            | Runtime state target.                                                                                                                                                                                     |
| `defaultValue`      | Initial value and reset value.                                                                                                                                                                            |
| `label`             | Short UI label, `false`, or omitted.                                                                                                                                                                      |
| `description`       | Product-specific help text only when it adds meaning beyond the label.                                                                                                                                    |
| `applicability`     | Required product claim: `{ mode: "always" }` or `{ mode: "conditional", all: [...] }`. Hidden values are preserved.                                                                                       |
| `orderRole`         | Makes section order testable.                                                                                                                                                                             |
| `semanticGroup`     | Language-independent product sub-entity/workflow grouping, recommended where it clarifies a section; required on every plain Color when a mixed section contains multiple plain Colors. |
| `sliderValueKind`   | `slider` intent: `"continuous"` or `"discrete"`.                                                                                                                                                          |
| `textValueKind`     | `text`/`code` intent: `"single-line"`, `"multiline"`, or `"structured"`.                                                                                                                                  |
| `curveIntent`       | `curves` composition: `"single-value-map"` or `"color-channels"`.                                                                                                                                         |
| `performanceRole`   | `"workload"` or `"responsiveness"` for coverage derivation.                                                                                                                                               |
| `performanceReason` | Why the role fits this app.                                                                                                                                                                               |
| `commitMode`        | `text` controls: `"content"` applies while typing, `"setting"` commits on blur/Enter.                                                                                                                     |
| `keyframeable`      | Timeline/keyframe capability override when structurally needed.                                                                                                                                           |
| `variant`           | Component-specific variant.                                                                                                                                                                               |

Every authored product control declares `applicability`: use `{ mode: "always" }` when the control remains usable, or `{ mode: "conditional", all: [...] }` when every predicate must match. Inactive controls are absent while values remain preserved. Branch proof is declared separately through the Control Section Inventory's `finiteSelectors`; an `always` declaration does not create implicit sibling fanout. Do not use `disabled`, `disabledWhen`, or inert visible controls for availability. Omitted applicability and control-level `visibleWhen` are rejected before materialization. Section `visibleWhen` remains a supported conditional section-layout feature. For explicitly user-requested application modes, follow [Explicit Product Modes](./core/layout.md#explicit-product-modes): the always-reachable mode selector is in the first product section after Setup, its finite-selector branch declares `productMode: { request, sharedTargets }`, and every mode-specific control directly references that selector in applicability. The schema value is the single mode owner; no hidden scope selector or synchronization state is needed.

Conditions support `equals`, `notEquals`, `oneOf`, `notOneOf`, `greaterThan`, `greaterThanOrEqual`, `lessThan`, and `lessThanOrEqual`. Reserved runtime targets include `runtime.settingsTransfer`, `canvas.infinity`, `canvas.aspectRatio`, `canvas.size.width`, `canvas.size.height`, `canvas.renderScale`, and `panels.timeline.extended`; product sections must not declare them.

## Built-In Control Types

[//]: # (toolcraft-contract:built-in-control-table:start)
| `type` | Runtime visual owner |
| --- | --- |
| `aspectRatio` | `CanvasAspectRatioControl` |
| `slider` | `Slider` |
| `rangeSlider` | `RangeSlider` |
| `text` | `TextInput` |
| `rangeInput` | `RangeInput` |
| `code` | `CodeTextarea` |
| `select` | `Select` |
| `segmented` | `Segmented` |
| `tabs` | `TabsControl` |
| `switch` | `Switch` |
| `checkbox` | `Checkbox` |
| `actions` | `Actions` |
| `collectionActions` | `CollectionActions` |
| `sourceCollection` | `ControlsPanelCollectionItems` |
| `panelActions` | `PanelActions` |
| `colorOpacity` | `ColorOpacity` |
| `palette` | `Palette` |
| `vector` | `Vector` |
| `orientationGizmo` | `ToolcraftOrientationGizmo` |
| `color` | `Color` |
| `gradient` | `Gradient` |
| `fontPicker` | `FontPicker` |
| `curves` | `Curves` |
| `anchorGrid` | `AnchorGrid` |
| `channelMixer` | `ChannelMixer` |
| `fileDrop` | `FileDrop` |
| `imagePicker` | `ImagePicker` |
| `settingsTransfer` | `SettingsTransfer` |
[//]: # (toolcraft-contract:built-in-control-table:end)

Use `component-rules.md` for component-specific fit, labels, variants, units, parser behavior, and exceptions. `sourceCollection` renders a supported built-in `itemControl` for a source-owned array without add/remove UI; `collectionActions` owns user cardinality and its limits. Use `itemControl` for one homogeneous repeated value. For one logical repeated entity made from two or more built-in fields, use `itemControls`; for example, `{ type: "collectionActions", target: "surface.layers", defaultValue: [{ strength: 0.4, invert: false }], itemControls: { strength: { type: "slider", defaultValue: 0.5 }, invert: { type: "switch", defaultValue: false } } }`. Every field requires `defaultValue`; `itemControl` and `itemDefaultValue` are invalid competing template sources. `+` appends the complete defaults, `−` removes the final record, edits preserve sibling/product keys, and runtime places a line only between compound records without `Item N` headings. Standalone color `itemControl` remains a divider-free two-column grid. Use `core/control-selection.md` before deciding a custom control is needed. Top-level product sliders opt into `editableRange: { hardMin?, hardMax? }` for blur/Enter scale edits; see [Editable Slider Ranges](./core/slider-ranges.md) for limits, persistence and fallbacks.

Compound `collectionActions.itemControls` fields opt into nested timeline tracks individually with `keyframeable: true`; capable siblings default to no nested track. A selectable collection declares one own nullable `selectionTarget`, initially `null`, which runtime materializes for settings transfer and persistence. Use only `controls.addCollectionItem`, `controls.removeCollectionItem`, `controls.selectCollectionItem`, and `controls.setCollectionItemField` for collection interaction. Nested addresses use the runtime-reserved `toolcraft:collection-item:v1:` namespace and its exported codec; product targets must never use that prefix. Runtime preserves nested tracks for field edits/appends, prunes removed suffixes, and prunes all tracks on full parent replacement or settings import. Persistence retains only valid same-snapshot tracks unless an explicit initial collection replacement supplies its own matching timeline.

`orientationGizmo` uses a non-degenerate `{ position: [x, y, z], up: [x, y, z] }` default, `label: false`, and `keyframeable: false`. Declare one target for the active/selected model and keep it beside at least one visible product control in the semantic model/view section; runtime renders the handle on the canvas rather than in the controls panel. Multiple declarations require statically provable mutually exclusive combined section/control visibility conditions, because runtime permits at most one active orientation handle.

## Product View Interaction

Product-mode `appProductReadiness` always declares the spatial view decision
before schema controls or renderer code:

```ts
export const appProductReadiness: ToolcraftProductReadiness = {
  exportIntent: { image: { mode: "toolcraft-default" }, svg: { mode: "not-requested" }, video: { mode: "not-requested" } },
  interactionOwnership: [],
  mode: "product",
  productName: "Model Studio",
  productSummary: "An editable three-dimensional product scene.",
  requestedBehavior: "Rotate the model and export the selected view.",
  viewInteraction: {
    mode: "orbit",
    orientationTargets: ["view.orbit"],
  },
};
```

## Interaction Surface Ownership

Product readiness declares `interactionOwnership` before controls or canvas
interactions. Each operation uses one primary surface while distinct operations
may edit related state across surfaces:

```ts
interactionOwnership: [
  {
    alternative: {
      reason: "A panel copy would separate the same drag from visible output.",
      surface: "panel",
    },
    capability: "direct-spatial-edit",
    evidence: {
      detail: "The inspected reference exposes draggable handles over output.",
      source: "reference",
    },
    id: "output-position-drag",
    reason: "Canvas drag preserves spatial correspondence and immediate feedback.",
    surface: "canvas",
    target: "output.position",
  },
  {
    alternative: {
      reason: "The canvas would obscure output with persistent property chrome.",
      surface: "canvas",
    },
    capability: "property-edit",
    evidence: {
      detail: "A usability comparison keeps non-spatial properties discoverable.",
      source: "usability-analysis",
    },
    id: "output-position-properties",
    reason: "The panel exposes useful properties without duplicating direct drag.",
    surface: "panel",
    target: "output.position",
  },
];
```

Capabilities are `direct-spatial-edit`, `spatial-selection`,
`structured-selection`, `property-edit`, `precise-value-entry`,
`collection-edit`, and `command`. Evidence sources are `user-request`,
`reference`, and `usability-analysis`. Canvas handles and custom interactions
reference the inventory through acceptance `interactionId`; a built-in panel
control also references it when its target overlaps a canvas handle.

Use `non-spatial` only when no visible three-dimensional scene/model exists.
Use `fixed-camera` or `timeline-camera` only with positive typed `authority`.
`{ kind: "explicit-user-request", requestQuote }` uses verbatim user text;
`{ kind: "inspected-behavioral-reference", referenceId, observedBehavior }` names
an observed interaction. Static frames cannot prove locked interaction; timeline camera also requires timeline intent, and orbit targets match schema gizmos.

## Control Section Inventory

Before writing `base.panels.controls.sections`, declare the controls in `appSchema` and export `appControlSectionInventory` beside `appAcceptance`. This complete section example shows the selector contract shared by all three.

Section `description` is tooltip-only and must add meaning beyond the concise title and visible controls. It never replaces concise section naming; omit it when the section scope and output relationship are obvious.

```ts
const shapeSection: { controls: Record<string, ToolcraftControlSchema>; description?: string; id: string; title?: string } = {
  controls: {
    amount: {
      applicability: { mode: "always" }, defaultValue: 0.5, max: 1, min: 0,
      sliderValueKind: "continuous", target: "shape.amount", type: "slider",
    },
    character: {
      applicability: { mode: "always" }, defaultValue: "soft",
      options: [{ label: "Soft", value: "soft" }, { label: "Sharp", value: "sharp" }],
      target: "shape.character", type: "select",
    },
    detailColor: {
      applicability: { all: [{ equals: "star", target: "shape.kind" }], mode: "conditional" },
      defaultValue: "#FFFFFF", target: "shape.detailColor", type: "color",
    },
    kind: {
      applicability: { mode: "always" }, defaultValue: "circle",
      options: [{ label: "Circle", value: "circle" }, { label: "Star", value: "star" }],
      target: "shape.kind", type: "segmented",
    },
  },
  id: "shape", title: "Shape",
} as const;
export const appControlSectionInventory = [{
  entity: "Shape", entityId: "shape",
  finiteSelectors: [
    {
      affectedTargets: ["shape.amount"],
      reason: "Shape kind selects parameter families with different relevance.",
      role: "branch", target: "shape.kind",
    },
    {
      reason: "Character changes its glyph without changing peer relevance.",
      role: "parameter", target: "shape.character",
    },
  ],
  groupingReason: "These controls edit one rendered shape.",
  id: "shape",
  targets: ["shape.kind", "shape.character", "shape.detailColor", "shape.amount"],
  title: "Shape",
}] as const satisfies readonly ToolcraftControlSectionInventoryEntry[];
```

- Every product control target appears exactly once in the inventory. Runtime-owned `Setup`, sticky footer `Export`, settings transfer, and runtime canvas sizing targets do not need entries. The product targets authored in the standard `Background` source section remain in its `Background` inventory entry after runtime relocates those controls into `Setup`. Stable `entityId` is the primary grouping authority; target namespaces are only secondary diagnostics.
- Every bounded finite product selector appears exactly once in `finiteSelectors`. Use `branch` only when changing the selector changes which peer settings are relevant; list its exact always-visible peers in `affectedTargets`. Explicit applicability predicates add their dependents automatically, so `shape.detailColor` is not repeated for `shape.kind` above. Predicate owners must be branches.
- Use `parameter` when a finite selector changes only its own accepted output. Parameters still require their own acceptance row and complete option coverage, but they do not expand unrelated peer proof.
- Continuous controls such as `shape.amount` are absent from `finiteSelectors`. The field is required on every inventory entry, including `finiteSelectors: []` when the section has no bounded selector.
- Group by user task, dependencies, and section reset scope. Ten declared controls triggers a non-blocking density review, not a maximum. Inspect simultaneously visible controls in reachable modes, actual panel height, compound-editor complexity, and navigation; a declaration count is not a visual-density measurement. Use `semanticGroup` where it clarifies product subgroups; mixed plain-color rows retain their mandatory grouping contract.
- Keep a coherent workflow together even above ten controls. Split any-size entities only when distinct user tasks and reset scopes justify it; every split section keeps the same `entityId` and `entity`, declares a unique `workflowStage`, and provides a concrete `splitReason`. A one-control stage is valid for a complete task, including an atomic compound editor, not as a numeric remainder. Never split or merge solely because of a count.

## Transfer Metadata

Reference and motion metadata lives in `appTransferMode`.

Use `transferMode: "reference-runtime-clone"` when porting an existing app unless the user explicitly asks for redesign. Reference clones declare `referenceStudy`, `referenceFeatureInventory`, and acceptance mapping; detailed evidence requirements live in `core/reference-study.md`.

Every product readiness declaration includes required `exportIntent`. Its resolved image/SVG/video capabilities must correspond exactly to typed schema actions, applicable settings sections, and artifact acceptance. Use `core/setup-export.md` for the authoritative modes, evidence requirements, and decision sequence.

Motion references declare typed `referenceInputs` before implementation; each behavior maps bidirectionally to observable acceptance and browser `reference-parity`. The canonical preprocessing, sampling, evidence, timing, and no-reference rules live in `core/reference-study.md`. Animated products declare `animationIntent`, and playback/keyframe timeline apps declare a proven loop duration when known. Detailed animation rules live in `core/timeline-animation.md`.

## Export And Actions

Product apps expose enabled artifact delivery through sticky `panelActions`, not canvas UI or ordinary body controls. `productReadiness.exportIntent` is required: image export defaults on and is absent only with explicit removal evidence; SVG/video exist only with explicit user-request evidence. Renderer technology, animation, playback, keyframes, and timeline presence never change that intent.

Every app with `Export PNG` includes `Image Export` controls with `export.image.format` and `export.image.resolution`. Apps with `Export Video` include `Video Export` controls with `export.video.format` and `export.video.resolution`. Enabled SVG joins `export.image.format` and uses the same still-export button; resolution is absent while SVG is selected and its stored raster value is preserved. Typed image/SVG backend actions retain their individual artifact proof requirements. SVG-only apps keep one SVG button with no raster settings. Resolved layouts must match `core/setup-export.md` exactly.

Use canonical `imageExportModule()`, `videoExportModule()`, and `svgExportModule()` factories; they own standard settings and typed actions. Product code provides transparent-foreground `scene.rasterFrameRenderer` content for image/video pixels or `scene.vectorFrameRenderer` for editable SVG nodes through `composeToolcraftApp`; runtime owns live background surfaces, artifact composition, frame/sizing, SVG validation/serialization, raster/video encoding, download, progress, and errors.

Detailed Setup, Background, Image Export, Video Export, sticky action, icon, and progress rules live in `core/setup-export.md`.

## Persistence

Generated apps persist their runtime workspace locally by default. The resolved base plan contains `"canvas"`, `"panels"`, and `"values"`; enabled timeline, layers, and media capabilities add `"timeline"`, `"layers"`, and `"media"` automatically. Most apps do not need a `persistence` field.

Use product persistence only to add non-control value targets:

```ts
persistence: {
  storage: "localStorage",
  additionalValueTargets: ["composition.layout"],
}
```

Identity owns the canonical key and current version; resolved modules own required slices. Product code cannot author `key`, `version`, or `include`. Control-backed values persist automatically; `additionalValueTargets` opts product-owned non-control state into persistence after trimming and deduplication, while empty entries and undeclared values remain excluded. `{ storage: "none" }` is the only opt-out; record why losing the workspace on reload is intentional.

localStorage contains only small versioned JSON metadata. Image, file, and model bytes live in the Toolcraft binary repository backed by IndexedDB; persisted media records contain resource references, never data URLs. Product code must not read or write either storage API directly. Reset restores schema defaults, Settings Transfer remains the portable JSON boundary, and unavailable binary resources become typed per-asset failures without discarding other restored slices. Before each save, runtime checks the snapshot this tab loaded or last saved. Intervening changes pause writes (`stale-snapshot`) with **Saving paused**; **Reload saved workspace** discards local unsaved edits and restores the latest saved state. Equivalent JSON key order is ignored. This optimistic guard does not merge tabs or provide atomic transactions for simultaneous writers; product code must not add its own conflict UI or retries.

Every local app declares `persistenceCoverage: "reload"`, `evidence: "persistence-state"`, and `persistenceSlices` exactly equal to the resolved `schema.persistence.include`, then proves the visible workspace after a real browser reload.

## Settings Transfer

`settingsTransfer` customizes retained runtime settings codec metadata; it does not add Export Settings / Import Settings buttons:

```ts
settingsTransfer: { enabled: "auto", additionalValueTargets: ["composition.layout"] };
```

Allowed values are `"auto"`, `true`, `false`, or `{ enabled, fileName, additionalValueTargets }`; `base.identity` is the only app identity authority and `appId` cannot be authored. Control-backed values transfer automatically; `additionalValueTargets` opts product-owned non-control state into settings JSON while undeclared values stay excluded. Transfer and persistence allowlists are independent; both are trimmed and deduplicated during resolution. None of these options hide mandatory runtime `Setup`; do not implement settings import/export through product actions, hidden file inputs, or route-local handlers.
