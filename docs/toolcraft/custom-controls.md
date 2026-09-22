# Custom Controls

> Reading route: start with `workflow.md`. Core generated-app rules live in `core/*`; this file is a focused custom-control reference for the topic below.

Use a custom control only when no built-in Toolcraft control represents the product interaction.

Built-ins come first: `slider`, `rangeSlider`, `select`, `segmented`, `switch`, `checkbox`, `color`, `colorOpacity`, `vector`, `gradient`, `curves`, `fontPicker`, `imagePicker`, `fileDrop`, `text`, `code`, `rangeInput`, `palette`, `actions`, `sourceCollection`, `collectionActions`, and `panelActions`.

Register custom renderers through the `controls.renderers` named port passed to `composeToolcraftApp`.

Do not use `controls.renderers` to recreate a built-in control. If the product needs a slider, select, segmented mode picker, color input, gradient editor, font picker, image upload, arbitrary file upload, textarea, local action group, source-sized repeated item editor, repeatable item add/remove, or footer action, declare the matching schema control instead of rendering the component manually.

Product modules never import deep paths below `src/toolcraft/ui/components/controls/**` and never replace schema value models with native `color`, `range`, `file`, `checkbox`, `radio`, `select`, or `textarea` controls. If a built-in lacks a required variant, improve the shared runtime instead of copying its private popover, parser, history, or state mechanics.

Do not edit `ControlsPanel`, copied `src/toolcraft`, or Toolcraft internals inside a generated app.

Import custom renderer types from `@/toolcraft/runtime/react`.


## Custom Type Registration

Register a literal name before using it in a schema:

```ts
import {
  defineToolcraftCustomControlType,
  type ToolcraftControlSchema,
} from "@/toolcraft/runtime";

export const glyphDensity = defineToolcraftCustomControlType("glyphDensityEditor");
export const densityControl = {
  type: glyphDensity,
  target: "glyph.density",
  defaultValue: { items: [] },
  label: "Density",
  orderRole: "primary",
  applicability: { mode: "always" },
} satisfies ToolcraftControlSchema;
```

Use the exact registered key in the composition:
`controls: { renderers: { [glyphDensity]: GlyphDensityEditor } }`. The renderer still
uses the shared `setValue` callback and existing runtime commands. A missing
renderer renders no custom UI; it is not a substitute for the required acceptance
and browser coverage. Built-in renderer keys cannot be overridden.

The helper rejects built-in names, empty names, surrounding whitespace, and
non-string JavaScript input. Broad `string` variables are rejected by the type
contract; dynamic external input needs an actual validated parsing boundary, not
an `as` cast in product code. Registration returns the exact original string,
with no prefix or target rewriting.

This is a source-only custom-name/type migration: replace the old raw custom
`type` literal with the helper result. Renderer-map keys, targets, persisted
values, and keyframe formats remain unchanged. Custom committed values still
satisfy the JSON runtime contract. Registration does not waive `builtInFitCheck`,
`customControlCoverage`, the product AST boundary, or output acceptance.

## Required Schema

Custom control schemas still need:

- `type`;
- `target`;
- `defaultValue`;
- `label`;
- `orderRole`;
- acceptance coverage;
- `customControlCoverage`;
- `builtInFitCheck`;
- browser coverage;
- performance coverage when they can trigger product work.

`builtInFitCheck` is required for every custom control acceptance row:

```ts
builtInFitCheck: {
  capabilities: [
    "collection",
    "reorder",
    "selection",
    "commands",
    "custom-value-model",
  ],
  checkedBuiltIns: ["fileDrop", "sourceCollection", "collectionActions", "imagePicker"],
  closestBuiltIn: "fileDrop",
  whyInsufficient:
    "FileDrop imports, previews, orders, and removes source files, but this product also needs per-glyph density thresholds stored with each item.",
  productObservable:
    "Changing a glyph density threshold changes which uploaded glyph renders for the same depth-map tone.",
}
```

`capabilities` is required and uses broad behavior facts: `collection`, `reorder`, `selection`, `commands`, `custom-interaction`, `custom-value-model`, or `custom-visualization`. At least one of the three `custom-*` capabilities must explain why built-ins cannot own the interaction. `checkedBuiltIns` must name real Toolcraft built-in controls. `closestBuiltIn` must be one of those checked controls or `"none"` when no built-in is meaningfully close. `whyInsufficient` explains the missing interaction. `productObservable` names the output or side effect that proves the custom control is necessary.

If the custom control owns a repeated runtime item set, `checkedBuiltIns` must include `sourceCollection` and `collectionActions` so the fit check distinguishes source-owned from user-owned cardinality. Include `actions` when the custom interaction also exposes commands. Decide this from the value model and workflow, such as arrays, `{ items: [...] }` objects, selected-item state, or add/remove/reorder behavior, not from entity names like masks or glyphs. This applies even when the empty state visually looks like a few icon buttons: the fit check must prove why neither built-in collection owner can represent the state and why command UI is necessary when commands exist.

Do not justify a custom control with icons, layout, styling, compactness, or custom buttons alone. If the built-in control has the right value model and mechanics, use it or improve that built-in instead.

