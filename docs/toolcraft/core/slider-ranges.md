# Editable Slider Ranges

Top-level product `slider` and two-handle `rangeSlider` controls may opt into
`editableRange: { hardMin?, hardMax? }`. Without this field, existing min/max
validation and editing behavior remain fixed. With it, `min`/`max` define the
initial visible scale; optional finite hard limits define the semantic domain.
For example, a radius may declare `min: 0, max: 20, defaultValue: 20,
editableRange: { hardMin: 0 }`: entering `1000` is valid, entering `-10` is not.
Choose hard limits from product meaning or supported algorithm capacity and
record the reason in the worklog. Do not turn an arbitrary initial scale into
a hard limit. Opacity and other inherently bounded quantities normally stay fixed.

Numeric label edits commit on blur or Enter, never while typing. For a double
slider, the ordered pair defines both selected values and the new scale. A
single slider expands to include an out-of-scale edit; editing an occupied
endpoint inward moves that endpoint, while interior edits only change value.
An edit onto or beyond the opposite endpoint preserves a nonempty scale.
Dragging and ordinary value commands preserve the stored scale. Values supplied
by playback or restoration remain hard-domain validated; the displayed scale
includes evaluated values without clamping product output.

Runtime commits value, scale and an active keyframe atomically, including Undo/Redo.
Double-clicking a thumb restores its default and expands the scale when necessary;
the other thumb and its scale boundary are preserved. Escape cancels.
Malformed text, non-finite numbers, reversed/equal scale boundaries, hard-limit
violations and unsupported numerical precision retain the last valid state and
show a field error. Inward edits cannot exclude existing keyframe values. Visual
discrete markers switch to the existing continuous presentation if the expanded
scale exceeds the marker budget; the numeric step does not change. No loading
state or disabled interval is needed for these synchronous edits.

`state.controlRanges` stores scale overrides by target. Local persistence includes
them with the `values` slice, and Save State as Default includes them in the source JSON.
Header/section Reset restores the saved or initial ranges along with values.
Legacy workspaces without overrides keep initial ranges; invalid local overrides
are discarded individually, while invalid source defaults fail validation.
Runtime-owned targets and nested collection fields reject this opt-in: their
per-entity range ownership is not currently supported.

Workload-bearing editable sliders must declare finite hard bounds and prove those
bounds in their workload envelope. Changing the visible scale never extends
performance authority; see [Performance](../performance.md).
