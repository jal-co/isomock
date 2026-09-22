# Reference Study

Read this module before porting, auditing, or rebuilding from a reference app, Figma file, video, GIF, screen recording, contact sheet, or extracted frames.

## Reference Runtime Clone

When porting an existing app, use `transferMode: "reference-runtime-clone"` unless the user explicitly asks for redesign.

Preserve the reference runtime as source of truth:

- animation loop and time ownership;
- refs and mutable renderer state;
- particles, objects, connections, spawn cadence, and lifetime rules;
- pause/resume, restart, progress, export, and copy semantics;
- canvas sizing and media lifecycle;
- control-to-renderer mapping.

Toolcraft still owns the shell: schema, controls, canvas, panels, toolbar, file upload, sticky footer actions, and `canvasContent`.

Do not iframe the reference, replace the route with copied original UI, or rebuild the app as a different shell.

## Feature Inventory

Before implementation, create `appTransferMode.referenceFeatureInventory` from inspected reference source/runtime/UI.

Include every user-visible and output-affecting behavior:

- controls;
- modes;
- generated objects;
- renderer state;
- media import lifecycle;
- canvas sizing;
- layers and selection;
- timeline and transport;
- export/copy;
- persistence;
- randomization;
- reset behavior.

Each inventory item names the reference feature, cites source evidence, cites feature-level behavior evidence, describes original behavior, describes Toolcraft mapping, and points to an `acceptanceId` that proves the behavior.

Use `status: "ported"` when the behavior is carried over directly and `status: "toolcraft-native"` when Toolcraft owns the same behavior. If behavior is intentionally changed or omitted, mark it `status: "intentionally-changed"` and set `userApprovedChangeReason` with explicit user approval or redesign/change-request evidence.

Do not rely on the user to find missing reference functionality after delivery.

## Reference Study Record

Declare `appTransferMode.referenceStudy` and record:

- where the reference lives;
- which source/runtime files, routes, assets, and handlers were inspected;
- how the original was run or restored locally in the Toolcraft environment;
- which runtime/browser behaviors were checked.

Use:

- `status: "ran-original"` when the original can run as-is;
- `status: "restored-local"` when enough of the reference was reconstructed locally to observe behavior;
- `status: "source-inspection-only"` only when running or restoring is blocked. Set `sourceOnlyReason` to the concrete blocker and compensate with stronger source evidence and acceptance coverage.

Reference clones also declare `referenceTimeline` with mode `none`, `toolcraft-playback`, `toolcraft-keyframes`, or `custom-reference-timeline`. Custom reference transport such as state buttons, trim handles, selected ranges, or range export uses `referenceTimeline.mode: "custom-reference-timeline"` plus browser-backed `referenceTimelineCoverage`.

## Figma Source

When a prompt provides a Figma URL, treat the Figma file as the design source of truth.

Required flow:

- Use Figma MCP/design context before implementation.
- Inspect the target node, layer tree, component instances, variants, text nodes, variables, styles, and assets.
- Recreate the design from the Figma structure and Toolcraft runtime/component contracts.
- Use screenshots only for final visual QA after reading the file structure.

Do not implement a Figma design by eye from an image, screenshot, exported PNG, or rough visual memory.

## Video References And Motion Evidence

Every supplied video, GIF, screen recording, contact sheet, or extracted-frame
sequence is one typed `referenceInputs` item. Preprocess it before product code:

```bash
npm run reference:study -- --source /absolute/path/reference.mp4
```

The protected command accepts exactly one absolute `--source`. Use `--kind`
with `video`, `gif`, `screen-recording`, `frame-sequence`, or `contact-sheet`
when detection is unavailable or the source meaning must be explicit. A contact
sheet also requires `--grid columnsxrows`. Image sources use at most one timing
authority: `--fps number` or `--timestamps-file /absolute/path/times.json`.
Timed sources may add one `--segment start:end` and repeated
`--focus start:end` windows. All ranges are seconds, bounded by the inspected
source, and focus windows remain inside the selected segment.

The command performs one full-frame source scan. It measures change across
every decoded frame, keeps a dense 12 FPS overview, expands detected events and
explicit focus windows, and materializes the union once. A study contains at
most 120 reviewed frames; larger reviews become a content-addressed partition
group with one shared plan and atomic publication. This bound limits sheet
legibility, not source inspection: no source interval is skipped by the scan.

Each committed study owns exactly two generated resources under
`src/app/reference-studies/<studyId>/`:

- `evidence.json` — canonical source identity, timing, reviewed frames, dense
  overview, detected events, partition identity, and tool versions;
- `contact-sheet.png` — the normalized reviewed-frame sheet cited by that JSON.

Both resources are product-owned evidence, not protected framework trust roots.
Do not edit them by hand. Rerun the command from the original source; publication
replaces the complete study group or preserves the previous complete group.

Timed video, GIF, and screen-recording evidence uses decoded timestamps.
Frame sequences and contact sheets use `seconds` timing only with declared FPS
or strictly increasing timestamps; otherwise they use `ordinal` timing.
Declared timestamps are normalized to a zero origin while their original file
hash remains recorded. Make duration, speed, cadence, easing, or loop-seam
claims only from a seconds-timed study.

After generation, import the checked evidence JSON and author the semantic
layer in `appTransferMode.referenceInputs`:

- cover the complete ordered overview with contiguous `phases` and describe
  each visible state;
- classify every detected event exactly once as `product-behavior`,
  `edit-boundary`, `encoding-artifact`, or `irrelevant-change`;
- attach product events and phases to explicit behaviors;
- map every behavior bidirectionally to one observable acceptance row through
  `acceptanceId` and `motionReferenceCoverage`;
- require the mapped browser row to prove `reference-parity` against the
  inspected reference, not a generic screenshot or canvas hash.

Review seconds-timed studies at real time. Also review them slowed when a
detected product event or a timing claim needs transition detail. Review
ordinal studies as ordered frames. Record one exact worklog line per study:

```md
- Motion reference study: referenceId=<referenceId>; studyId=<studyId>; sourceSha256=<sha256>; timingMode=<seconds|ordinal>; contactSheetPath=<path>; review=<real-time|real-time+slowed|ordered-frames>
```

The evidence JSON and contact sheet remain resources cited by product-authored
`referenceInputs`. The command entrypoint and public evidence decoder plus its
declaration are explicit trust-root sentinels. Transitive sampling, media,
protocol, staging, and publication modules are not additional sentinels; the
canonical framework inventory discovers and signs them automatically. Product
code must not duplicate preprocessing, validators, or artifact publication.

For a product with no motion reference, declare `referenceInputs: []`. This is
the no-reference fast path: do not invoke FFmpeg, run `npm run reference:study`,
create placeholder evidence, or add `reference-parity` requirements.

## Behavior and Acceptance Mapping

Every reference feature maps to acceptance coverage.

Each authored behavior in `referenceInputs[].behaviors` names its observable
acceptance row through `acceptanceId`. That acceptance row maps back to the same
`referenceId` and behavior through `motionReferenceCoverage`, and its browser
proof must emit `reference-parity` evidence against the inspected reference.

The port is incomplete until inventory and acceptance coverage prove that reference functionality was reviewed and transferred.

## Worklog Evidence

`docs/toolcraft/agent-worklog.md` records:

- explicit reference inputs;
- source/reference checked;
- contract rules applied;
- decisions;
- alternatives rejected;
- state/output mapping;
- verification;
- risks or follow-ups.

If a worklog cites a video, GIF, screen recording, contact sheet, extracted frames, Figma URL, or reference app, it must include the corresponding study evidence.
