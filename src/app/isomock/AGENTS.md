# Isomock

Product notes for agents editing Isomock. The root `AGENTS.md` is the Toolcraft contract and still applies, except where it says `src/toolcraft` is immutable; do not edit `docs/toolcraft` (except `agent-worklog.md`), `LICENSE.md`, or `NOTICE.md`.

## Toolcraft runtime is ours

`src/toolcraft` is a fork of Toolcraft maintained here. Edit it when a feature needs runtime support; do not regenerate it from upstream, which would drop these changes. `npm run test` no longer runs the signed integrity check. Changes made so far:

- `schema/runtime-setup-background.ts` and `runtime-setup-section.ts`: one `actions` control in the authored Background section moves into Settings below Background color. This is how Match screenshot lives there.
- `export/product-export-renderer.ts`, `image-artifact-export.ts`, `video-artifact-export.ts`, `export-renderer-coverage.ts`: a raster `baseFileName` may be a function of `"image" | "video"`, resolved at download time. Exports are named `isomock-<kind>-mmddyy-hhmmss`.

## What it is

A screenshot mockup tool. One uploaded image or video (a single `fileDrop` with `assetKind: "file"`) is rendered on a tilted 3D plane with depth-of-field blur, grain, and an edge fade, then exported as PNG/JPG or MP4/WebM. Video has no product animation: the timeline only plays the clip, and its duration follows the clip.

## File map

| File | Owns |
| --- | --- |
| `settings.ts` | Control targets, defaults, and parsing runtime values into `IsomockSettings` |
| `camera.ts` | Camera basis from the orientation pose, framing (zoom/offset), focus depth, ray/plane hit test |
| `gl-renderer.ts` | WebGL2 program: analytic ray/plane cast, disc-gather depth of field, chromatic aberration, grain, edge fade and extend, media rotate/flip |
| `pipeline.ts` | Toolcraft renderer pipeline registration (`source-decode`, `preview-render`, `export-render`) |
| `source.ts` | Finding the source asset and decoding it as a retained, source-scoped `ImageBitmap` or `<video>` |
| `use-video-playback.ts` | Syncs the decoded `<video>` with timeline play/pause/scrub and sets timeline duration to the clip length |
| `use-fit-artboard.ts` | Fits the artboard into the canvas area not covered by panels, on load, canvas resize, window resize, and panel move/collapse |
| `export-frame.tsx` | Dims the workspace outside the artboard and draws a hairline edge, portaled into the runtime canvas viewport so it never exports |
| `isomock-canvas.tsx` | Live preview, orbit drag, framing gestures, attribution mount |
| `use-framing-gestures.ts` | Pinch/Ctrl-scroll zoom and two-finger pan over the screenshot, written to `camera.zoom` and `camera.offset` |
| `export.ts` | `scene.rasterFrameRenderer` and the timestamped export file name: renders the same shader into one reused offscreen WebGL canvas at artifact size; video frames are seeked per export timestamp |
| `match-background.ts` | Panel actions: "Match screenshot" (median edge color into `appearance.background`) and "Center in frame" (focus point under the frame center), "Reset rotation" (pose back to its default) |
| `axis-legend.tsx` | X/Y/Z color key beside the runtime gizmo, portaled to `document.body` so it never exports |
| `attribution.tsx` | Top-left X/GitHub/credit links, portaled to `document.body` so they never export |

Schema lives in `src/app/app-schema.ts`; ports are wired in `src/app/app-composition.tsx`.

## Invariants

- Preview and export share `createIsomockCamera` and `createIsomockGlRenderer`. Any visual change must land in both paths through those modules, never in one caller.
- Blur radius and grain are expressed relative to output height, so exports at 2K/4K/8K match the preview. Keep new effects resolution-independent the same way.
- `camera.offset` is in image-height world units, not frame units. The framing math in `use-framing-gestures.ts` depends on `getIsomockFrameScale`.
- Canvas wheel/pinch over the screenshot is claimed by a window capture listener, because the runtime viewport handles wheel in its own capture phase. Events elsewhere fall through to normal editor navigation.
- WebGL contexts are never force-lost on dispose (React StrictMode remounts the preview). Export reuses one module-level renderer so 30 FPS video export does not create a context per frame.
- No code comments. Pass `~/dotfiles/tools/anti-slop/bin/anti-slop` on changed product files before pushing.

## Checks

```sh
npx tsc -p tsconfig.json --noEmit
npm run build
```

Visual checks use the project's headless Playwright: upload a screenshot through the `fileDrop` input, wait for `[data-isomock-source="ready"]`, then screenshot the canvas or click Export PNG and decode the download.

Toolcraft's `npm run verify:delivery` does not pass yet. The product acceptance matrix, performance scenarios, and worklog have not been authored.

## Deploy

Cloudflare Workers static assets, configured in `wrangler.jsonc` at the repo root. `npm run deploy` builds and deploys to https://isomock.justinlevine.me.

`index.html` is signed by Toolcraft and ships its default OG tags. `worker/index.js` runs only for `/` and swaps them with `HTMLRewriter` for Isomock's title, description, and `public/og.jpg` (1200×630). Edit social metadata there, not in `index.html`.
