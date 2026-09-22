# Component Rules

> Reading route: start with `workflow.md`. Core generated-app rules live in `core/*`; this file is a focused component reference for the topic below.

## Control Decision Catalog

Use `core/control-selection.md` for the built-in fit check, exact control owners, compound-control ownership, actions, collection actions, vector ownership, and the custom control gate. Built-in controls own canonical runtime values, not callback payloads: product code reads the documented model without per-renderer parsing. Plain `color` is expanded uppercase hex; invalid live values are atomic no-ops and invalid restored/imported values use the canonical default.

## Dividers

Use `core/layout.md` for section dividers and compound-control divider rules. Component-specific exceptions are documented in the relevant component sections below.

## Sliders

- Slider `step` means numeric snapping only. It does not make a slider visually discrete by itself.
- Every slider declares `sliderValueKind: "continuous" | "discrete"`. This is product intent, not a visual alias: `variant: "discrete"` is valid only with `sliderValueKind: "discrete"`. Do not make validation depend on an English label or unit.
- Classify every stepped slider as either `stepped continuous` or `visual discrete` in the spec and schema tests.
- Use `variant: "discrete"` for semantic integer domains where markers help choose positions: counts, rows, columns, levels, bands, passes, points, tiles, segments, finite position choices, and finite animation-step controls such as flip depth, character count, glyph steps, or frame steps.
- Keep large or precision stepped ranges visually continuous, even with `step`: speed, FPS, rate, duration, seconds, milliseconds, density, size, intensity, quality, and other ranges with many positions.
- Visual discrete sliders and range sliders must declare finite `min` and `max` plus a positive `step`, and may expose at most 32 positions including endpoints. Endpoint ticks are omitted, so exactly 32 positions render 30 internal tick marks. At 33 or more positions, preserve discrete value semantics with `sliderValueKind: "discrete"` and `step`, but use the continuous visual variant or another built-in control. Lowering authored `markerCount` is not a valid workaround because the runtime derives the position and marker counts from `min`, `max`, and `step`.
- Schema sliders always render stacked at full width. Do not put `slider` or `rangeSlider` controls in two-column inline rows. The only built-in exception is `fontPicker`, whose letter-spacing and line-height footer sliders stay paired inside that component.
- Use slider `unit` only for real measurement suffixes: `%`, `px`, `°`, `s`, `ms`, `fps`, `rows`, `cols`, or a similarly useful domain unit. Do not use `unit: "x"`; scale, multiplier, intensity, opacity, strength, depth, and shader amount sliders display plain numbers unless a real measurement unit applies. Do not use `unit` to repeat the entity already named by the section or label. Avoid `Letters` + `letters`, `Shape Density / Count` + `shapes`, `Words` + `words`, `Symbols` + `symbols`, `Items` + `items`, `Particles` + `particles`, and `Layers` + `layers`. If the numeric value needs an entity noun to make sense, rename the label or section instead of appending the noun to the value. Compact units render tight (`70%`, `24px`, `8s`); word or acronym units render with a space (`5 cols`, `17 fps`) only when they are truly needed.
- Slider value labels are editable only when they contain a numeric value. Textual state labels such as `Normal` are display-only and must not expose hover or click editing affordances.
- Range sliders are always full-width two-thumb controls. Do not put a `rangeSlider` in an inline row. Its `defaultValue` must start with different lower and upper values, such as `[20, 80]`, so the control does not collapse into a single-value slider.
- Range slider value editing accepts common range separators such as `20/80`, `20-80`, `20 - 80`, `20 80`, and en-dash ranges. Use the built-in parser instead of adding custom label parsing.
- Discrete sliders must still drag smoothly. Heavy preview work may be coalesced, cached, or split into lightweight live feedback plus heavier refinement, but the canvas/product output must not stay unchanged until pointer release.
- Every product slider and range slider declares `applicability`. Use `mode: "conditional"` when it is meaningful only in some mode, type, source, include, variant, or count state. Every predicate in `all` must match; inactive branches disappear while their values remain preserved.
- Do not use schema `disabled: true` or `disabledWhen` for product sliders and range sliders. Product panels show only controls usable in the current state.
- For mode/type/source/include/count branches, declare conditional applicability instead of disabling. Example: when Texture is `Off`, texture pattern, upload, blend, and opacity predicates do not match. When Texture is `Image`, the uploader and shared texture settings match. When `Shades` is `2`, `Shade 3`, `Shade 4`, and `Shade 5` do not match. Do not keep inactive controls visible while making the renderer ignore them.
- If applicability points to a selector for the same target entity or selected branch, keep the selector and dependent controls together by default. A selector option alone does not justify a section. A distinct user task may use a separate workflow stage with shared entity identity, unique workflowStage, concrete splitReason, and normal applicability/acceptance evidence; do not split merely because the branch uses a standalone control or crosses a numeric threshold.
- An `always` declaration is testable, not a shortcut. Every bounded finite selector is classified exactly once in its Control Section Inventory as `branch` or `parameter`. A branch names the exact always-visible peer targets it affects through `affectedTargets`; explicit applicability predicates add their dependents automatically. Protected acceptance varies only those declared branch and predicate edges. A `parameter` changes its own accepted product outcome without expanding unrelated peer controls. Branch coverage preserves missing-predicate detection: a visible affected peer is reproved for every branch value, while a conditional dependent has matching presence/output cases and non-matching absence cases. A parameter still requires its own acceptance row and complete option coverage; the role is not an acceptance exemption. Predicate owners must be branches, predicate dependents must not be duplicated in `affectedTargets`, and continuous controls do not belong in `finiteSelectors`.

