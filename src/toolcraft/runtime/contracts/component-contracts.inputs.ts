import { control, decisionCatalog } from "./component-contract-builders";
import type { ToolcraftComponentContract } from "./types";
export const TOOLCRAFT_INPUT_COMPONENT_CONTRACTS = {
  aspectRatio: {
    ...control(
      "aspectRatio",
      "CanvasAspectRatioControl",
      "grouped",
      "required",
    ),
    decisionCatalog: decisionCatalog({
      strictness: "exact-owner",
      ownsValueModel: [
        "canvas aspect-ratio preset",
        "custom canvas width-to-height ratio",
      ],
      useWhen: [
        "Use AspectRatio for the runtime-owned editable canvas ratio in Setup.",
      ],
      doNotReplaceWith: [
        "Do not recreate canvas aspect ratio with a product Select or detached width and height controls.",
      ],
      layoutConstraints: [
        "AspectRatio belongs to the mandatory runtime Setup block before Canvas width and Canvas height.",
      ],
      requiredAcceptance: [
        "Prove presets resize the canvas, pixel edits preserve the selected proportion and update the other side, and Custom reveals editable ratio fields distinct from pixel dimensions.",
      ],
    }),
    aiUsageRules: [
      "AspectRatio is runtime-owned Setup UI and is not authored as a product control.",
      "Canvas dimension edits retain the selected preset or custom ratio and recalculate the opposite side with integer pixel rounding.",
      "Custom exposes positive-integer Ratio W and Ratio H; Canvas width and Canvas height edit pixel dimensions under that ratio. Invalid ratio input reverts and Escape cancels.",
    ],
  },
  slider: {
    ...control("slider", "Slider", "grouped", "required"),
    decisionCatalog: decisionCatalog({
      strictness: "best-fit",
      ownsValueModel: [
        "single numeric value",
        "bounded continuous range",
        "bounded stepped range",
        "small semantic integer range",
      ],
      useWhen: [
        "Use Slider for one numeric value inside fixed min and max bounds.",
        "Use Slider when dragging through approximate values is useful and every intermediate value is valid.",
        "Use variant discrete only for small semantic integer domains where markers help choose positions.",
      ],
      doNotReplaceWith: [
        "Do not use Slider for finite named options; use Select or Segmented.",
        "Do not use two Slider controls for a lower/upper range; use RangeSlider or RangeInput.",
        "Do not use Slider as a detached opacity field for a color entity; use ColorOpacity.",
      ],
      acceptableAlternatives: [
        "Use Select for small named option sets.",
        "Use RangeSlider or RangeInput for from/to ranges.",
      ],
      layoutConstraints: [
        "Schema sliders stay stacked at full width.",
        "Only FontPicker may pair its internal letter-spacing and line-height sliders.",
      ],
      requiredAcceptance: [
        "Prove dragging the slider changes product output or the intended runtime side effect while the drag is in progress, not only after pointer release, blur, Apply, or a final commit.",
        "For discrete sliders, prove the discrete variant renders markers and dragging remains smooth.",
      ],
    }),
    aiUsageRules: [
      "Sliders are live canvas controls: dragging must update runtime state and product output in real time by default.",
      "Do not implement slider values as deferred local drafts, Apply-only updates, pointer-up-only commits, or renderer changes that appear only after the user asks again.",
      "Slider performance coverage must use a real control-drag scenario; control-change coverage is not enough to prove live canvas feedback or drag smoothness.",
      "If a live slider causes jank, optimize the renderer path first: update uniforms or stable buffers, cache expensive inputs, coalesce preview work to requestAnimationFrame, cancel stale async renders, move heavy work off React, or switch renderer strategy.",
      "Only in an extreme documented performance ceiling may a slider use a degraded live preview or delayed heavy refinement; the user must still see immediate canvas feedback while dragging and the worklog must record the measured reason.",
      "Slider step means numeric snapping only; it does not make the slider visually discrete by itself.",
      'Every slider declares sliderValueKind: "continuous" or "discrete" from the product value model. Labels and descriptions are not slider-kind evidence.',
      'Use variant: "discrete" only with sliderValueKind: "discrete"; the typed value kind lets validation stay language-independent.',
      "Classify every stepped slider as stepped continuous or visual discrete before writing the schema.",
      'Small semantic integer domains such as rows, cols, gaps, jitter, counts, levels, bands, passes, points, tiles, and segments must use variant: "discrete".',
      'Finite animation step domains such as flip depth, character count, glyph steps, and frame steps must use variant: "discrete" when the marker count stays within the Toolcraft visual budget.',
      'Visual discrete slider and range-slider variants require authored finite min and max plus a positive step, and may expose at most 32 value positions including endpoints. At 33 or more positions, keep sliderValueKind "discrete" and step but use the continuous visual variant or another built-in control.',
      "Large or precision stepped ranges such as speed, FPS, rate, duration, density, size, and intensity stay visually continuous even when they declare step.",
      "Use slider unit only for real measurement suffixes such as %, px, °, s, ms, fps, rows/cols, or similar domain units.",
      "Do not use unit for repeated entity nouns already named by the section or label, such as Letters + letters, Shape Density / Count + shapes, Words + words, Symbols + symbols, Items + items, Particles + particles, or Layers + layers.",
      'Do not use unit: "x"; scale, multiplier, intensity, opacity, strength, depth, and shader amount sliders display plain numbers unless a real measurement unit applies.',
      "When the value needs an entity noun to make sense, improve the label or section title instead of appending that noun as the value unit.",
      "Compact symbol/CSS units render tight, such as 70%, 24px, and 8s; word units render with a space, such as 5 cols, when they are truly needed.",
      "Slider valueLabel is editable only when it contains a numeric value; textual state labels such as Normal are display-only and must not expose hover or click editing affordances.",
      "Schema sliders render stacked at full width; do not put sliders in two-column inline layout groups.",
      "The fontPicker component is the only built-in exception with two internal footer sliders for letter spacing and line height.",
      "For a small named option set, prefer Select or Segmented instead of forcing a discrete Slider.",
      'Specs, plans, and app-schema tests must assert explicit discrete sliders render as variant: "discrete" with markers derived from min, max, and step.',
      'Browser verification can inspect [data-slot="slider"][data-variant="discrete"] plus slider markers to prove the Toolcraft component variant rendered.',
      "Visual discrete sliders must still drag smoothly; their canonical performance path adapter should use dragToolcraftSliderByTarget for real pointer drag and let the central path profile own the budget.",
      'Every product slider declares applicability as mode: "always" or mode: "conditional"; omitted applicability and control-level visibleWhen are rejected.',
      "Use conditional applicability for sliders that are meaningful only in some mode/type/source/include/count states; every predicate must match and inactive branches disappear.",
      "Do not use schema disabled: true or disabledWhen for product sliders, and do not leave a visible slider in a branch where its value has no product effect.",
    ],
  },
  rangeSlider: {
    ...control("rangeSlider", "RangeSlider", "grouped", "required"),
    decisionCatalog: decisionCatalog({
      strictness: "exact-owner",
      ownsValueModel: [
        "numeric lower and upper bounds",
        "from/to numeric range",
        "two-thumb bounded interval",
      ],
      useWhen: [
        "Use RangeSlider when users edit lower and upper bounds on the same numeric scale.",
        "Use RangeSlider when the relationship between the two values matters visually.",
      ],
      doNotReplaceWith: [
        "Do not replace RangeSlider with two independent Slider controls.",
        "Do not place RangeSlider beside another slider in an inline row.",
      ],
      acceptableAlternatives: [
        "Use RangeInput when manual exact text entry matters more than dragging handles.",
      ],
      layoutConstraints: [
        "RangeSlider is always full-width and stacked.",
        "Default lower and upper values must be different.",
      ],
      requiredAcceptance: [
        "Prove dragging rangeSlider.lower and rangeSlider.upper both affect product output while the drag is in progress, not only after pointer release, blur, Apply, or a final commit.",
      ],
    }),
    aiUsageRules: [
      "Range sliders are live canvas controls: dragging either thumb must update runtime state and product output in real time by default.",
      "Do not implement range slider values as deferred local drafts, Apply-only updates, pointer-up-only commits, or renderer changes that appear only after the user asks again.",
      "Range slider performance coverage must use a real control-drag scenario; control-change coverage is not enough to prove live canvas feedback or drag smoothness.",
      "If a live range slider causes jank, optimize the renderer path first: update uniforms or stable buffers, cache expensive inputs, coalesce preview work to requestAnimationFrame, cancel stale async renders, move heavy work off React, or switch renderer strategy.",
      "Only in an extreme documented performance ceiling may a range slider use a degraded live preview or delayed heavy refinement; the user must still see immediate canvas feedback while dragging and the worklog must record the measured reason.",
      "Range slider step means numeric snapping only; it does not make the range slider visually discrete by itself.",
      "Classify every stepped range slider as stepped continuous or visual discrete before writing the schema.",
      'Small semantic integer domains such as rows, cols, gaps, jitter, counts, levels, bands, passes, points, tiles, and segments must use variant: "discrete".',
      'Finite animation step domains such as flip depth, character count, glyph steps, and frame steps must use variant: "discrete" when the marker count stays within the Toolcraft visual budget.',
      'Visual discrete slider and range-slider variants require authored finite min and max plus a positive step, and may expose at most 32 value positions including endpoints. At 33 or more positions, keep sliderValueKind "discrete" and step but use the continuous visual variant or another built-in control.',
      "Large or precision stepped ranges such as speed, FPS, rate, duration, density, size, and intensity stay visually continuous even when they declare step.",
      "Use rangeSlider unit only for real measurement suffixes; do not use it for repeated entity nouns already named by the section or label, and do not use x as a unit.",
      "When a range label needs an entity noun to make sense, improve the label or section title instead of appending that noun as the value unit.",
      "Compact symbol/CSS units render tight, such as 20% – 80% or 12px – 48px; word units render with a space when truly needed.",
      "RangeSlider is always a full-width two-thumb control; never place it in an inline two-column layout group with another slider or range slider.",
      "RangeSlider defaultValue must start with different lower and upper values so the two-thumb control does not collapse into a single-value slider.",
      "Manual range value editing accepts common separators such as slash, hyphen, spaces, and dashes, including when values include unit suffixes such as 30%-150% or 30% - 90%; do not create custom parsers for RangeSlider labels.",
      'Specs, plans, and app-schema tests must assert explicit discrete range sliders render as variant: "discrete" with markers derived from min, max, and step.',
      "Visual discrete sliders must still drag smoothly; their canonical performance path adapter should use dragToolcraftSliderByTarget for real pointer drag and let the central path profile own the budget.",
      'Every product range slider declares applicability as mode: "always" or mode: "conditional"; omitted applicability and control-level visibleWhen are rejected.',
      "Use conditional applicability for range sliders that are meaningful only in some mode/type/source/include/count states; every predicate must match and inactive branches disappear.",
      "Do not use schema disabled: true or disabledWhen for product range sliders, and do not leave a visible range slider in a branch where its value has no product effect.",
      "Acceptance must prove both rangeSlider.lower and rangeSlider.upper change the product output; testing one handle is not enough.",
    ],
  },
  text: {
    ...control("text", "TextInput", "grouped", "required"),
    decisionCatalog: decisionCatalog({
      strictness: "best-fit",
      ownsValueModel: [
        "short single-line text",
        "single-line content",
        "single-line setting value",
      ],
      useWhen: [
        "Use TextInput for short names, button labels, titles, captions, tokens, compact prompts, and small setting strings.",
        "Use commitMode content for real product content and commitMode setting for configuration-like values.",
      ],
      doNotReplaceWith: [
        "Do not use TextInput for long multiline content; use CodeTextarea.",
      ],
      acceptableAlternatives: [
        "Use CodeTextarea for multiline or long structured content.",
        "Use Select for finite choices.",
      ],
      layoutConstraints: [
        "Short numeric/text pairs can share inline rows when they tune one product meaning.",
      ],
      requiredAcceptance: [
        "Prove text edits change product content or the intended setting at the correct commit timing.",
      ],
    }),
    aiUsageRules: [
      "TextInput owns short single-line product text: button labels, labels on the canvas, names, titles, captions, badges, short tokens, and compact prompts.",
      'Every TextInput declares textValueKind: "single-line". Control selection must not be inferred from the label, description, or default string length.',
      'TextInput commitMode defaults to "content": text content, prompts, names, tokens, titles, and instructions apply while typing.',
      'Use commitMode: "setting" for text inputs that edit settings such as font size, numeric-like style values, dimensions, ids, or configuration fields; setting text commits on blur or Enter.',
      "Canvas width and Canvas height are runtime editable-size fields and always commit on blur or Enter like editor size fields.",
    ],
  },
  rangeInput: {
    ...control("rangeInput", "RangeInput", "grouped", "required"),
    decisionCatalog: decisionCatalog({
      strictness: "exact-owner",
      ownsValueModel: [
        "manual lower and upper values",
        "from/to text range",
        "compact paired range input",
      ],
      useWhen: [
        "Use RangeInput when users need to type or inspect a lower and upper bound more than drag them.",
      ],
      doNotReplaceWith: [
        "Do not replace RangeInput with two unrelated TextInput controls for one range.",
      ],
      acceptableAlternatives: [
        "Use RangeSlider when dragging the range relationship is the primary interaction.",
      ],
      layoutConstraints: [
        "Keep the two range fields together as one compound control.",
      ],
      requiredAcceptance: [
        "Prove rangeInput.start and rangeInput.end both affect product output.",
      ],
    }),
    aiUsageRules: [
      "RangeInput is a compound control; acceptance must prove rangeInput.start and rangeInput.end both affect the product output.",
      "Do not accept a range input test that edits only the first field or only checks runtime state.",
    ],
  },
  code: {
    ...control("code", "CodeTextarea", "standalone", "required"),
    decisionCatalog: decisionCatalog({
      strictness: "best-fit",
      ownsValueModel: [
        "long text",
        "multiline content",
        "structured text",
        "prompt",
        "JSON",
        "CSS",
        "shader code",
      ],
      useWhen: [
        "Use CodeTextarea for potentially long, multiline, or structured text values.",
      ],
      doNotReplaceWith: [
        "Do not use repeated TextInput controls for one long content value.",
      ],
      acceptableAlternatives: ["Use TextInput for short single-line values."],
      layoutConstraints: [
        "CodeTextarea is capped at 12 visible lines and scrolls internally.",
      ],
      requiredAcceptance: [
        "Prove long text edits affect product content while typing.",
      ],
    }),
    aiUsageRules: [
      "CodeTextarea is the multiline text input for any potentially long value, not only source code.",
      'Every CodeTextarea declares textValueKind: "multiline" or "structured". Control selection must not be inferred from English labels or a short default value.',
      "Do not use CodeTextarea for short single-line canvas text, button labels, names, titles, captions, badges, or short tokens; use TextInput.",
      "Use text for short single-line strings such as names, button labels, small numeric values, compact prompts, titles, captions, and short tokens.",
      "Use code only when the user may enter long prompts, multiline text, instructions, JSON, CSS, shader code, scripts, templates, or other long structured data.",
      "If CodeTextarea has a short single-line default value, the schema description must make the long, multiline, or structured-content reason explicit.",
      "CodeTextarea is a content editor and applies values while typing; do not wait for blur, Enter, or Cmd/Ctrl+Enter to update runtime state.",
      "CodeTextarea height is capped at 12 visible text lines; long content scrolls inside the textarea instead of making the controls panel taller.",
      "Do not name a section Code unless the product value is actually code; use the product role such as Prompt, Instructions, Template, JSON, Shader, or CSS.",
    ],
  },
} as const satisfies Record<string, ToolcraftComponentContract>;
