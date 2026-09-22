# Custom Control Visuals

Public Toolcraft components are the first choice; product-owned geometry begins only where no public component fits the required semantics and behavior.

> Reading route: start with `workflow.md`. Core generated-app rules live in `core/*`; this guide applies only after the whole control's `builtInFitCheck` rejects the built-in controls documented in `custom-controls.md`.

This guide governs only agent-authored product geometry inside a custom control: matrices, pads, graphs, previews, segments, handles, and similar visualization parts rendered through `controlRenderers`. Existing Toolcraft components are references and owners, never files to edit or surfaces to restyle. Do not edit copied `src/toolcraft` code or alter a public component's Button, input, select, slider, focus, disabled, or other interactive chrome to make product geometry fit.

## Component Ownership Inside A Custom Control

A whole-control custom decision does not make its nested interactions custom. For each inner button, handle, swatch, input, or other interactive element, repeat the public-component fit check:

1. Search the public Toolcraft components for matching semantics and behavior.
2. When one fits, that component owns the complete interactive chrome, keyboard behavior, focus state, and disabled state. Render product-owned geometry as a separate `pointer-events: none` visual child. A public `Button`, for example, remains visually and behaviorally intact around its geometric child.
3. Only when no public component fits may product code implement a local, control-specific hit target. Build it from the Toolcraft visual tokens and shared focus, disabled, and keyboard conventions.

The local fallback stays in that control. Do not create a reusable `PressableSurface`, generic interaction primitive, or parallel component kit.

Public UI owns its chrome by default, including wrappers, loading indicators and other class-name slots. Use the component's supported variants for its appearance; custom classes/styles may extend layout, spacing, sizing and typography. Keep product geometry on a separate local element. For example, a custom matrix backing belongs to a local `div` around an unmodified public `ControlInlineGroup`, with public Buttons inside.

An element supplied through a public component's `render` prop inherits that component's ownership. Its styles obey the same rules, including same-file render functions, local components and element aliases. Opaque/external implementations or replacement roots requiring another file's CSS facts fail source validation; use the public API or a transparent local replacement.

Parent CSS is part of the same ownership boundary. Do not change nested public controls through tag, `data-slot`, role or universal selectors, descendant utilities, inherited color, group opacity, filters, or framework CSS-token definitions. Consume framework tokens without redefining them. Local product variables, actual product colors and opacity/filter effects on independent geometric elements remain available. Use local geometric classes or SVG shape selectors so selectors do not also reach public controls.

## Product Geometry Tokens

Product CSS consumes the global `--toolcraft-custom-viz-*` tokens. Their formulas live in runtime CSS; do not duplicate them in a CSS module, add theme-specific replacements, or rename them behind a local shade ladder.

| Role | Global token | Use |
| --- | --- | --- |
| border | `--toolcraft-custom-viz-border` | Deliberately translucent resting surface boundary |
| border-hover | `--toolcraft-custom-viz-border-hover` | Deliberately translucent hovered surface boundary |
| border-focus | `--toolcraft-custom-viz-border-focus` | Deliberately translucent supplemental boundary while focus is within the surface |
| surface | `--toolcraft-custom-viz-surface` | Opaque visualization backing and separator gaps |
| grid | `--toolcraft-custom-viz-grid` | Quiet grids and helper lines |
| fill-dim | `--toolcraft-custom-viz-fill-dim` | Large fills and inactive cells |
| fill | `--toolcraft-custom-viz-fill` | Alternate neutral fill or hover replacement |
| line | `--toolcraft-custom-viz-line` | Ordinary outlines and strokes |
| line-strong | `--toolcraft-custom-viz-line-strong` | Essential or value-bearing outlines and strokes |
| data | `--toolcraft-custom-viz-data` | Medium data shapes, active cells, and markers |
| ink | `--toolcraft-custom-viz-ink` | Peak emphasis budget: the focus outline, one transient selected or dragged mark, and value text; never a resting or repeated stroke |

Use the tokens directly:

```css
.visualSurface {
  border: 1px solid var(--toolcraft-custom-viz-border);
  border-radius: var(--radius-lg);
  background: var(--toolcraft-custom-viz-surface);
}

.visualSurface:hover {
  border-color: var(--toolcraft-custom-viz-border-hover);
}

.visualSurface:focus-within {
  border-color: var(--toolcraft-custom-viz-border-focus);
}

.visualShape {
  pointer-events: none;
  fill: var(--toolcraft-custom-viz-fill-dim);
}

.visualHitTarget[aria-pressed="true"] > .visualShape {
  fill: var(--toolcraft-custom-viz-data);
}

.localVisualHitTarget:focus-visible {
  outline: 2px solid var(--toolcraft-custom-viz-ink);
  outline-offset: 2px;
}
```

The `surface` token and neutral geometry ladder from `grid` through `ink` resolve to opaque paint. The border, border-hover, and border-focus trio are the sole deliberate single-layer translucent boundary paints. State replaces paint; never nest or stack alpha films for hover, active, selected, or dragged states. Group opacity is allowed only when a whole ghost or preview must fade together, with opaque children inside the group.

## Color And State Semantics