## Palette

- Use `palette` only when the product needs a constrained token palette: family plus shade. It is for design-system color tokens, not for arbitrary color entry.
- Use `color` for free hex colors, `colorOpacity` when opacity belongs to the same color entity, `gradient` for color transitions, and `fontPicker` when the color belongs to typography. Palette is a live control: family and shade changes update runtime state immediately, before delayed persistence/commit settles, so the next canvas interaction uses the selected token. Browser acceptance must change both `palette.family` and `palette.shade` and prove the rendered/exported output consumes both parts.

## Segmented Controls

- Use segmented controls only for compact mode choices that preserve every cell's internal padding.
- Segmented controls are full-width. Do not place `segmented` beside Switch, Color, Select, or another control in a two-column inline row; use `select` when a finite choice must occupy a half-width column.
- Text segmented controls allow at most 4 options, no option label longer than 9 characters, and no more than 24 total option-label characters.
- `defineToolcraft` rejects over-budget text segmented schemas before controls render. Shorten labels or use `select`; there is no silent conversion.
- If cells clip, collide, lose padding, or force labels into adjacent cells, shorten labels first. If compact labels still fail, use `select`.

## Tabs Controls

- Use `tabs` when one finite choice replaces the content or workflow view shown below the control. Use `segmented` instead for a compact mode setting that leaves the surrounding view unchanged.
- Tabs are full-width and never render a separate visible field label. The schema `label` supplies the accessible tab-list name; the nearest section title supplies visible context. Do not place `tabs` in a two-column inline row.
- Tabs preserve the same controlled value while adapting to available width. When every tab cell cannot keep its text and internal padding on one row, the runtime renders the choices through `Select`; when the width returns, it restores the tab row without changing the selected value.

## Select Controls

- Standalone `select` controls render stacked and full-width: label above, dropdown below. Do not use the old compact side-label form with label on the left and dropdown on the right.
- Use a two-column inline row only for related short `select` pairs that tune one workflow or entity, such as export `Format` and `Resolution`. If either label or selected value clips, truncates, or loses internal padding, stack the pair and record the fit reason.

## Slider Responsiveness

Use `core/performance.md` for live slider responsiveness, renderer optimization, and browser evidence requirements.

## Sections

Use `core/layout.md` for section grouping, dependency cohesion, headers, reset, collapse persistence, spacing, dividers, labels, inline rows, and color-row fit. Keep this page focused on component-specific behavior.

