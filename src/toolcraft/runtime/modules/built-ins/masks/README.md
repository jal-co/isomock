# Soft ellipse masks

`masksModule({ spatialFields: "read-only" })` opts a product into the trusted
`foreground.soft-ellipses` capability. It contributes one `product-settings`
section before artifact settings. It does not register a renderer, enable
Layers, or affect products that omit the module.

The common collection owns `masks.items` with `identityField: "id"`, up to 16
items. Add creates identity in the command facade before reduction. Select,
field edits and remove use `itemId`; missing identities and stale IDs fail
closed. Keyframe addresses retain identity through parent replacement/reorder
and prune removed IDs. Unkeyed collections retain index commands and timeline
addresses. Unknown item metadata stays intact; duplicates, missing IDs and
keyed overflow reject normalization/import. Settings parsing and batch commands
reject the whole candidate before applying sibling values, canvas, media or history;
unkeyed fallback behavior is unchanged.

Authored position is the standard Vector representation: X right, Y up, signed
normalized against the stable reference frame. Radius is a percentage of its
height; Stretch multiplies that radius for Y. Rotation is clockwise in local
CSS coordinates. Feather and Opacity are percentages. `edgeMetric` preserves
imported `ellipse-distance` or `normalized-radius` semantics and is read-only.
New items use distance falloff. Spatial read-only mode uses disabled canonical
controls, including a numeric Vector display without a second editing pad.

`getToolcraftEvaluatedMasks(state, referenceFrame, timeSeconds?)` consumes
runtime evaluated values and derives the local CSS ellipses used by output and
handles. `evaluateToolcraftMasks(values, referenceFrame)` accepts already
evaluated values. No view, finite clip, iframe dimensions or backing density
participates in this conversion. Distance feather is radius × Feather / 100
with the inspected 0.75 CSS pixel minimum; normalized feather is Feather / 100.
Distance evaluation normalizes the gradient by the major radius; its denominator
is dimensionless and never uses an absolute CSS-unit epsilon.
The shared numerical contract rejects non-representable Float32 geometry and
ill-conditioned ellipse/feather combinations. Both CPU and GPU cull outside a
conservative support derived from the ellipse before division; supported
intermediate bounds keep rotation, lengths and distance arithmetic finite. This
is a numerical admission rule, not a page-height or canvas-size clamp.
Enabled items reveal foreground with `1 - product(1 - coverage)`; Apply off,
empty and all-inactive collections are identity coverage.

`TOOLCRAFT_WEBGL_MASK_GLSL` and `bindToolcraftWebGLMaskUniforms` bind either WebGL
pipeline without Three.js. Custom shader adapters may use
`createToolcraftWebGLMaskUniforms`; vectors are flattened typed arrays. Feed
`toolcraftMaskCoverage` top-left local CSS coordinates, including render-window
origin. Multiply foreground coverage before adding the app background and
finite clip. Straight-alpha output multiplies alpha; premultiplied output
multiplies RGBA. A shader export alone does not establish renderer admission:
its caller must prove real output integration.

`TOOLCRAFT_MASK_TRANSIENT_TARGETS` lists selection and Show guides so authored
capture and source defaults can exclude transient editor state. Show guides never
changes coverage; this module has no second authoring document.

The Lab control fixture is `/lab?case=masks`; its canvas stays empty. Focused
coverage lives in `masks-module.test.ts`, `state/keyed-collection.test.ts`,
`controls-panel.keyed-collections.test.tsx`, `state/keyed-collection-import.test.ts`,
and `e2e/lab-masks.spec.ts`. `e2e/runtime-mask-kernel.spec.ts` compiles the real
shared GLSL and compares readback pixels with CPU coverage across coordinate
scales and both edge metrics.
