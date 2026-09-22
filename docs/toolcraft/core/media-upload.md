# Media Upload

Read this module before changing image upload, file upload, source material import, media defaults, source images, sorting, or image transform actions.

## FileDrop Ownership

- Use `fileDrop` for source material uploads in the controls panel.
- Do not place upload UI on the canvas.
- Do not build custom file lists, custom upload buttons, or custom sorting when `fileDrop` can represent the source set.
- Use `assetKind: "image"` for image-only source uploads.
- Use `assetKind: "file"` for arbitrary uploaded files.
- Use `assetKind: "model"` for one 3D model package whose supported authored appearance should survive import.
- Image mode accepts images only by default.
- File mode accepts any file by default unless `accept` narrows extensions or MIME types.

## Empty Source State

- When upload/import is part of the source-material flow, the empty product canvas stays neutral.
- Do not invent canvas placeholder artwork, CTA copy, helper text, fake sample output, decorative placeholder, or agent-made source preset before real content exists.
- A default procedural/reference source is allowed only when the prompt or reference explicitly defines it and the worklog records the evidence.

## Image Uploads

- In single-layer apps, the runtime shows uploaded image preview and clear button in the file control.
- Clearing removes the attached source from the renderer and canvas.
- With exactly one uploaded image, image transform actions are visible immediately.
- With multiple uploaded images, users select a thumbnail first; until then transform actions are hidden.
- Once selected, transform actions apply only to that selected image.
- The FileDrop panel preview is not product canvas rendering. It keeps a stable preview frame across rotate/flip actions and contains the transformed bitmap inside that frame.
- Horizontal or vertical uploads must not be cropped by the control preview.

## Image Transform Actions

- Runtime owns image transform actions directly below image uploaders.
- Actions render through the built-in `actions` control, not through a custom image action grid.
- Use one row of three compact action buttons:
  - `90°` for rotate right;
  - `Flip H`;
  - `Flip V`.
- Keep a 6px vertical gap between uploader and action row.
- Product preview/export consumes `state.mediaAssets[].transform`.
- Do not keep separate product-only image transform state.

## Multiple Uploads And Sorting

- Use `multiple: true` when the app needs several uploaded images or files as one source set.
- `recommendedMaxItems` is advisory and never rejects an import.
- Use `hardMaxItems` only for a real product or technical boundary. It must be a finite nonnegative safe integer and is enforced as an upload admission limit.
- Additive imports count existing assets for the same `sourceTarget` plus the incoming logical batch. Replacement imports count only the replacement batch. Assets for other targets do not consume this capacity, and deleting an item frees capacity.
- A batch above `hardMaxItems` is rejected with typed resource-limit feedback before media decode, worker preparation, or binary repository allocation.
- Multiple image uploads render as a sortable four-column thumbnail grid.
- The add-more tile is last.
- Per-image removal stays inside the file control.
- When the product explicitly requires the compact cardinality pattern used by `collectionActions`, set `variant: "collection-actions"` on an `assetKind: "file"` control with `multiple: true`. Its header `+` adds one empty FileDrop slot and `−` removes the final slot or its attached file; the wide add row and per-item remove actions are omitted so cardinality has one owner. When every attached file owns settings, declare built-in `itemControls` with a `defaultValue` for every entry: attached files render those settings directly below their upload row, empty pending slots render no settings, the parent target stores value records keyed by `mediaId`, and runtime media keeps ownership of file bytes and lifecycle. The upload row and its per-file settings form one logical group; runtime renders one content-width line only between adjacent groups and never adds `Item N` headings. Product renderers join both slices by `mediaId`; do not collapse per-file settings into a global sibling section.
- Dragging thumbnails updates runtime media order.
- Product renderers and exports consume runtime media order instead of keeping a separate product-only order.

## File Uploads

- In file mode, uploaded files render as a sortable list with a paperclip icon, filename, remove button, and `--border/5` separators.
- Long filenames fade/truncate at the end instead of hard-clipping.
- The last item has no bottom separator.
- The add row is part of the file control and uses the same width and hover behavior as list rows.
- The `variant: "collection-actions"` opt-in replaces that add row and the per-row remove buttons with the compact header `− / +` controls while preserving runtime media order.
- When an app contains both image and file uploaders, canvas drops route by asset kind:
  - image files prefer visible image uploaders;
  - non-image files prefer visible file uploaders;
  - file uploaders may accept images only when no image uploader matches.
- Product renderers filter `state.mediaAssets` by `sourceTarget`.

## 3D Model Uploads

- A model `fileDrop` is a runtime-owned compound control. Product code declares the target, optional `modelFormats`, optional narrowed `modelLimits`, and `topologyProfile`; it does not build loaders, topology UI, repair buttons, workers, or a parallel model state.
- Production formats are `glb`, `gltf`, `fbx`, `obj`, `stl`, and `ply`. The normalized default advertises every production format. Narrow the list only when product semantics require it; never advertise an adapter that is absent from the production worker registry.
- Import consumes a standalone root, the complete selected folder `File[]` batch, or one bounded ZIP archive. ZIP extraction runs in the model worker with path, entry-count, byte, compression-ratio, encryption, and source limits. Remote resources and path traversal are never fetched.
- Supported root paths are normalized and sorted; the first root is selected deterministically. Folder and equivalent ZIP inputs therefore resolve the same root and dependencies.
- The model pipeline preserves static authored materials, PBR factors, supported textures/samplers, alpha/double-sided flags, vertex colors, and supported static transforms. Lights, cameras, animation clips, rigs, skins, morph animation, unsupported extensions, and remote resources do not become renderer authority.
- If no authored material exists, preview and export use the Blender-compatible fallback: linear base color `[0.8, 0.8, 0.8]`, metallic `0`, roughness `0.5`, emissive `[0, 0, 0]`, opacity `1`. Missing appearance dependencies produce typed warnings and retain renderable geometry; they do not silently fabricate a texture.
- One accepted package becomes one model item and one model layer. The original selected files or ZIP archive remain immutable durable source. Canonical geometry/appearance version 2, repair plans, decoded bitmaps, and Three/GPU resources are derived artifacts outside Toolcraft state, history, and localStorage; serializable state stores validated resource references and analysis summaries.