## Colors

Use `core/layout.md` for semantic color grouping, color labels, row fit, and color/opacity layout. A color-only section is one implicit bank. In a mixed section with multiple plain `color` controls, every plain color declares `semanticGroup`; matching type or adjacency alone never authorizes a shared row, and runtime pairs only adjacent colors in the same group. Use `core/setup-export.md` for the authored background source pair, its runtime Setup placement, and export background behavior. For repeated built-in controls, use `sourceCollection` for a source-owned array and `collectionActions` for a user-growable array; both support `checkbox`, `color`, `colorOpacity`, `fontPicker`, `rangeInput`, `rangeSlider`, `segmented`, `select`, `slider`, `switch`, `text`, and `vector` items, while unknown item types fail schema validation. Use scalar `itemControl` for one homogeneous repeated value. A `collectionActions` control may instead use `itemControls` only when two or more built-in fields form one logical target-array record that is added or removed atomically. Runtime places a line only between adjacent compound records and leaves standalone color grids unchanged. A multiple file-kind `fileDrop` with `variant: "collection-actions"` may declare `itemControls` to render built-in settings directly below each attached file and persist per-file values keyed by `mediaId`; its upload row and settings are one logical group under the same divider rule.

Within compound `collectionActions`, only a supported field explicitly declaring `keyframeable: true` gets a diamond and nested timeline row. Declare `selectionTarget` when panel properties or canvas interaction edit the selected record; runtime stores one nullable safe index and owns selection normalization across add/remove/reset/import/persistence. Product code dispatches the four structured collection commands and consumes evaluated parent arrays; it neither mutates arrays nor constructs nested track addresses.

## File Upload

Use `core/media-upload.md` for `fileDrop` ownership, image/file modes, multiple uploads, sorting, transform actions, canvas source images, default assets, and layer ownership.

## Image Picker

Every visible `ImagePicker` item must be actionable in the current product context. Do not show choices that sanitize to fallback or no-op behavior.

Sizing:

- two options: large tiles;
- three or six options: medium tiles;
- larger sets: small tiles.

Filter or split choices by template, mode, or selected object when only some choices are valid.

## Font Picker

- Use `fontPicker` for typography choices that need font preview plus weight, size, text-case, text color/opacity, letter-spacing, and line-height controls. Do not recreate it with a plain `select`, custom font list, or separate typography inputs.
- Letter spacing has seven positions centered on `normal` (0): `tightest` −0.1em, `tighter` −0.05em, `tight` −0.025em, `normal` 0, `wide` +0.025em, `wider` +0.05em, `widest` +0.1em. Preserve negative spacing in preview/export instead of clamping it to zero.
- Line height has seven positions centered on the kit's `normal` (1.5): `none` 1, `tight` 1.25, `snug` 1.375, `normal` 1.5, `relaxed` 1.625, `spacious` 1.75, `loose` 2. Moving left decreases leading relative to normal; moving right increases it by the same mirrored amounts. These are positive font-size multipliers, not negative CSS line-height values or the browser's font-dependent `normal` keyword.
- The standard/default text color is `#FFFFFF` with opacity `100`. Omit `color`/`opacity` or use those values unless the prompt or reference explicitly requires a different initial text color.
- The value is one object: `{ fontId, fontWeight, fontSize, letterSpacing, lineHeight, textCase, color, opacity }`. Preview and export renderers must apply all eight parts to the actual product text, not only update runtime state, the select label, or the popup preview.
- The component owns search, category filters, virtualized scrolling, font preview loading, selected-row behavior, the font-weight select, the font-size input, the text-case select, the color/opacity control, and the two footer sliders. Browser acceptance must choose a different font, change weight, change size, change text case, change color/opacity, move Letter spacing, and move Line height.
- `fontPicker` is an atomic typography block. Do not place sibling schema controls for `Case`, `Weight`, `Size`, `Letter spacing`, `Line height`, `Color`, or `Opacity` when they affect the same product text entity. If a typography part is missing from the built-in value model, extend `fontPicker` in the kit instead of composing a neighboring control.
- Do not add `description` to `fontPicker` just to list these owned fields. If the section title and visible field labels already make the text target clear, omit `description`; use it only for non-obvious product scope.

