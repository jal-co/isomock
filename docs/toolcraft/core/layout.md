# Controls Layout

Read this module before changing sections, labels, helper icons, inline rows, dividers, action layouts, or panel density.

## Sections

- Build controls-panel sections from logical product entities, not component types, visual control size, or target namespaces. Before writing controls, export `appControlSectionInventory`; every section declares stable `entityId`, human-readable `entity`, exact targets, and `groupingReason`.
- Section boundaries follow user tasks, dependency cohesion, and a meaningful reset scope. Keep a coherent workflow together even above ten controls; smaller entities may have multiple justified workflow stages. Never split or merge solely to satisfy a count, and do not move a setting away from its owner merely because an eleventh control was added.
- Ten declared controls is a non-blocking density-review threshold, not a section limit. The static warning counts declarations, not simultaneously visible controls. In the feature's ordinary browser inspection, review the busiest reachable modes, actual panel height, compound-editor complexity, navigation, and reset scope. Mutually exclusive controls are not added together as visible workload. A short list of large compound editors may also need review; no automatic weighted score or declaration count proves usability.
- Use `semanticGroup` where it clarifies product subgroups; there is no count-based requirement to annotate every control. Mixed plain-color rows retain their mandatory grouping contract below. Do not split atomic built-ins or replace them with custom controls to reduce the count.
- Every workflow split, regardless of size, keeps the same `entityId` and `entity` and declares a unique `workflowStage` plus concrete `splitReason` describing the user task and reset boundary. A one-control stage is valid for a complete task, including an atomic compound editor, not as a numeric remainder. Record a density decision in the existing `groupingReason` or worklog; no extra plan, approval, waiver flag, or inventory field is required.
- Do not reuse the same section title for multiple sections.
- Bad titles: `Controls`, `Settings`, `Options`, `Sliders`, `Inputs`, `Buttons`, `Color`, `Colors`.
- Good titles name the edited thing: `Background`, `Object`, `Token Pattern`, `Motion`, `Tone Mapping`, `Export`.
- Every app-authored controls-panel body section has a short meaningful visible title.
- A section title normally uses one to three words and names only the edited product entity or workflow stage. Four words is the exceptional maximum. Starter acceptance rejects titles with more than four semantic words or more than 32 Unicode code points.
- Remove indices, modes, explanations, and secondary context from section titles. Put necessary non-obvious scope or output relationships in `description`, not in the title.
- Runtime `Settings` is a mandatory section with the standard title, Reset and collapse header. Local Save State as Default occupies a separate headerless block above it; without host authoring capability that block is absent. Sticky footer export actions render without a visible heading.

## Dependency Cohesion

- Typed `entityId` is the primary authority for section cohesion. Target-prefix checks are secondary diagnostics and never redefine an inventory entity.
- A selector that controls mode, type, source, variant, or include state stays with its dependent controls by default. A justified workflow split may cross sections with the same inventory entity; the split metadata and exact target ownership remain mandatory.
- Declare conditional control applicability for inactive product branches so the panel shows only usable controls while preserving hidden values.
- A selector option alone does not justify a separate section. Use conditional controls within the owning workflow, or document a distinct user task with its own workflow evidence; do not invent another entity to bypass grouping checks.
- A section with no visible controls is hidden automatically.
- Do not use `disabled: true` or `disabledWhen` for generated product controls.

## Explicit Product Modes

When the user explicitly requests distinct application modes, put their one canonical selector in the **first product section immediately after runtime Setup** (the Settings block). Keep it available in every mode. Do not infer application modes from a reference image, a selector label, or an ordinary local parameter. Entity choices such as font weight or an object's line style remain in their semantic sections.

Mark that selector as a `branch` in `appControlSectionInventory.finiteSelectors` and add `productMode`. Inspect the original user message and retain its exact request evidence. A plan or worklog does not supply primary permission. Local validation checks the supplied quote and structure; it cannot authenticate chat authorship or decide whether the quote actually requests modes.

```ts
{
  target: "scene.mode", role: "branch",
  reason: "Choose the requested Diagram or Map scene and its editable controls.",
  affectedTargets: [],
  productMode: {
    request: {
      source: "user-message", messageRef: "<actual user message reference>",
      messageText: "Add Diagram and Map modes.", quote: "Diagram and Map modes",
    },
    sharedTargets: ["scene.scale"],
  },
}
```

Use a built-in `select`, `segmented`, or `tabs` with at least two distinct options, a valid default, `applicability: { mode: "always" }`, and `keyframeable: false`. The selector's section is unconditional. Author it after the Background source section if present: runtime relocates Background into Setup before checking the resulting order. Do not bury Mode inside a late effect section or move it into runtime Setup.

Every other product control outside runtime Setup and action-only controls must either directly reference this selector in its conditional `applicability` or appear exactly once in `sharedTargets`. A mode predicate selects a non-empty proper subset of mode values, for example `{ mode: "conditional", all: [{ target: "scene.mode", oneOf: ["diagram"] }] }`. Shared means availability independent of the application mode; local predicates may still apply. A local selector must be available in every mode of its dependent. Keep shared declarations deliberate and trace actual output consumers; an unrelated mode's controls must not be marked shared simply to pass validation.

