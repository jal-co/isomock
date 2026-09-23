# Isomock

Product notes for agents editing Isomock. The root `AGENTS.md` is the signed Toolcraft contract and still applies; do not edit it or anything under `src/toolcraft`, `docs/toolcraft` (except `agent-worklog.md`), `LICENSE.md`, or `NOTICE.md`. The integrity check in `npm run test` fails if you do.

## What it is

A screenshot mockup tool. One uploaded image is rendered on a tilted 3D plane with depth-of-field blur, grain, and an edge fade, then exported as PNG/JPG.

## File map

| File | Owns |
| --- | --- |
| `settings.ts` | Control targets, defaults, and parsing runtime values into `IsomockSettings` |
| `camera.ts` | Camera basis from the orientation pose, framing (zoom/offset), focus depth, ray/plane hit test |
| `gl-renderer.ts` | WebGL2 program: analytic ray/plane cast, disc-gather depth of field, grain, edge fade, media rotate/flip |
| `pipeline.ts` | Toolcraft renderer pipeline registration (`source-decode`, `preview-render`, `export-render`) |
| `source.ts` | Finding the screenshot asset and decoding it as a retained, source-scoped `ImageBitmap` |
| `isomock-canvas.tsx` | Live preview, orbit drag, framing gestures, attribution mount |
| `use-framing-gestures.ts` | Pinch/Ctrl-scroll zoom and two-finger pan over the screenshot, written to `camera.zoom` and `camera.offset` |
| `export.ts` | `scene.rasterFrameRenderer`: renders the same shader into a disposable WebGL canvas at artifact size |
| `match-background.ts` | "Match screenshot" action: median edge color into `appearance.background` |
| `attribution.tsx` | Top-left X/GitHub/credit links, portaled to `document.body` so they never export |

Schema lives in `src/app/app-schema.ts`; ports are wired in `src/app/app-composition.tsx`.

## Invariants

- Preview and export share `createIsomockCamera` and `createIsomockGlRenderer`. Any visual change must land in both paths through those modules, never in one caller.
- Blur radius and grain are expressed relative to output height, so exports at 2K/4K/8K match the preview. Keep new effects resolution-independent the same way.
- `camera.offset` is in image-height world units, not frame units. The framing math in `use-framing-gestures.ts` depends on `getIsomockFrameScale`.
- Canvas wheel/pinch over the screenshot is claimed by a window capture listener, because the runtime viewport handles wheel in its own capture phase. Events elsewhere fall through to normal editor navigation.
- The preview WebGL context must not be lost on dispose (React StrictMode remounts it). Only export renderers pass `disposable: true`.
- No code comments. Pass `~/dotfiles/tools/anti-slop/bin/anti-slop` on changed product files before pushing.

## Checks

```sh
npx tsc -p tsconfig.json --noEmit
npm run build
```

Visual checks use the project's headless Playwright: upload a screenshot through the `fileDrop` input, wait for `[data-isomock-source="ready"]`, then screenshot the canvas or click Export PNG and decode the download.

Toolcraft's `npm run verify:delivery` does not pass yet. The product acceptance matrix, performance scenarios, and worklog have not been authored.

## Deploy

Cloudflare Workers static assets, configured in `wrangler.jsonc` at the repo root. `npm run deploy` builds and deploys to https://isomock.justin-levine.workers.dev.