### Analysis And Repair

- Import decodes and structurally validates in the runtime module worker before topology analysis or canvas presentation.
- Lifecycle is `clean`, `repairable`, `fixed`, `restoring`, or `unavailable`. Fatal input is rejected atomically and must not replace the last committed model.
- Runtime shows `Fix model` only when it has already compiled a deterministic safe repair plan. The action uses the built-in actions control and its canonical button loader; duplicate repair is disabled while the worker runs.
- Safe repair may remove invalid or duplicate triangles, compact unused vertices, regenerate normals, repair locally provable winding, and recalculate bounds. It must not weld, remesh, fill holes, smooth, merge shells, guess indices, or mutate authored transforms.
- Appearance diagnostics never expose `Fix model`. Repair changes only canonical geometry/topology and reattaches the validated appearance references; it does not recolor, replace materials, invent textures, or rewrite the durable source package.
- Repair commits only after the derived canonical document is structurally validated and topology is reanalyzed. Failure keeps the original committed model and exposes typed feedback.

### Preview, Orientation, And Export

- Omitted `modelPresentation` selects the standard lazy Three preview/export path. The dedicated `{ mode: "custom", consumers }` port suppresses standard layers only for declared model targets and requires each checked consumer to acquire/release a runtime presentation lease.
- `scene.renderDefaultCanvasMedia: false` hides generic image/file preview only. It does not hide standard runtime model layers.
- A structurally valid staged draft may preview during analysis without replacing committed state.
- Analyzing and repairing preview opacity is `40%`; committed preview and export opacity is `100%`.
- Rotatable model products use `orientationGizmo`. Direct drag on model geometry and the gizmo write the same orientation target against the same presentation lease; a canvas miss remains viewport pan. Preview, undo/reset, and export read that shared pose, canonical document reference, and appearance cache key.
- Runtime image/video export composites visible committed model layers at the exact scene frame, output size, pixel ratio, and shared orientation before awaiting the product's shared `scene.rasterFrameRenderer` frame. Product code does not enumerate model assets, call Three loaders, invoke model compositors, encode canvases, or download artifacts.
- Every scheduled video frame uses the same runtime model binding and shared pose; it cannot substitute the panel preview or omit model layers.

### Persistence And Proof

- Apps with image, file, or model media automatically resolve `"media"` into the default persistence plan. Serializable state and localStorage snapshots contain metadata plus durable resource references; binary bytes live in the Toolcraft IndexedDB repository and never enter runtime state, history, or snapshots as data URLs.
- Exact current image, file, and model records restore asynchronously through the shared source-asset coordinator. Missing, corrupt, forged, stale, inline-data-URL, or unavailable resources reject the affected persisted media slice rather than upgrading it or publishing partial state.
- Binary media snapshots contain repository references only. Non-current or inline-data-URL records are incompatible and are never migrated into the current snapshot.
- Reset restores default model attachments through the same async import pipeline. Delete, replacement, undo, redo, reset, hydration, and active jobs participate in repository reachability and cleanup.
- Model acceptance uses complete `modelImportCoverage` and protected browser recipes. Required proof covers every advertised format, package extraction, deterministic root selection, authored appearance, exact fallback, checked presentation readiness, nontransparent RGBA output, staged/committed output, repair diagnosis/action/progress/result, fatal preservation, persistence/unavailable restoration, preview/export parity, and history/reset.
- Model workload and responsiveness checks derive from normalized model limits and run as targeted model paths. Package extraction and canonical decode are worker passes; presentation, orbit, export, and cleanup are main-thread/GPU passes with frame and completion budgets. The combined geometry-plus-texture envelope, cache reuse, and disposal lifecycle are measured only with request authority; ordinary later feature work runs focused functional checks without refreshing the initial receipt.

## Canvas Source Images

- Uploaded background/source images inside product canvases use `editable-output`.
- Uploaded source images do not change `canvas.size`.
- Setup canvas controls remain visible.
- Draw source/background images as cover/crop inside current canvas bounds without letterbox or aspect distortion.
- Scale proportionally until the current canvas bounds are fully covered, then crop overflow at canvas bounds.
- Reserve `intrinsic-media` for true media-viewer/source-native products where imported media natural dimensions intentionally own `canvas.size`, and prove that with acceptance coverage.

## Default Assets

- Use `media.defaultAssets` when an app starts with predefined files, source images, masks, symbol sets, or background images.
- Each default asset sets `sourceTarget` to the matching `fileDrop` target.
- Runtime treats these as attached files: users see them in the uploader, can remove them, and Reset restores them.
- Removal, reorder, and transforms of predefined media survive reload through the capability-derived `"media"` slice unless the whole app explicitly opts out with `{ storage: "none" }`.
- Do not mirror the file list into product `values`.
- Do not hard-code default source files inside `canvasContent` or the renderer.

## Layers

- In multi-layer apps, deletion and visibility belong to the Layers panel.
- `fileDrop` stays an upload target.