The default is neutral. `--primary` and `--primary-foreground` belong to public primary-action chrome and are never the fill, stroke, border, or background of product geometry. `--accent` is allowed only for a named interaction state such as selection, active edit, or live drag; record that state in the visual map. It is not decoration or a neutral-data shade.

When color is the user's product data, render the actual product value, as with swatches, gradients, palette entries, or color channels. Keep invalid and caution colors in their established semantic roles. Encode direction and topology with geometry—arrowheads, notches, offsets, or connectivity—not hue.

## Area And Part Rules

Visual intensity has an area limit:

- Large region fills use no stronger than `--toolcraft-custom-viz-fill-dim`.
- Medium cells, segments, markers, and filled data shapes use no stronger than `--toolcraft-custom-viz-data`.
- `--toolcraft-custom-viz-ink` is an emphasis budget, not a stroke style. Per control it may own transient focus/drag feedback, value text, and at most one persistent mark. Thickness does not exempt it: repeated thin strokes sum — thirty 1px ink cell borders read as one white surface. Resting structure (cell borders, tick marks, handle rings, static outlines) caps at `line-strong`.

Apply those limits to common parts:

- Binary cells use `fill-dim` for inactive, `fill` for the alternate or hover replacement, and `data` for active.
- Cells and repeated tiles take no painted border: the `surface` showing through the grid gap is the boundary, as in the built-in anchor grid. State lives in the fill (`fill-dim` against `data` passes 3:1 on its own); a hovered active cell may add a transient 1px `ink` inset outline.
- Drag handles rest as a `surface` or `--background` fill with a 2px `line-strong` border and a `data` center dot, matching the built-in curves handles; hover strengthens the border to `ink`; the named drag state switches the fill to `--accent`. A resting handle is never an ink ring with an ink dot.
- Draggable dividers and boundary lines rest at `line-strong`, strengthen to `ink` on hover or focus, and take `--accent` while dragged.
- Outside labels use `--muted-foreground` for names and `--foreground` for values, matching built-in controls; label text never uses a stroke role.
- Polygon and region previews use `fill-dim`. Use `line-strong`, or add a second cue such as a surface gap, marker, or label, when the ordinary `line` boundary does not reach 3:1 against its adjacent color.
- Parallel categorical segments must not use a monotonic lightness ranking. Width encodes magnitude; `fill-dim`/`fill` alternation is only separation. Put a 1px `surface` gap between segments and provide labels. Ordered bands may use monotonic lightness when order is part of the data.
- Text over a fill must have an actual contrast ratio of at least 4.5:1 in both themes. Otherwise put the text outside the fill. Do not guess an on-color.

WCAG 1.4.11 requires 3:1 contrast for an essential non-text boundary or state against the adjacent color. A boundary is essential only when neither the state-carrying fill nor the layout conveys it: repeated cells in an even grid with gaps, and segments separated by `surface` gaps, have no essential boundary — their state is measured on the fill pair. The requirement does not apply to every pair in a neutral ladder or to resting-versus-hover colors. When contrast falls short, escalate the fill pair, widen the gap, or add a marker or label; never brighten a repeated stroke to `ink` to pass. When a low-contrast change is not independently sufficient, add an essential boundary, shape, position, label, or other cue that meets the requirement.

## Geometry, Focus, And Disabled Behavior

Put the radius and `overflow: hidden` on the segment container so its first and last children clip correctly. Keep overlay handles in a separate layer from the clipped geometry, regardless of whether a public component or a local fallback owns the handle. Do not depend on sibling-order selectors that overlays can invalidate.

`--toolcraft-custom-viz-border-focus` is supplemental surface feedback, not the keyboard focus indicator. A fitting public component retains all of its built-in focus, keyboard, and disabled states without restyling. A justified local control-specific fallback must use a focus treatment that is contrast-validated against its actual adjacent colors in both themes. On the canonical custom surface, use a 2px `--toolcraft-custom-viz-ink` focus-visible outline with a 2px offset. If one outline color cannot reach 3:1 against every adjacent color, use a validated two-color treatment. The local fallback also retains the shared disabled opacity and provides an equivalent keyboard action for its pointer action.

## Worklog Visual Map

Before styling, add a visual map to `docs/toolcraft/agent-worklog.md` beside the `builtInFitCheck`. For every visible part, record its owner (public component or local fallback), nearest Toolcraft reference, token role or real product color, area classification, and state meaning. Name the reason for every `--accent` use and identify how direction is encoded without hue.

## Browser Self-Check

Before reporting the custom control complete, verify:

- screenshots in both themes;
- computed styles for every product-geometry token role;
- all four computed corner radii on every intended rounded container;
- visible focus and equivalent keyboard action for every public or local interactive target; for each local fallback, measure the focus indicator against its actual adjacent colors in both themes and require at least 3:1 contrast or a compliant two-color treatment;
- public component chrome and disabled behavior remain intact;
- clipping at segment and rounded-container edges;
- actual 4.5:1 text/fill contrast in both themes where text overlays a fill;
- each `--accent` use has a named interaction state;
- at most one persistent `ink` mark per control, and no repeated part paints `ink` at rest;
- no `--primary` or `--primary-foreground` colors product geometry.
