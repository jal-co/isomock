# Control Selection

Read this module before adding, replacing, grouping, or custom-rendering controls.

## Built-In First

- Choose controls by product value model before UI appearance.
- Use built-in Toolcraft controls before custom controls.
- If multiple built-ins can work, choose the closest one and record the reason.
- If a built-in owner is discovered after a custom workaround, replace the workaround with the built-in.
- Custom controls are allowed only after documenting checked built-ins and why the closest one is insufficient.

## Control Selection Inventory

Before writing schema controls, map every user-visible product setting or action:

```txt
Product need:
Value model:
Candidate built-ins checked:
Best built-in:
Why:
Rejected alternatives:
Target:
Renderer/export mapping:
Acceptance coverage:
```

This inventory can be in implementation notes, `appControlSectionInventory`, or `docs/toolcraft/agent-worklog.md`, but the decision must exist before custom UI is introduced.

## Spatial View Intent Before Controls

Before choosing a gizmo, Vector, camera controls, or renderer interaction, declare
`appProductReadiness.viewInteraction`:

- `non-spatial`: no visible three-dimensional scene/model; include a concrete reason.
- `orbit`: the default for a visible editable spatial scene; list every mutually exclusive `orientationGizmo` target.
- `fixed-camera`: only with positive typed `authority` from either a verbatim user request or an inspected behavioral reference that demonstrates locked framing.
- `timeline-camera`: only with the same positive authority when the request or behavioral reference owns an authored camera path driven by Toolcraft timeline intent.

The absence of an explicit rotation request is not evidence for `fixed-camera`.
Do not first make a 3D scene non-rotatable and then use that implementation
choice to omit Orientation Gizmo. Renderer technology is not the classifier:
WebGL, WebGPU, Canvas2D, and DOM/SVG may each render spatial or non-spatial
output.

Use one of these exact authority branches:

```ts
authority: {
  kind: "explicit-user-request",
  requestQuote: "Keep the camera locked to this framing.",
}

authority: {
  kind: "inspected-behavioral-reference",
  observedBehavior: "Playback follows one authored camera path and exposes no orbit interaction.",
  referenceId: "reference-camera-playback",
}
```

`requestQuote` is verbatim user text. `observedBehavior` describes an observed
interaction from the named reference, not an inference from its appearance. A
still image, screenshot, or desired output frame can establish the default
composition, but it cannot establish locked camera interaction. Without one of
these positive authorities, a visible editable 3D scene uses orbit.

## Interaction Surface Ownership

Before implementing controls or canvas editing, declare
`appProductReadiness.interactionOwnership` for every operation that could
plausibly live on either surface. Each entry records the runtime target,
operation capability, selected `canvas` or `panel` surface, evidence, the
selection reason, and why the other surface does not own the same operation.

Choose from evidence in this order:

- an explicit user request owns the location when it states one;
- an inspected reference is direct evidence for the interaction it demonstrates;
- otherwise compare spatial correspondence, feedback, precision, discoverability,
  output clutter, accessibility, off-screen use, and collection/configuration needs.

One user operation has one primary surface. Do not recreate a canvas drag,
selection, spatial map, property edit, collection edit, or command in the panel
with different chrome, and do not recreate a panel operation as canvas UI.

Related state may expose genuinely different operations on both surfaces. A
canvas can select or directly manipulate an entity while the panel edits any
useful properties, modes, constraints, colors, collections, commands, or exact
values. These are complementary only when their typed capabilities differ; a
renamed copy of the same capability is still duplication.

## Exact Owners

