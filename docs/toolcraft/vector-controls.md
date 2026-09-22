# Spatial Vector Direction

Read this focused contract before implementing spatial Vector mapping or its browser proof. General ownership rules remain in `core/control-selection.md` and `component-rules.md`.

## Screen meaning and coordinate conversion

Right gesture → visible product feature right; left → left; up → up; down → down.
For the default screen-coordinate pad, positive X means right and positive Y means
down. Preserve canonical runtime values. Convert world, camera, or UV coordinates
once in the renderer, using the same mapping for live output and export.

A texture sampler is inverse mapping: evaluating `texture(uv + offset)` makes a
recognizable texture feature move opposite to positive `offset`. For visible
translation, use the inverse sampling transform, including any scale, rotation,
and Y-up/Y-down basis conversion. Do not fix sampling signs by mirroring the pad
or negating stored/persisted values globally. Mathematical
`coordinateMode: "cartesian"` changes numeric Y convention, not the required
screen gesture direction.

## Axis locks

Each XY pad shows an independent open lock before each coordinate. Closing X
preserves its exact value while Y changes; closing Y does the reverse. Both locks
may close, disabling pad and numeric editing while keeping unlock buttons usable.
Locking X hides the horizontal axis line; locking Y hides the vertical axis line.
Unlocking restores that line. The position handle remains visible with both locked.
Explicit locks take priority over Shift's temporary dominant-axis constraint.
Double-click resets only unlocked coordinates; header Reset, Undo and playback
remain runtime-owned operations and may replace values independently of locks.

Coordinate labels edit separately on blur/Enter; Escape cancels, malformed or
nonfinite input retains the current value, and valid input uses the existing
normalized -1..1 domain. Display rounding must not reduce a locked coordinate's
stored precision. Lock toggles and blocked movement create no value commands.

Locks belong to the mounted control's editing state. They start open when the
control mounts and are not keyframes, product parameters or source defaults.
The canonical runtime value remains `{ x, y }`. This behavior applies to all XY
pad variants, including color pads and repeated collection controls; Width/Height
size inputs are a different control presentation.

## Required proof

The schema automatically adds `vector-screen-motion` for default/omitted Vector
variants and `chromaOffset`, including `itemControl` and `itemControls`. Omitting
`controlPartCoverage` or providing generic `vector.x`/`vector.y` evidence cannot
remove it. Named color-axis variants (`whiteBalance`, `colorBalance`, `toneBias`)
still prove both semantic color outcomes. Built-in Width/Height size fields remain
numeric size controls. Never change variants or labels to bypass spatial proof.

```ts
import { createToolcraftBrowserProofSession } from "./browser-proof-session";
import { expectToolcraftVectorScreenMotion } from "./browser-vector-screen-motion";

const proofSession = await createToolcraftBrowserProofSession(page);
// Prepare real source/scene via UI after session creation: pause animation,
// fix the view, and expose the relevant branch and collection items.
await expectToolcraftVectorScreenMotion({
  proofSession,
  requirementId: "shape.offset",
  target: "shape.offset",
  markers: [{ selector: '[data-toolcraft-product-output="shape"]', rgb: [255, 0, 128] }],
});
```

The protected helper owns four real drags: right, left, down, up. It decodes
screenshots of a fixed product surface and tracks an isolated compact feature by
color. DOM, SVG, canvas and GPU output use the same pixel path. Use a genuine
source/product feature, not test-only production artwork or a fake DOM proxy.
For textures, load a deterministic source with one distinguishable feature. For
light/focus controls, identify the corresponding visible feature in a stable
representative view. Record that choice and mapping in the worklog.

The marker must remain unclipped inside the fully visible surface, retain its
area, and move at least two CSS pixels with bounded perpendicular drift. Camera,
viewport, and surface bounds stay fixed. Stop unrelated animation through the
real UI. Do not lower render quality or substitute a separate test renderer.

Supply one marker per visible spatial pad under the exact target, in DOM order.
Collection fixtures contain actual items and expose every distinct spatial field;
empty/collapsed fixtures do not establish their behavior. All included pads pass
before any evidence is attached. The recipe emits direction, generic product
change, and both vector-part records after successful live and released-output
assertions. Other compound collection operations retain their own coverage.

Pointer-held movement and post-release persistence are mandatory. Text input,
runtime values, `data-*` attributes, arbitrary point readers, generic image hashes,
and movement in the opposite direction are not proof. Normal export coverage
remains separate. This is a bounded directional regression guard; it does not
replace product-specific assertions for the meaning of light, focus, or color.