Inactive controls and sections with no applicable controls are absent; do not gray them out or hide them with CSS or a separate section-only predicate. Preserve their values, defaults, history and persistence. The same mode value drives product output and applicability. Do not add a hidden selector, derived persisted scope, layout-effect synchronization, duplicated section targets, or a second panel mode store. Prefer direct options for the requested product states; additional genuinely local choices can stay conditional beneath the main selector.

This explicit application selector may govern multiple product entities. Each entity retains its own section identity and grouping rules. Other finite selectors retain normal dependency cohesion and `branch`/`parameter` classification. `affectedTargets` still lists only always-applicable controls whose outcome actually depends on the selector; explicit applicability adds dependents automatically. `sharedTargets` does not create unrelated browser case fanout.

Prove each declared mode through the existing applicability browser cases: active controls present and affecting that mode's output, other modes' controls absent, no empty section headings, and the mode selector reachable. Switch back, exercise Undo, and reload to prove saved mode and hidden values survive. A new product control without direct mode applicability or an explicit shared declaration fails the inventory gate.

## Section Headers And Reset

- Every visible section title renders through the standard 36px collapsible header row.
- Section text is explicitly left-aligned. Help stays beside the title; reset/action precedes a separate rightmost 24px design-system icon button for collapse, with its standard rounded hover/focus surface. The title remains clickable, but never wraps help, reset, or the collapse icon button.
- The runtime keeps every section title on one line. An actually overflowing title uses the shared right-edge opacity fade and exposes its full text on hover.
- Overflow handling is a defensive fallback for legacy content and localization. It never authorizes a generated app to keep an overlong title.
- Do not hand-build section headers in generated apps.
- Section expand/collapse uses the standard runtime height/opacity animation.
- Collapsed/expanded state persists as per-app runtime UI preference.
- Collapsed/expanded state is not undo/redo state, settings import/export state, or Reset controls state.
- Controls-panel scroll position persists automatically in the per-app runtime `panels` slice and restores on page reload, together with collapsed sections. Do not implement app-owned scroll storage or restoration.
- Scroll is a workspace preference, not undo/redo, settings import/export, or Reset controls state. The runtime preserves it across panel collapse/remount, restores without animation, and clamps to the nearest valid position if content is shorter. User scrolling takes priority over delayed restoration. `persistence.storage: "none"` disables reload persistence, including panel scroll.
- Ordinary section headers expose the runtime section reset action before the collapse button.
- Section reset dispatches `controls.resetTargets` and restores only that section's targets to schema `defaultValue`. This includes controls hidden by applicability, such as an inactive tab; switching tabs alone preserves their values.
- Runtime `Settings` follows ordinary section collapse and scoped reset behavior. The separate settings file/defaults action block and sticky footer export sections are not collapsible.

## Section Spacing

- The settings file/defaults action block uses the public technical spacing: 12px on all sides. Settings uses ordinary section spacing and its standard header, like other body sections: the body keeps 8px top and 24px bottom spacing.
- Sticky footer action sections keep their dedicated spacing.
- Do not add custom padding in generated apps to compensate for a local section issue. Fix the shared layout rule.

## Dividers

- Full-width dividers belong only to panel sections.
- Large built-in compound controls inside a section render content-width internal dividers only when their parent section contains more than one visible control item.
- Keep 18px between each rendered internal divider and compound-control content.
- Curves use 20px from the bottom of the graph to a following internal divider, for both RGB and single variants. RGB owns its bottom divider; a single curve keeps its ordinary-control classification and uses the gap before the next control's divider. Do not add a divider or app-owned padding just to achieve this spacing.
- If the compound control is the first item in that section, render only its bottom internal divider and remove top internal padding.
- If the compound control is the last item, render only its top internal divider and remove bottom internal padding.
- Adjacent compound controls share one internal divider: the preceding control owns its bottom line, and the following control suppresses its duplicate top line. At that boundary, replace the ordinary list gap with 18px of content clearance on each side of the 1px line. Runtime/UI owns this adjacency rule; do not compensate with app-specific borders, spacers or negative margins.
- If a section contains exactly one control, simple or compound, render only the parent section dividers.
- Do not add full-width borders inside a compound control.
- Do not put dividers only around an internal subsection such as Gradient Stops.
- Small compound fields such as `colorOpacity` and `rangeInput` stay inline fields without section dividers. Repeated `collectionActions` records built from `itemControls` use one content-width line only between adjacent logical records, with 18px spacing on each side and no generated item heading. A FileDrop collection slot and its per-file settings use the same group boundary. Standalone color `itemControl` grids have no item dividers.

## Labels And Help

