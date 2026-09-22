import { control, decisionCatalog } from "./component-contract-builders";
import type { ToolcraftComponentContract } from "./types";
export const TOOLCRAFT_VISUAL_COMPONENT_CONTRACTS = {
  colorOpacity: {
    ...control("colorOpacity", "ColorOpacity", "standalone", "component-owned"),
    decisionCatalog: decisionCatalog({
      strictness: "exact-owner",
      ownsValueModel: [
        "color plus opacity for one entity",
        "hex color and percent opacity",
      ],
      useWhen: [
        "Use ColorOpacity when one product entity owns both a color and opacity.",
      ],
      doNotReplaceWith: [
        "Do not split ColorOpacity into separate Color and opacity Slider/Input controls.",
      ],
      acceptableAlternatives: [
        "Use Color only when opacity is not editable.",
        "Use Gradient when the entity is a color transition or gradient fill.",
      ],
      layoutConstraints: [
        "ColorOpacity stays stacked and does not share inline color rows.",
      ],
      requiredAcceptance: [
        "Prove colorOpacity.hex and colorOpacity.opacity both affect product output.",
      ],
    }),
    aiUsageRules: [
      "Use ColorOpacity when one product entity needs both a color and an opacity value, such as text color, shadow color, glow color, overlay color, or stroke color.",
      'Do not split ColorOpacity into a separate Color plus Slider/Input for opacity; use type: "colorOpacity" so the color popover and percent input stay visually connected.',
      "ColorOpacity is the only color control variant that may expose opacity in the color picker popover; plain Color popovers hide opacity controls.",
      "Use one object value with hex and opacity. Renderers and exports must consume both parts.",
      "Do not place ColorOpacity in inline two-column layout groups. If either color control has opacity, keep the controls stacked.",
      "Only plain Color controls without opacity may render in two-column color rows.",
      "Acceptance must prove colorOpacity.hex and colorOpacity.opacity both affect the product output; testing only the swatch or only runtime state is not enough.",
    ],
  },
  palette: {
    ...control("palette", "Palette", "standalone", "component-owned"),
    decisionCatalog: decisionCatalog({
      strictness: "best-fit",
      ownsValueModel: [
        "constrained palette choice",
        "palette family and shade",
        "design-token color selection",
        "style-guide color token",
      ],
      useWhen: [
        "Use Palette when users choose from a constrained palette family and shade rather than a free color value.",
        "Use Palette for token-based color choices such as brand palettes, Tailwind-like shade scales, semantic palette families, or style-guide colors.",
      ],
      doNotReplaceWith: [
        "Do not use Palette for arbitrary color picking.",
        "Do not use Palette for gradients, free hex colors, text color inside FontPicker, or a color value that owns opacity.",
      ],
      acceptableAlternatives: [
        "Use Color for a free single color.",
        "Use ColorOpacity when opacity belongs to the same color entity.",
        "Use Gradient for color transitions, gradient fills, stops, type, and angle.",
        "Use FontPicker when the color belongs to product typography.",
      ],
      layoutConstraints: [
        "Palette is a standalone compound control.",
        "Palette renders content-width internal dividers only when it shares a panel section with sibling controls, with 18px vertical spacing between each divider and the control content; if it is the first control in that section, only the bottom internal divider renders; if it is the last control in that section, only the top internal divider renders; and if it is the only control in the section, only the parent section dividers render.",
      ],
      requiredAcceptance: [
        "Prove palette.family and palette.shade both affect product output.",
        "Prove Palette family and shade selections update runtime state immediately, before delayed persistence/commit settles.",
      ],
    }),
    aiUsageRules: [
      "Use Palette only when the product value is a constrained design-token palette choice with both family and shade.",
      "Good Palette examples: brand palette family and shade, Tailwind-like token color, style-guide color scale, semantic palette family, or theme accent token.",
      "Do not use Palette for arbitrary free color picking; use Color instead.",
      "Do not use Palette when opacity belongs to the same color entity; use ColorOpacity instead.",
      "Do not use Palette for gradients or color transitions; use Gradient instead.",
      "Do not split typography color out to Palette when the text styling belongs to FontPicker.",
      "Palette is a live control like Color and Slider: family and shade changes must update runtime state immediately so the next canvas interaction uses the selected token without waiting for delayed commit or persistence timers.",
      "Palette is a compound control; acceptance must prove palette.family and palette.shade both affect the product output.",
      "Do not accept a palette test that only changes a swatch preview without proving the renderer/export consumes the selected family and shade.",
    ],
  },
  vector: {
    ...control("vector", "Vector", "standalone", "component-owned"),
    decisionCatalog: decisionCatalog({
      strictness: "exact-owner",
      ownsValueModel: [
        "x/y vector",
        "user-authored stable position",
        "user-authored stable offset",
        "user-authored stable direction",
        "focus point",
        "light vector",
        "color balance pad",
      ],
      useWhen: [
        "Use Vector for paired X/Y values only when the user is meant to manually author a stable two-axis product parameter such as position, offset, direction, focus, anchor, light direction, or color-balance movement.",
      ],
      doNotReplaceWith: [
        "Do not replace Vector with two unrelated sliders or text inputs when direct two-axis editing is the product interaction.",
        "Do not replace animation, keyboard input, pointer input, physics, timeline phase, velocity, or simulated pose state with Vector just because the internal value has x/y coordinates.",
        "Do not use Vector for camera orbit, object orbit, or any user-rotatable three-dimensional view.",
      ],
      acceptableAlternatives: [
        "Use two numeric text fields only when exact numeric entry is the primary product requirement.",
        "Use timeline, keyboard/pointer handlers, motion sliders, path/step controls, or renderer simulation state when movement is generated by animation or user input rather than authored as a stable panel value.",
        "Use OrientationGizmo when a visible model can be rotated in 3D.",
      ],
      layoutConstraints: [
        "One vector renders as a square pad; multiple vectors render compact pads.",
      ],
      requiredAcceptance: [
        "Prove vector.x and vector.y both affect product output.",
      ],
    }),
    aiUsageRules: [
      "If the controls panel contains exactly one vector control, the runtime renders the vector pad as a square.",
      "If the controls panel contains multiple vector controls, the runtime renders compact vector pads.",
      "Multiple vector controls should live in separate semantic sections unless they intentionally belong to the same entity with other related controls.",
      "Use Vector only for user-authored stable two-axis product parameters. Do not expose Vector for current animation state, keyboard movement, pointer movement, physics state, timeline phase, velocity, target pose, current pose, or simulated position/direction.",
      "Before adding a Vector control to an animated or interactive product, classify movement ownership as direct-authored, timeline-driven, keyboard/pointer-driven, or simulation-owned. Only direct-authored movement may become a visible Vector control; the other ownership modes stay in renderer/runtime interaction state and use controls such as Speed, Step, Spread, Path, Duration, or Timeline when the user needs tuning.",
      'Use variant: "whiteBalance" for temperature/tint pads: X maps cool blue to warm amber, Y maps green to magenta.',
      'Use variant: "colorBalance" for paired color-balance axes such as cyan/red and blue/yellow correction.',
      'Use variant: "chromaOffset" for RGB/chromatic offset vectors where the X/Y movement controls channel separation.',
      'Use variant: "toneBias" for split-tone, duotone, or color-grading vectors where both axes describe tone or hue bias.',
      "Use the default vector variant for spatial values such as position, offset, direction, focus, anchor, and light direction.",
      'Default spatial vector pads use coordinateMode: "screen": dragging left/up makes vector.x and vector.y smaller so canvas objects move left/up without renderer-side Y inversion.',
      "Vector pad value labels render compact rounded coordinates. Do not expose raw floating-point strings such as -0.07070312499999998 in the controls panel.",
      "Vector product state always stores finite numeric x and y values; decimal strings exist only at the visual input boundary and canonicalize before state or keyframes.",
      "Double-clicking a vector pad resets both axes to the control default through the normal runtime value update, matching section header reset semantics; if no default is defined, the fallback is 0,0. Do not add a separate custom reset UI for this basic pad reset behavior.",
      "Holding Shift while dragging a vector pad locks movement to the dominant axis and must not select text or page content; do not build a custom pad just to support axis-constrained movement.",
      'Use coordinateMode: "cartesian" only when the product intentionally exposes mathematical Y-up coordinates instead of canvas/screen movement.',
      "Do not add custom vector sizing props in generated schemas; choose the number, variant, and section grouping from product need and let the runtime size the pads.",
      "Vector is a compound control; acceptance must prove vector.x and vector.y both affect the product output and that the vector represents a user-authored stable two-axis parameter rather than current animation, input, or simulation state.",
      "Do not use Vector for a camera orbit, object orbit, or a visually flat object that users can rotate through three-dimensional space; use OrientationGizmo and direct model drag instead.",
    ],
  },
  orientationGizmo: {
    ...control(
      "orientationGizmo",
      "ToolcraftOrientationGizmo",
      "grouped",
      "hidden",
    ),
    decisionCatalog: decisionCatalog({
      strictness: "exact-owner",
      ownsValueModel: [
        "camera orbit pose",
        "object orbit pose",
        "user-authored three-dimensional view orientation",
        "signed-axis orientation snap",
      ],
      useWhen: [
        "Use OrientationGizmo whenever the user can rotate a visible canvas model through three-dimensional space, including a volumetric 3D object or a visually flat object with a 3D orbit.",
      ],
      doNotReplaceWith: [
        "Do not replace OrientationGizmo with Vector, paired sliders, segmented axis buttons, or a product-authored custom gizmo.",
      ],
      acceptableAlternatives: [
        'Use viewInteraction mode "fixed-camera" only with positive typed authority from a verbatim user request or a named inspected behavioral reference with observed locked interaction; a still image, screenshot, or desired output frame is composition evidence only.',
        'Use viewInteraction mode "timeline-camera" only with the same positive typed authority when the request or behavioral reference owns an authored camera path and Toolcraft timeline intent drives it.',
        "Use Vector for a stable authored X/Y parameter that does not represent three-dimensional orientation.",
      ],
      layoutConstraints: [
        "OrientationGizmo is a runtime-owned 70px canvas handle fixed 16px from the canvas viewport's left and bottom edges; it does not render duplicate controls in the panel.",
        "Declare it in the semantic section that owns the model or view so section/global reset includes the orientation target; do not create a panel section containing only the portal control.",
        "At most one OrientationGizmo may be visible at a time. Multiple schema declarations are valid only when their combined section/control visibility conditions are statically provable as mutually exclusive.",
      ],
      requiredAcceptance: [
        "Use the protected orientation axis-drag and axis-snap recipes to prove the shared pose and visible product output change while canvas viewport offsets stay fixed.",
        "Use the protected model-drag and canvas-miss-pan recipes to prove a visible-model hit changes the shared pose/output while Space + primary drag outside the model pans without changing either.",
        "Prove preview, geometry hit testing, PNG, and video consume the same orientation pose, and use the protected canvas export-clean recipe to prove the gizmo stays out of exported output.",
        "Use the protected undo/reset recipe to prove one gesture is one history step, redo restores it, and section/global reset restores the declared default pose.",
      ],
    }),
    aiUsageRules: [
      'Declare typed product readiness viewInteraction before controls or renderer code. A visible editable spatial scene defaults to mode "orbit"; do not make the scene non-rotatable first and then use that implementation choice to omit OrientationGizmo.',
      'Whenever a visible canvas model can be rotated in 3D, declare type: "orientationGizmo" with one non-keyframeable orientation target for the active model mode. This includes flat artwork or planes when the product exposes three-dimensional rotation.',
      "Multiple orientationGizmo declarations are allowed only for statically provable mutually exclusive modes; runtime rejects any state that makes more than one canvas orientation handle visible.",
      "Do not use Vector as a substitute for three-dimensional orientation and do not copy a custom gizmo into product code.",
      "The orientation value is { position: [x, y, z], up: [x, y, z] }. Use one non-degenerate default pose and read it through readToolcraftOrientationPose.",
      "Use useToolcraftModelOrbitInteraction in the product renderer. Supply a hitTest callback based on actual visible geometry; runtime must not guess product triangles, alpha, paths, or occlusion.",
      "Direct model interaction priority is fixed at pointer-down: CanvasShell claims Space + primary drag for pan before scene handlers; otherwise higher-priority product items may claim first, a visible-model hit orbits, and a miss does not pan. Modified primary presses and non-primary presses are not claimed by model orbit.",
      "Double-click an axis endpoint or the circular gizmo background to restore the active control's exact defaultValue through the shared runtime target. Cancel pending snaps; the preceding single-click snap and double-click reset form one undoable gesture. Canvas pan/zoom and other controls remain unchanged.",
      "Shift-drag on the gizmo locks the dominant pointer axis: horizontal yaw or vertical pitch. Keep that axis until Shift is released, and support mid-drag modifier changes without jumps. Direct model Shift-drag is unclaimed by model orbit and canvas pan still requires Space; do not replace these built-in gestures in product code.",
      "Gizmo drag, snap animation, and direct model orbit share target-scoped runtime ownership. A newer interaction, reset, undo/redo, or another write to the target cancels stale work before it can overwrite current state.",
      "Gizmo drag, direct model drag, preview, raycasting, reset/history, PNG, and video must all consume the same runtime target. Do not keep a second local Euler or camera pose.",
      "The gizmo is editor chrome: it stays fixed under canvas pan/zoom/radar and is excluded from every export.",
      "Orientation invalidation must touch only renderer passes that consume the pose, and direct orbit must remain live and responsive at the declared interactive workload without reducing preview quality.",
    ],
  },
  color: {
    ...control("color", "Color", "standalone", "component-owned"),
    decisionCatalog: decisionCatalog({
      strictness: "best-fit",
      ownsValueModel: ["single free color", "hex color value", "role color"],
      useWhen: [
        "Use Color for one editable free color without opacity or gradient stops.",
      ],
      doNotReplaceWith: [
        "Do not use multiple Color controls as a substitute for an adjustable Gradient.",
        "Do not pair Color with a separate opacity control when ColorOpacity fits.",
      ],
      acceptableAlternatives: [
        "Use ColorOpacity when opacity belongs to the color entity.",
        "Use Gradient for color transitions, fills with stops, or angle/type editing.",
        "Use Palette for constrained design-token choices.",
      ],
      layoutConstraints: [
        "A standalone plain Color fills the available row. Adjacent related plain Color controls may render two per row; ColorOpacity occupies a full row.",
        "In a mixed section with multiple plain Color controls, declare semanticGroup on every plain Color; runtime pairs only adjacent colors in the same semantic group. A color-only section is one implicit bank.",
        "Odd trailing plain Color controls in a multi-color bank without opacity keep the same half-width footprint as paired colors. Unpaired plain colors in an opacity bank fill their stacked rows.",
        "Color label visibility depends on user usefulness: palette variation banks omit per-item labels; distinct color roles keep labels.",
      ],
      requiredAcceptance: [
        "Prove the selected color affects product output, preview, or export.",
      ],
    }),
    aiUsageRules: [
      "Color controls can be standalone color sections or grouped fields inside a semantic control section.",
      "First identify the semantic entity the color belongs to, such as Square 1, Square 2, Background, Object, Connector, Glow, Tone Mapping, Brand, or Export.",
      "Keep a color inside a section when it configures the same entity as nearby controls. Example: Square 1 (Right) contains Connections, Hover radius, and Color in one section.",
      "Use a standalone color section only when the color itself is the whole semantic section; the section title must describe the product role such as Background, Object, Connector, Accent, Gradient, or Brand.",
      "When color belongs to the same object or effect as nearby controls, keep it inside that section and use a concise field label that is unambiguous in context, such as Color in a Square section or Symbol color in a mixed Style section.",
      "Decide color label visibility from the user's point of view. Omit labels for color banks that only add palette variety, such as Accent Shades, Bead Colors, or palette.accent1..5.",
      "Make color label visibility a group-level decision: do not mix labeled and unlabeled items inside one semantic color bank.",
      "Keep visible labels when colors edit distinct user-facing entities or roles, such as Fill, Stroke, Background, Connector, Object, or Highlight.",
      "A color bank can share a section with distribution controls such as Spread, Mix, or Randomness and still keep each color item unlabeled when the section title names the palette context.",
      "The standalone default applies only to color-only sections; mixed semantic sections keep color grouped with nearby controls.",
      "Never use generic Color or Colors as a generated section title. If no meaningful color role exists and the colors are just basic colors, use a neutral section title such as Appearance instead of omitting the title.",
      "Do not split a grouped object section into a separate generated Color section; if the color role is unclear, ask the user before implementation.",
      "When one short numeric/text field and one Color field configure the same entity, keep them in one two-column inline layout group.",
      "Mixed inline rows usually require visible labels on both controls. Toggle-plus-parameter rows are the section-owned exception: keep the Switch/Checkbox label visible and set the non-toggle parameter label to false; if the parameter label is needed, stack the controls instead. All 50/50 inline rows use the same horizontal column gap as paired Select controls. Palette variation color banks are the other exception when the group/section label already names the color bank.",
      "Plain Color popovers must not show opacity controls. If opacity is editable, use ColorOpacity instead.",
      "Color product state is a canonical hex string even though the UI callback payload is { hex }.",
      "Product-output apps always expose renderer-owned output background color as a schema color target such as appearance.background or scene.background.",
      'Declare renderer-owned output background color with export.includeBackground in one authored Background source section. Runtime normalizes them into Setup: a Switch labeled "Background" sits left of Infinity canvas in an equal-width row, Background color sits left of the Blanc/Dots workspace selector in the row below, and Timeline and optional Lock rotation share the final Setup row.',
      "CanvasShell reads the evaluated runtime background color and owns both live modes: finite renders below runtime model/image media and transparent product content; Infinity fills the complete viewport without a duplicate finite layer. Product renderers stay transparent in live preview. export.includeBackground controls the runtime layer and PNG alpha, and disabling it restores finite mode instead of leaving a transparent infinite workspace.",
      "Render multiple related color fields in one section with at most two colors per row.",
      "In a mixed section with multiple plain Color controls, declare semanticGroup on every plain Color; runtime pairs only adjacent colors in the same semantic group. A color-only section is one implicit bank.",
      "A standalone plain Color fills the available row. In a multi-color bank without opacity, keep an odd trailing plain Color at half width; an unpaired plain Color in an opacity bank fills its stacked row.",
    ],
  },
  gradient: {
    ...control("gradient", "Gradient", "standalone", "component-owned"),
    decisionCatalog: decisionCatalog({
      strictness: "exact-owner",
      ownsValueModel: [
        "gradient fill",
        "gradient type",
        "gradient angle",
        "gradient stops",
        "stop colors",
        "stop opacity",
        "stop positions",
      ],
      useWhen: [
        "Use Gradient when the product needs an adjustable gradient, color transition, multi-stop fill, linear fill, radial fill, angular fill, or diamond fill.",
        "Use Gradient when the prompt or reference mentions gradient stops, gradient angle, gradient type, or editable color transition.",
      ],
      doNotReplaceWith: [
        "Do not replace Gradient with two Color controls.",
        "Do not replace Gradient with ColorOpacity plus sliders.",
        "Do not build custom gradient UI unless the built-in Gradient cannot express the interaction and the custom escape hatch is documented.",
      ],
      acceptableAlternatives: [
        "Use Color or ColorOpacity only when the product explicitly needs fixed single colors, not an adjustable gradient.",
      ],
      layoutConstraints: [
        "Gradient is a full standalone compound control.",
        "Gradient renders content-width internal dividers only when it shares a panel section with sibling controls, with 18px vertical spacing between each divider and the control content; if it is the first control in that section, only the bottom internal divider renders; if it is the last control in that section, only the top internal divider renders; and if it is the only control in the section, only the parent section dividers render.",
      ],
      requiredAcceptance: [
        "Prove gradientType, angle, stop position, stop color, and stop opacity affect product output or export output.",
      ],
    }),
    aiUsageRules: [
      "Gradient is a compound control; acceptance must prove gradient.gradientType, gradient.angle, gradient.stops.position, gradient.stops.color, and gradient.stops.opacity all affect the product output when visible.",
      "Keep Gradient type/angle, draggable stop track, and Stops list inside the built-in Gradient control. The full Gradient control is visually separated with content-width dividers only when it shares a section with sibling controls; do not put dividers only around the Stops list and do not rebuild it as separate schema controls.",
      "Do not accept a gradient test that edits only a stop color; Linear/Radial/Angular/Diamond selection, angle, stop position, stop color, and stop opacity must be wired or the control should be simplified.",
      "If the renderer intentionally supports only a subset of gradient behavior, do not use the full Gradient control; use simpler controls that match the renderer behavior.",
    ],
  },
  fontPicker: {
    ...control("fontPicker", "FontPicker", "standalone", "component-owned"),
    decisionCatalog: decisionCatalog({
      strictness: "exact-owner",
      ownsValueModel: [
        "font family",
        "font preview",
        "font weight",
        "font size",
        "text case",
        "letter spacing",
        "line height",
        "text color",
        "text opacity",
      ],
      useWhen: [
        "Use FontPicker when product typography needs font family, weight, size, case, letter spacing, line height, text color, or text opacity.",
      ],
      doNotReplaceWith: [
        "Do not replace FontPicker with a plain Select plus separate typography controls.",
        "Do not build a custom font popup for product typography.",
        "Do not add sibling controls for text color, text opacity, case, weight, size, letter spacing, or line height when they belong to the same typography entity.",
      ],
      acceptableAlternatives: [
        "Use TextInput or Select only for non-typographic labels or finite text choices.",
      ],
      layoutConstraints: [
        "FontPicker owns its popup and internal footer controls.",
        "FontPicker renders content-width internal dividers only when it shares a panel section with sibling controls, with 18px vertical spacing between each divider and the control content; if it is the first control in that section, only the bottom internal divider renders; if it is the last control in that section, only the top internal divider renders; and if it is the only control in the section, only the parent section dividers render.",
      ],
      requiredAcceptance: [
        "Prove fontId, fontWeight, fontSize, letterSpacing, lineHeight, textCase, color, and opacity affect actual product text output.",
      ],
    }),
    aiUsageRules: [
      "FontPicker owns the font preview select, virtualized font popup, category filters, search, preview loading, font-weight select, font-size input, text-case select, text color/opacity control, letter-spacing slider, and line-height slider.",
      'Do not recreate FontPicker with a plain Select plus separate sliders; use type: "fontPicker" so the popup mechanics and footer controls stay intact.',
      "Use one object value with fontId, fontWeight, fontSize, letterSpacing, lineHeight, textCase, color, and opacity. Keep typography renderers wired to all eight parts.",
      "FontPicker standard/default text color is #FFFFFF with opacity 100; omit color/opacity or use those values unless the prompt or reference explicitly requires a different initial text color.",
      "Any product text controlled by FontPicker must render fontId, fontWeight, fontSize, letterSpacing, lineHeight, textCase, color, and opacity in preview and export; do not leave typography values as panel-only runtime state.",
      "FontPicker is an atomic compound typography control. Do not split any owned typography part into a neighboring schema control for the same product text entity.",
      "Do not put a help tooltip on FontPicker just to list its owned fields. If the section title and FontPicker labels already make the text target clear, omit description.",
      "FontPicker is a compound control; acceptance must prove fontPicker.fontId, fontPicker.fontWeight, fontPicker.fontSize, fontPicker.letterSpacing, fontPicker.lineHeight, fontPicker.textCase, fontPicker.color, and fontPicker.opacity all affect the product output.",
      "FontPicker acceptance must inspect the actual product text output after changing font, weight, size, letter spacing, line height, text case, color, and opacity; runtime state, select labels, or popup preview text alone are not enough.",
      "Browser verification must open the popup, choose a different font, change font weight, change font size, change text case, change text color/opacity, move the letter-spacing footer slider, and move the line-height footer slider.",
    ],
  },
  curves: {
    ...control("curves", "Curves", "standalone", "component-owned"),
    decisionCatalog: decisionCatalog({
      strictness: "exact-owner",
      ownsValueModel: [
        "editable curve",
        "tone curve",
        "response curve",
        "easing curve",
        "remapping curve",
        "channel curve",
      ],
      useWhen: [
        "Use Curves for editable remapping, tone, response, easing, opacity, depth, mask, or channel curves.",
      ],
      doNotReplaceWith: [
        "Do not replace Curves with generic sliders when the product needs an editable curve.",
        "Do not build custom curve UI just to remove RGB tabs; use variant single.",
      ],
      acceptableAlternatives: [
        "Use Slider only when the product needs one scalar strength value, not a curve shape.",
      ],
      layoutConstraints: [
        "Use variant single for one standalone curve and RGB variant only for color-correction or channel-specific curves.",
        "Single Curves is one labeled control and does not render internal dividers, even inside mixed sections.",
        "RGB Curves is a compound channel control and renders content-width internal dividers only when it shares a panel section with sibling controls, with 18px vertical spacing between each rendered divider and the control content; if it is the first control in that section, only the bottom internal divider renders and the top internal padding is removed; if it is the last control in that section, only the top internal divider renders and the bottom internal padding is removed; and if it is the only control in the section, only the parent section dividers render.",
      ],
      requiredAcceptance: [
        "Prove curves.points affect product output; RGB curves also prove activeChannel affects output.",
      ],
    }),
    aiUsageRules: [
      'Use Curves for editable remapping curves. RGB/R/G/B tabs are only for color-correction or channel-specific curves; use variant: "single" for one standalone curve without channel tabs.',
      'Every curves control declares curveIntent: "single-value-map" or "color-channels". Labels and target names are not curve-composition evidence.',
      'curveIntent: "single-value-map" requires variant: "single"; curveIntent: "color-channels" uses the channel composition.',
      'Use variant: "single" for a single acceleration, bend, easing, opacity, response, depth, mask, threshold, tone-response, or mapping curve. Do not create a custom curve UI just to remove RGB tabs.',
      "RGB Curves is a color-correction-specific case; do not force RGB/R/G/B tabs onto products that need only one response, bend, depth, or easing curve.",
      'Use interpolation: "smooth" for photo/editor-like visual tone, color, and RGB curves where the curve should feel like a creative editor spline.',
      'Choose interpolation explicitly by purpose, independently of single/RGB tabs: standalone Levels and tone curves use smooth; order-sensitive response mappings use monotone. Compile createCurveEvaluator(points, interpolation) once per evaluated value change and share that mapping across preview/export; never reimplement curve interpolation in product code.',
      'Use interpolation: "monotone" for depth, response, mask, opacity, threshold, and data-mapping curves where order must be preserved and overshoot is unsafe. Single curves default to monotone unless smooth is explicitly requested.',
      "Single Curves is one labeled control without internal dividers; RGB Curves is the compound variant with channel tabs and section dividers when mixed with sibling controls.",
      "RGB curves acceptance must prove curves.activeChannel and curves.points both affect the product output. Single curves acceptance proves curves.points.",
      "Curves acceptance should include an off-center control point near an edge so smooth-vs-monotone interpolation mistakes are visible in product output.",
      "Do not accept a curves test that only opens the UI or changes selected point state without proving renderer/export output changes.",
    ],
  },
  anchorGrid: {
    ...control("anchorGrid", "AnchorGrid", "standalone", "component-owned"),
    decisionCatalog: decisionCatalog({
      strictness: "best-fit",
      ownsValueModel: [
        "anchor position",
        "edge or corner placement",
        "nine-point alignment",
      ],
      useWhen: [
        "Use AnchorGrid for choosing an anchor, alignment point, or edge/corner placement.",
      ],
      doNotReplaceWith: [
        "Do not use AnchorGrid for freeform two-axis movement; use Vector.",
      ],
      acceptableAlternatives: [
        "Use Vector only for stable direct-authored continuous position or direction parameters.",
      ],
      layoutConstraints: ["AnchorGrid is a standalone position selector."],
      requiredAcceptance: ["Prove selected anchor changes product placement."],
    }),
    aiUsageRules: [
      "AnchorGrid is a position selector; acceptance must prove anchorGrid.position changes product placement, not only selected button state.",
      "Choose representative edge/corner anchors in browser tests so center-only behavior cannot pass.",
    ],
  },
  channelMixer: {
    ...control("channelMixer", "ChannelMixer", "standalone", "component-owned"),
    decisionCatalog: decisionCatalog({
      strictness: "exact-owner",
      ownsValueModel: [
        "RGB channel mixer",
        "RGB channel matrix",
        "active RGB output channel and RGB source-channel values",
      ],
      useWhen: [
        "Use ChannelMixer only when product behavior edits RGB channel mixing, channel swapping, or an RGB channel matrix.",
      ],
      doNotReplaceWith: [
        "Do not replace ChannelMixer with disconnected sliders for each channel when the active channel matrix matters.",
        "Do not use ChannelMixer for arbitrary non-RGB channels, data channels, audio bands, masks, layers, or option groups.",
      ],
      acceptableAlternatives: [
        "Use Color or Curves for simple color choice or tone curves that are not channel matrix mixing.",
        "Use Select, Segmented, Slider, Curves, or a justified custom control for non-RGB channel-like product domains.",
      ],
      layoutConstraints: [
        "ChannelMixer is a standalone compound control.",
        "ChannelMixer renders content-width internal dividers only when it shares a panel section with sibling controls, with 18px vertical spacing between each divider and the control content; if it is the first control in that section, only the bottom internal divider renders; if it is the last control in that section, only the top internal divider renders; and if it is the only control in the section, only the parent section dividers render.",
      ],
      requiredAcceptance: [
        "Prove channelMixer.activeChannel and channelMixer.values both affect product output.",
      ],
    }),
    aiUsageRules: [
      "ChannelMixer is RGB-specific: it renders R/G/B tabs and Red, Green, Blue sliders for an RGB channel matrix.",
      "Use ChannelMixer only for RGB channel mixing, channel swapping, or color-correction matrix behavior; do not use it for arbitrary channel lists.",
      "ChannelMixer is a compound control; acceptance must prove channelMixer.activeChannel and channelMixer.values both affect the product output.",
      "Do not accept a channel mixer test that changes only the active tab or only one slider without proving the selected channel matrix is consumed by the renderer/export.",
    ],
  },
} as const satisfies Record<string, ToolcraftComponentContract>;