## Vector

One vector control in the controls panel uses the square X/Y pad. Multiple vector controls use compact pads so the sidebar does not become too tall.

Use variants by product meaning:

- default: position, offset, direction, focus, anchor, light direction;
- `whiteBalance`: temperature and tint;
- `colorBalance`: paired color-balance axes;
- `chromaOffset`: RGB or chromatic offset;
- `toneBias`: split-tone, duotone, or color-grading bias.

Use Vector only when the user is meant to manually author a stable two-axis product parameter. Do not expose a pad for current animation state, keyboard movement, pointer movement, physics state, timeline phase, velocity, target pose, current pose, or simulated position/direction just because the internal value has `x` and `y`.

Before adding a Vector control to an animated or interactive product, classify movement ownership:

- `direct-authored`: a stable parameter the user manually edits, such as light direction, focus, anchor, or object offset. This can be Vector.
- `timeline-driven`: movement comes from playback/keyframes. Use timeline, speed, duration, path, step, or amplitude controls instead.
- `keyboard/pointer-driven`: movement comes from user input on the canvas/app. Keep position/direction in interaction state and expose only useful tuning controls.
- `simulation-owned`: movement comes from physics/procedural state. Keep current pose/velocity internal and expose high-level tuning controls.

Default/spatial vector pads use screen-coordinate movement. Dragging left/up lowers canonical `vector.x`/`vector.y`; dragging right/down raises them. The visible product feature must follow the same screen direction. A screen-coordinate renderer consumes those values directly; a Y-up world, UV basis, or inverse texture sampler needs its explicit basis conversion once in the renderer, not a mirrored pad or a mutation of stored values. `texture(uv + offset)` shifts visible texture details opposite to a positive offset; use the inverse sampling transform for the requested visual translation. Use `coordinateMode: "cartesian"` only when the product intentionally exposes mathematical Y-up numbers; it does not waive visual direction correctness. Spatial pads require the protected four-direction pixel proof (including collection fields); read `vector-controls.md` before implementing their mapping or proof. Color-axis variants keep semantic color proof; Width/Height size fields are numeric inputs, not pads.

Vector pad value labels are compact UI labels, not raw state dumps. They show rounded normalized coordinates and must never expose floating-point tails such as `-0.07070312499999998`.

Double-clicking the vector pad resets both axes to the control default through the normal runtime value update, matching the reset button in the section header. If no default is defined, the fallback is `0,0`. Do not add a separate custom reset button for basic pad reset behavior.

Holding Shift while dragging a vector pad locks movement to the dominant axis and must not select text or page content. Use the built-in `vector` control for constrained two-axis direct-authored parameters instead of creating a custom pad.

Do not add custom vector sizing props. Choose the right number, variant, and section grouping, then let runtime sizing handle the pad.

Do not use Vector for camera orbit, object orbit, or a visually flat object that users rotate through 3D space. Use Orientation Gizmo.

## Orientation Gizmo