- Keep labels short but semantically sufficient with the nearest visible section/group context.
- Put product-specific behavior help in schema `description`.
- Use section `description` only when the section scope or output relationship is not obvious from its concise title and visible controls.
- Runtime renders a section description only behind the standard filled `?` help icon beside the title, never as a visible descriptor or subtitle. Obvious sections omit `description` and show no section help icon.
- Runtime shows the help icon only when `description` adds meaning beyond the label.
- Do not use descriptions that recap the label, such as `Adjusts Opacity`.
- Do not add helper icons to obvious homogeneous groups when the section title and label already explain the control.
- In toggle components, do not prefix labels with `Enable`; the switch already communicates on/off.
- When a section title supplies the context, remove repeated nouns from nearby labels. Runtime Setup is the exception for its normalized output pair: the switch is `Background` and the color below it is `Background color`.
- A separately rendered visible field label must not normalize to the same text as its section title. Use `label: false` when the section supplies the complete visible context, or use a more specific label when the control represents a distinct setting.
- `tabs` keep their schema label as an accessible tab-list name and do not render it as a separate visible field label, so matching the section title is valid for tabs.

## Inline Rows

- Inline rows are allowed only when the controls are related, short, and preserve internal padding.
- Every 50/50 inline row uses the same horizontal column gap as paired select controls.
- Controls in a 50/50 row each occupy half the available content width.
- If any label or value clips, truncates, or loses internal padding, stack the controls and record the fit reason.
- Toggle-plus-parameter rows are allowed when the toggle enables/includes the same entity and the parameter is short. Keep the toggle label visible and set the non-toggle parameter `label: false`.
- If the non-toggle parameter label is necessary, stack the controls instead.
- Sliders and range sliders are full-width and do not sit in inline rows.
- Segmented controls are full-width and do not sit beside Switch, Color, Select, or another control.
- Standalone selects are full-width with label above dropdown. Use two-column select rows only for related short pairs such as export `Format` and `Resolution`.

## Actions Layout

- If an `actions` control has a visible label, the label is above the buttons.
- One action button occupies the left 50% cell.
- Two action buttons fill one row.
- Groups continue in two columns up to four rows. Above four rows, use the shared previous/dropdown/next action navigator; count rows using the resolved column count. All three controls use the standard 28px height.
- Odd trailing actions in grid mode stay in the left 50% cell. Compact navigation preserves command callbacks, allows repeat selection, skips disabled/loading items, and disables arrows at list ends. The dropdown records only the last invoked command and does not claim that Undo or other edits still match that command.
- Sticky footer `panelActions` use the sticky footer action layout, where a final odd action can span the full row.

## Colors In Rows

- First identify the semantic entity the color belongs to: background, object, connector, glow, tone mapping, brand, export, or named product object.
- Keep color inside the entity section when it configures the same entity as nearby controls.
- Use a standalone color section only when color is the whole semantic section.
- Standalone color section titles must describe product role. Never create a section titled `Color` or `Colors`.
- A section with multiple sibling `color` or `colorOpacity` controls must not use sequential per-item labels such as `Color 1`, `Color 2`, or `Color 3`, regardless of target spelling, section title, or `semanticGroup`.
- Keep visible labels when each color edits a distinct user-facing entity or role.
- An explicit string `label` (or `label: true` for the control ID) remains visible in color-only sections. Use `label: false` for an unlabeled variation bank; its control IDs still provide accessible field names. An omitted label keeps the contextual default: hidden in a color-only section, visible in a mixed section.
- Apply label visibility to the whole semantic color group; do not mix labeled and unlabeled items inside one bank.
- Matching control type and schema adjacency never prove that colors belong to one bank.
- A section containing only color fields is one implicit color bank. In a mixed section with two or more plain `color` controls, declare `semanticGroup` on every plain color; use the same group only for colors that form one product-meaning row.
- Runtime pairs only adjacent plain colors with the same semantic group. Conditional controls are filtered before rows are built, so an inactive color never pulls an unrelated visible color into its row.
- Multiple related plain colors render at most two per row.
- A standalone plain `color` fills the available row, including a lone visible color after applicability filtering. An odd trailing plain color in a multi-color bank without opacity keeps one half-width column, including the same column gap as paired colors.
- `colorOpacity` always occupies the full content width. Within one contiguous semantic color bank, pair adjacent plain colors first; if that bank includes opacity, any unpaired plain color also occupies the full width of its stacked row. One plain color plus opacity therefore forms two full-width rows; two plain colors plus opacity form a half-width pair followed by one full-width row. Keep authored order and semantic group boundaries.
- `colorOpacity` owns color plus opacity for one entity and must not be split into color plus opacity slider/input.

## Select And Segmented Fit

- Standalone `select` controls render stacked and full-width.
- Use compact two-column select layout only for related short pairs that tune one workflow or entity.
- Text segmented controls allow at most 4 options, no option label longer than 9 characters, and no more than 24 total option-label characters.
- The static segmented option/label budget rejects over-budget schemas before render; there is no silent conversion to `select`.
- Browser geometry verification remains required for actual font metrics, localization, zoom, and panel width.
- If segmented cells clip, collide, lose padding, or force labels into adjacent cells, shorten labels first. If compact labels still fail, use `select`.