- Use `gradient` for adjustable gradients, color transitions, gradient fills, stops, type, and angle. Do not replace it with two `color` controls.
- Use `fontPicker` for typography that includes font family, weight, size, text case, text color/opacity, letter spacing, or line height.
- Use `colorOpacity` when one product entity owns both color and opacity.
- Use `rangeSlider` or `rangeInput` for lower/upper bounds or from/to ranges.
- Use `curves` for editable tone, response, easing, remapping, opacity, depth, mask, or channel curves.
- Use `vector` only for stable manually-authored two-axis product parameters such as position, offset, direction, focus, anchor, light direction, white balance, color balance, chroma offset, or tone bias.
- Use `orientationGizmo` whenever users can rotate a visible canvas model through 3D space, including a visually flat object presented with 3D rotation.
- Use `fileDrop` for source material uploads.
- Use `imagePicker` for choosing one visual option from a set.
- Use `palette` only for constrained design-token color choices with both family and shade.
- Use `tabs` for finite choices that replace the content or workflow view below the control; the runtime changes overflowing tabs to Select without changing the value.
- Use `segmented` for compact finite mode settings that leave the surrounding view unchanged.
- Use `actions` for local section commands that affect only the nearby entity.
- Use `sourceCollection` when source analysis or another runtime workflow owns the array length and users edit only existing built-in item values.
- Use `collectionActions` for repeatable product entities whose actual item list can grow or shrink.
- Use `panelActions` for sticky final product actions such as export, copy, generate, apply, or download.

## Compound Controls Are Atomic

- `fontPicker` owns font family, weight, size, text case, text color/opacity, letter spacing, and line height.
- `gradient` owns gradient type, angle, draggable stop track, and Stops list.
- RGB `curves`, `channelMixer`, `palette`, `sourceCollection`, and `collectionActions` are also compound controls.
- Do not split owned fields into neighboring schema controls.
- If a needed owned field is missing from a built-in, extend the kit instead of composing a parallel control.

## Collection Cardinality

- Use `sourceCollection` when a loaded, derived, detected, or otherwise external source owns the exact array length. It renders the declared built-in `itemControl` for every current item and never exposes add/remove commands.
- Use `collectionActions` when users edit the actual growable/shrinkable set: colors, glyphs, symbols, points, rules, variants, objects, style entries, or similar repeatable entities.
- Both controls use the same runtime-owned built-in item renderer. Product code must not copy a child control implementation to support a dynamic list.
- Source workflows replace the complete `sourceCollection` target array; panel edits change item values only.

- Adding/removing items must update runtime state and product preview/export.
- Do not use a count slider plus hidden fixed item controls when the user needs to add or remove actual entities.
- The collection control shows the collection label on the left and remove/add icon buttons on the right.
- Homogeneous repeated items do not show visible per-item labels when the collection label already names the group.
- Plain color items may use equal 50% columns; color+opacity items stay stacked. Use `itemControl` for one homogeneous value. Use `itemControls` only when two or more built-in fields form one logical target-array record and affect that entity's outcome: `+` appends all field defaults, `−` removes the final record, and runtime places a content-width line only between records without `Item N` headings. Standalone color `itemControl` stays a divider-free two-column grid; color may still be a legitimate compound field.
- Compound collection fields opt into nested keyframes individually with `keyframeable: true`; omitted/false capable fields remain ordinary live values.
- Declare one `selectionTarget` when the panel or canvas edits a selected record. It is a runtime-owned nullable safe index, not a per-item boolean. Dispatch only the four structured collection commands; product code never constructs the reserved nested address or mutates the parent array directly.

## Actions

- Use schema `actions` for local section commands such as randomize palette, normalize weights, sort glyphs, clear selection, duplicate item, or reset current stop.
- If there is one `actions` button, the control label and button label must not be identical. Keep the button as the command verb and make the label a concise context.
- If an `actions` control has a visible label, the label is above the buttons.
- Actions use two columns by default: one button uses the left half and groups of up to four rows retain the grid. Above four rows, the shared control renders one previous button, a dropdown and one next button. The threshold uses the resolved column count, including explicit built-in layouts.
- In grid mode, do not stretch an odd trailing action full-width or center it.
- In compact mode, dropdown and arrow buttons share the default 28px height. Selecting any menu item (including the last invoked command) or stepping invokes the original action once. No action runs on mount; the dropdown initially says Choose action. Navigation skips disabled/loading items and stops at the ends. Its last-invoked label is local UI state, not a persisted product selection.
- Keep final product actions in `panelActions`, keep timeline transport in the top timeline, and keep global reset in the controls panel header.

## Vector Ownership

Use Vector only when the user is meant to manually author a stable two-axis product parameter.

Before adding Vector to an animated or interactive product, classify movement ownership:

- `direct-authored`: stable user-authored parameter such as light direction, focus, anchor, or object offset. This can be Vector.
- `timeline-driven`: movement comes from playback/keyframes. Use timeline, speed, duration, path, step, or amplitude controls instead.
- `keyboard/pointer-driven`: movement comes from user input on the canvas/app. Keep current position/direction in interaction state and expose only useful tuning controls.
- `simulation-owned`: movement comes from physics/procedural state. Keep current pose/velocity internal and expose high-level tuning controls.