The fit-check fields are declarations, not independent proof that custom UI is necessary. Review the actual value model and interaction against the closest built-in, then verify the declared output through the acceptance row's browser scenario. Passing metadata validation never grants permission to restyle a public component or substitute a native value control. Record which inner interactions use public primitives and which specific behavior needs product geometry; a different frame, spacing or color palette is not a behavioral gap.

The product source boundary protects every component rendered from the public UI root, including composite wrappers and secondary class props such as `containerClassName`. `Input`, `InputGroupInput`, `ComboboxInput` and `CommandInput` cannot forward native color/range/file/checkbox/radio models into product controls. Keep standard value models in schema controls. The same boundary runs before product source loading in `test:feature`, including later edits.

## State Rules

Custom renderers must write through the provided `setValue(nextValue, meta)` callback or existing runtime commands.

Local-only custom control state is invalid unless it is transient draft, hover, focus, or drag state. Final product state belongs to the Toolcraft runtime.

## Keyframes

If a custom value is keyframe-capable, the renderer must work with runtime keyframes instead of local animation state. Store typed values in keyframes through runtime commands and consume `useToolcraftEvaluatedValues`, `useToolcraftEvaluatedValue`, `evaluateToolcraftTimelineValues`, or `evaluateToolcraftTimelineValue`.

## Design System Fit

Before implementation, record:

- user-visible need;
- public candidates inspected;
- selected/closest component;
- exact missing capability;
- outcome (`reuse`, `canonical-extension`, or `product-composition`);
- focused verification.

Inspect built-in schema controls and the public `@/toolcraft/ui` barrel first. Check complete public controls and composites before public primitives. Generated apps never inspect or import deep `src/toolcraft/ui/components/**` implementation paths.

Use the order reuse → extend → compose. Reuse a public control or composite when its semantics fit. When a generally reusable capability is missing, extend the canonical public owner in the monorepo and regenerate the app. Compose product-specific UI from public primitives, tokens, sizes, states, and patterns only when the need is not generally reusable.

A local visual preference is insufficient reason to bypass or duplicate a public owner. Do not hand-style standard buttons, inputs, selects, textareas, focus states, disabled states, loading states, borders, radii, or spacing.

### Primitive Composition Example

This fragment shows two local draft actions inside an already-justified custom editor. It is not a custom-control registration and does not justify creating one. Use schema `actions` for standalone product commands; a standalone numeric stepper belongs to a built-in control. Apply commits the editor's draft through its provided `setValue` callback, while Cancel discards only transient local draft state.

```tsx
import { Button } from '@/toolcraft/ui';

function CustomEditorDraftActions({
  onApply,
  onCancel,
}: {
  onApply: () => void;
  onCancel: () => void;
}) {
  return (
    <div role="group" aria-label="Draft actions">
      <Button onClick={onApply} size="sm" type="button">
        Apply draft
      </Button>
      <Button onClick={onCancel} size="sm" type="button" variant="outline">
        Cancel draft
      </Button>
    </div>
  );
}
```

## Visual Rules

Use `custom-control-visuals.md` for the product-geometry token vocabulary, area limits, state semantics, geometry composition, and browser self-check before styling a custom control.

Custom controls should use Toolcraft tokens, spacing, focus states, disabled opacity, and interaction patterns. A custom control should look like it belongs in the controls panel.

Custom controls must render the minimum UI needed to understand the value, context, and available actions. Do not add decorative metadata or text that repeats the section title, control label, or obvious item state.

Every visible custom-control element must justify its space by enabling selection, ordering, preview, removal, upload, editing, or a product-affecting status. If text is only nice-to-have, remove it.

Use Toolcraft primitives for all custom-control chrome. Do not hand-style basic buttons, inputs, selects, sliders, scroll areas, or focus states.

Custom controls may use primitives for app-specific chrome, but they must not duplicate toolbar, timeline, layers, canvas, panel, or built-in control mechanics.

Choose element sizes from interaction need, not from how much content you want to fit. Glyphs, swatches, chips, and thumbnails can be compact, but destructive, reorder, upload, and primary actions must keep comfortable kit button or icon-button sizes.

When a custom list item needs context, prefer concise semantic labels such as `Darkest`, `Mid tone`, or `Lightest`. Omit file names, long captions, and duplicate helper text unless they are required to distinguish items.

### Bounded Image And Thumbnail Lists

When an image or thumbnail grid has its own bounded scroll viewport inside the controls panel, render that viewport through `ScrollFade` with `scrollBoundaryBehavior="chain"`. The grid scrolls internally first; at its top or bottom boundary, native wheel and trackpad momentum continues through the owning controls panel.

This rule is independent of thumbnail dimensions, source-image aspect ratio, column count, fade preset, and viewport height. Keep the default contained behavior for independent selects, font lists, popovers, timeline lists, and other scroll surfaces that must not move the parent panel. Do not inspect descendants for `<img>` elements and do not forward wheel events manually.

Before choosing a custom interaction, declare its typed `interactionOwnership` and compare both surfaces. User request, inspected reference, or product usability selects one primary owner. A custom panel control must not mirror a canvas operation, and a canvas handle must not mirror a panel operation. Different operations may remain complementary: direct manipulation or selection on canvas can coexist with any useful property, mode, constraint, collection, command, or exact-value editing in the panel.