`orientationGizmo` is runtime-owned canvas chrome for a visible model that users can rotate in three dimensions. It is not a panel pad and it must not be recreated in product code. Runtime also owns the `Lock rotation` Setup switch: it disables manual gizmo/model rotation and dims the complete gizmo to two-thirds opacity without changing its pose or disabling pan/zoom. Product code does not recreate the switch or its lock handling; see [Rotation Lock](core/setup-export.md#rotation-lock).

Declare `appProductReadiness.viewInteraction` first. A visible editable spatial scene defaults to `orbit`; missing rotation requests do not justify fixed framing. `fixed-camera` and `timeline-camera` require positive typed authority: a verbatim user `requestQuote`, or a named `inspected-behavioral-reference` with observed interaction. Static frames prove composition only; these modes are not agent design shortcuts.

Declare one control for the active model mode in its semantic model/view section:

```ts
orientation: {
  defaultValue: { position: [0, 0, 5], up: [0, 1, 0] },
  keyframeable: false,
  label: false,
  target: "view.orbit",
  type: "orientationGizmo",
}
```

Use `useToolcraftModelOrbitInteraction` on the product renderer and provide a hit test against actual visible geometry. A plain primary drag starting on the model rotates the shared pose; a miss without Space does not pan. `CanvasShell` owns Space + primary drag before product hit testing, over or outside the model, when `canvas.draggable` is enabled. Holding Space shows grab, dragging shows grabbing until release, and text editors/keyboard-focused controls retain Space input or activation. Pointer-focused panel controls yield Space when the pointer returns to the canvas. The owner is locked at pointer-down. Preview, raycasting, reset/history, PNG, and video consume the same pose target. Runtime also blocks browser pinch zoom over panels and portaled popups; only gestures over the canvas change canvas zoom, while ordinary panel scrolling remains available. Product code does not recreate these handlers.

Multiple `orientationGizmo` declarations are allowed only for model modes whose combined section/control visibility conditions are statically provable as mutually exclusive. Runtime renders at most one active canvas handle and rejects an ambiguous state instead of selecting the first declaration.

Click a signed axis endpoint to return to that view. Drag anywhere inside the circular gizmo to orbit with Blender-style Turntable behavior: horizontal movement rotates around world up, vertical movement rotates around the screen-horizontal axis, and sensitivity is 0.4 degrees per CSS pixel. Direct model drag uses the same rotation kernel. Axis snaps use angle-scaled Blender Smooth View timing with a 200ms maximum. Gizmo drag, snap, and direct model drag share target-scoped ownership, so a newer gesture, reset, undo/redo, or external target write cancels stale work. A background click is inert; pointer cancel and lost capture end the gesture. The runtime handle is fixed under canvas pan/zoom, uses one history group per completed gesture, and is excluded from export. Product code selects it through schema and must not import or render the visual gizmo directly. When the product also enables the Toolcraft timeline or `canvas.renderScale`, orientation axis-drag proof runs with playback paused and render scale at its declared maximum. The shared pose and visible product pixels must update before pointer release in that state. Cooperative rendering may coalesce work, but it must publish a changed high-quality frame during the gesture; pointer release is not the first allowed visible commit.

Double-click an axis endpoint or inside the circular gizmo to restore the active control's exact schema `defaultValue`, including a custom initial pose. Reset cancels pending snaps, changes only the shared orientation target, and leaves canvas pan/zoom and other controls untouched. The first endpoint snap and its double-click reset form one undoable gesture; Undo restores the pose before that sequence, not an intermediate animation frame.

Shift-drag on the gizmo locks the dominant pointer axis: horizontal yaw or vertical pitch; equal initial deltas choose horizontal. The lock stays fixed until Shift is released. Mid-drag modifier changes constrain movement from the current pose without jumps or replaying discarded motion. Modified direct model presses, including Shift, are unclaimed by model orbit; canvas mouse panning still requires Space. Alt/Ctrl/Meta and non-primary gizmo presses remain unclaimed. Do not recreate these gestures in product code or add a separate reset control.

## Curves

- Use schema `curves` for editable remapping. Use `variant: "single"` for one acceleration, bend, easing, opacity, depth, mask, threshold, tone or other response curve without channel tabs. Do not build a custom control just to remove tabs. Use RGB/R/G/B only for color correction or channel-specific editing.
- Every curve declares `curveIntent: "single-value-map" | "color-channels"`. `single-value-map` requires `variant: "single"`; `color-channels` uses the RGB/R/G/B composition. Labels and target names are explanatory only.
- Single Curves is one labeled control without internal dividers. RGB Curves is compound and follows the compound divider rules when mixed with sibling controls.

Choose interpolation explicitly by product meaning, independently of channel tabs:

- `interpolation: "smooth"` for editor-like tone, Levels, color and RGB curves. Smooth uses neighbor-based cubic tangents with zero endpoint curvature.
- `interpolation: "monotone"` for response, depth, mask, opacity, threshold or data mappings where intermediate values must stay ordered and overshoot is unsafe. Existing explicit monotone settings retain their mapping.
- For compatibility, single curves still default to monotone. Set `smooth` explicitly for standalone creative tone curves instead of relying on that fallback.
- Preview and export use public `createCurveEvaluator(points, interpolation)` from the runtime entry. Compile once per evaluated value change and reuse the returned function for samples. Share the interpolation constant with the schema; never reimplement interpolation or substitute a separate approximate LUT. A worker can import the pure implementation from `@/toolcraft/ui/lib/curve`.
- Both modes extend endpoint values outside the authored input span and clamp output to 0–1. The graph displays that same mapping, including saturation. Runtime normalization clamps coordinates, sorts points and uses the last authored point at coincident X; a curve requires at least two distinct X values.
- `activeChannel` selects the edited channel; it does not replace the product's declared channel composition. Acceptance includes an off-center point near an edge and proves actual product output, not only the curve UI.

## Text And Code

- Use `text` for short single-line strings: button labels, canvas labels, names, small values, compact prompts, titles, captions, badges, and tokens. Every `text` control declares `textValueKind: "single-line"`.
- For `text`, separate content from settings. `commitMode` defaults to `"content"`: content strings such as prompts, names, titles, tokens, and short text update while the user types. Use `commitMode: "setting"` for text inputs that edit settings such as font size, numeric-like style values, dimensions, ids, or configuration fields; setting text commits on blur or Enter. Canvas width and Canvas height are runtime-owned editable-size fields and always commit on blur or Enter.
- Use `code` / `CodeTextarea` as the base multiline content editor for any potentially long value: long prompts, multiline text, instructions, JSON, CSS, shader code, scripts, templates, or other structured text. Every `code` control declares `textValueKind: "multiline" | "structured"`. It applies while typing, is capped at 12 visible lines, and long content scrolls inside the textarea instead of making the controls panel taller. Do not use it for short one-line button/canvas text such as `Glass`, `Submit`, `Title`, or `Badge`; use `text`. A short default does not change the typed intent. Do not name a section `Code` unless the product value is actually code.

## Labels

Use `core/layout.md` for label naming, help tooltip eligibility, switch/checkbox naming, toggle rows, and label parity. Component pages should add `description` only for non-obvious product behavior that the core layout rules allow.

## Layers

Enable `layersModule()` only when the user explicitly requests a workflow with layers: layer selection, ordering, grouping, visibility, or layer-based media management. Multiple uploads or editable objects alone do not authorize enabling it. Lab demonstration fixtures are not generated-product defaults.

Without a user-requested layer workflow, leave Layers absent. Do not use `selectedLayer.*` targets when Layers are disabled.

When Layers are enabled, browser tests must use the real LayersPanel UI: select, visibility, reorder, grouping, and media lifecycle when uploads/deletes create or remove layers.

## Timeline

Use `core/timeline-animation.md` for animation intent, playback/keyframe timeline choice, forward seamless loop rules, duration mapping, keyframe evaluation, viewport interaction performance, and video export timing.

## Panel Actions

Use `core/setup-export.md` for mandatory runtime Setup, background, Image Export, Video Export, sticky product actions, export icons, and async progress. Use `core/control-selection.md` for choosing `actions` versus sticky `panelActions`.

## Canvas Handles

Use product editing handles only when direct manipulation is better than panel-only editing: gradient stops, focus points, light vectors, crop bounds, mask points, transforms, bezier anchors, or perspective corners.

Handles are visual overlays, not app UI. They must be textless, tokenized, bound to runtime state, and excluded from export/copy output.

Three-dimensional view rotation is the built-in Orientation Gizmo case. Use generic product handles only for geometry/value interactions the gizmo does not own.
