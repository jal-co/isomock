# Timeline And Animation

Read this module before changing animation, timeline, keyframes, playback, loop duration, video export, or animated renderer timing.

## Animation Intent Inventory

Before adding animation controls, write an Animation Intent Inventory. Classify the animation as one of:

- playback timeline;
- keyframes timeline;
- custom reference timeline;
- autonomous decorative output.

Use no timeline only when the motion is explicitly autonomous decoration with no user-facing play/pause, scrub, duration, loop, restart, progress, export-at-time behavior, product animation, or video export.

## Timeline Requirement

- Product animation uses the top playback timeline by default.
- Any app with `Export Video` must enable the top Toolcraft timeline.
- Do not add right-panel Play, Pause, Animate, Restart, or app-wide transport controls. Use the top timeline.
- Do not replace `TimelinePanel` with app-level playback, transport, or timeline UI to work around performance.
- Custom timeline UI is allowed only when a reference app has non-Toolcraft timeline behavior and the reference timeline inventory proves it.

## Compact And Extended Timeline

- Setup places the standard Background switch beside Infinity canvas after the local Save State as Default action when available, then Background color beside the Blanc/Dots workspace selector and finite sizing. Timeline and optional Lock rotation share the final Setup row.
- Timeline and Infinity canvas are self-explanatory runtime mode switches and do not render help icons.
- Off shows compact Play-only transport.
- On shows the extended timeline with scrubber, duration, loop, and keyframe UI.
- The switch is runtime UI state only. It does not pause playback, change keyframes, alter export, write product values, or reset with `Reset controls`.

## Seamless Forward Loops

- Product loops are seamless forward-only cycles by default.
- First and last frames stitch.
- Direction does not reverse.
- Mirror, yoyo, ping-pong, or back-and-forth behavior requires explicit user intent.
- Use `getToolcraftTimelineLoopTime` or `getToolcraftTimelineLoopProgress` in playback renderers instead of local wall-clock or fixed-duration phase math.
- When the loop period is known or product-derived, pass `defaultDurationSeconds` to `timelineModule({ mode, defaultDurationSeconds })` and record the evidence in animation or reference timeline metadata.
- Runtime/template fallback `8s` is not evidence for loop duration.
- Playback acceptance with loop coverage declares typed `timelineLoopProof`: forward-only direction, reverse playback forbidden, first/last frame seam match, and reproof after a duration edit. This declaration never replaces browser sampling of the real renderer.

## Duration Changes

- Editing timeline duration changes the loop length, not the scene design.
- The app must keep animation settings stable when duration changes.
- The loop remains seamless and forward-only after duration changes.
- Export duration follows runtime timeline duration.

## Keyframes

- Use keyframes timeline when users edit property animation over time.
- Keyframe renderers consume Toolcraft evaluated-value helpers/hooks.
- Do not parse timeline `valueLabel` strings.
- Do not read raw `state.values` for keyframed targets when evaluated keyframe helpers are available.
- When a keyframe point is selected and a parameter is edited, update the selected point instead of creating a new point unless the user explicitly adds one.
- Compound `collectionActions.itemControls` opt into nested keyframes only with `keyframeable: true`. Each selected item/field gets an opaque runtime address and atomic base-value/keyframe history; product code consumes evaluated parent collection arrays and never parses or constructs that address.
- Removing the final item prunes only its suffix tracks. Full collection replacement, reset, or settings import prunes every nested track for that collection; persistence retains only schema-valid in-range tracks with matching snapshot provenance.

## Viewport Interaction Performance

- Animated preview renderers suspend or coalesce non-essential animation work during canvas drag, pan, pinch, zoom, and radar/center interactions.
- Resume from the correct timeline or autonomous time without changing play/pause state.
- Do not sacrifice selected render scale or visible quality to pass performance budgets without measured evidence.

## Video Export Timing

- Runtime video export creates a fixed 30 FPS schedule from runtime timeline duration and evaluates one immutable frame state at every scheduled timeline time.
- The timestamped Mediabunny backend encodes each completed frame with its explicit schedule timestamp and duration; render wall-clock cost does not affect artifact cadence.
- Product code must not use `canvas.captureStream()`, `MediaRecorder`, `VideoEncoder`, or its own encoder/download fallback.
- Protected browser acceptance proves edited timeline duration, actual encoded packet count/timings, and distinct decoded product frames.