Do not expose a pad for current animation state, keyboard movement, pointer movement, physics state, timeline phase, velocity, target pose, current pose, or simulated position/direction just because the internal value has `x` and `y`.

Do not use Vector for camera orbit, object orbit, or a three-dimensional view orientation. Those interactions belong to Orientation Gizmo.

For a spatial Vector, define the screen-to-product mapping before renderer code:
right gesture → visible feature right; left → left; up → up; down → down.
Record which feature is moved (object, focus, light feature, texture detail, or
chromatic channel), its coordinate basis, and the renderer/export conversion.
Runtime values are canonical; do not mirror the pad or negate stored values to
compensate for renderer sampling. Sampling a texture at `uv + offset` moves its
visible features opposite to the offset; implement the inverse sampling transform
for the intended visual translation. Apply UV/world/camera basis conversion once.

The default and `chromaOffset` pads require schema-derived `vector-screen-motion`
browser evidence, including inside `itemControl`/`itemControls`. Mathematical
`coordinateMode: "cartesian"` does not authorize mirrored screen movement.
`whiteBalance`, `colorBalance`, and `toneBias` are semantic color axes, not position
controls; prove their color outcomes instead. Do not select a color variant or
Width/Height size fields to evade spatial direction proof. See
`../vector-controls.md` before implementing the mapping or bounded proof recipe.

## Orientation Gizmo Ownership

Use schema `orientationGizmo` whenever a visible model can be rotated through three-dimensional space. This is the exact owner for both volumetric 3D models and visually flat planes/cards that expose a 3D orbit.

For a visible editable spatial scene, `viewInteraction.mode: "orbit"` is the
default and every `orientationTargets` entry must match a schema gizmo target.
Fixed framing is not a default alternative; it is accepted only through the
positive typed-authority `fixed-camera` escape hatch above.

- Declare one shared pose target for the active model mode with `{ position: [x, y, z], up: [x, y, z] }`, `label: false`, and `keyframeable: false`.
- At most one orientation gizmo may be visible at a time. Multiple declarations are valid only when their combined section/control visibility conditions are statically provable as mutually exclusive; runtime rejects ambiguous active states.
- Keep the hidden control in the semantic section that owns the model or view so section/global reset owns its target; do not create an empty panel section only for the gizmo.
- Product preview, geometry hit testing, gizmo drag, direct model drag, history/reset, image export, and video export all consume that same target.
- Bind the rendered model with `useToolcraftModelOrbitInteraction` and supply a product-owned `hitTest` based on actual visible geometry.
- Pointer ownership is decided on pointer-down: higher-priority product editing may claim first; a plain primary hit on the visible model rotates it; a miss remains untouched so `CanvasShell` pans. Modified primary and non-primary presses are not claimed by model orbit.
- Gizmo drag, snap, and direct model orbit share target-scoped ownership. Starting newer work or writing reset/undo/redo to the target cancels stale in-flight interaction before it can overwrite current state.
- The runtime gizmo stays fixed 16px from the canvas viewport's left and bottom edges, does not scale or move with canvas pan/zoom, and never appears in export.
- Do not use Vector, paired angle sliders, segmented axis buttons, or custom canvas chrome as a substitute.

## Custom Control Gate

- Custom controls are for product interactions that built-ins cannot represent.
- Custom controls must use Toolcraft primitives, tokens, spacing, typography, and action affordances.
- Custom controls must expose the minimum UI needed to understand and operate the product value.
- Every visible custom-control element must have a job: choose, order, preview, delete, upload, edit, or show useful status.
- Remove file names, helper text, and captions that do not help distinguish items or explain state.
- Do not make tiny item-level action buttons below kit comfort sizes.
- Do not recreate built-in controls, panels, toolbar, timeline, layers, canvas shell, or runtime surfaces.
- Do not import deep Toolcraft control implementation modules or substitute native form controls for a schema-owned value model.
- A custom control with `custom-interaction` must reference its typed interaction owner. Its built-in fit check does not justify panel UI when the same operation is already owned by a canvas interaction.
