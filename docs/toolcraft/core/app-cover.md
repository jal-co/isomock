# App composition covers

Every product app needs its own cover before first delivery or catalog registration. The agent creates a representative composition **inside the actual app**, then captures the result. A cover shows what the app really produces. Do not use an unrelated AI illustration, a marketing image, a screenshot of controls, or a product-name lookup into the gallery.

## Authoring

1. Inspect the app's purpose, renderer and controls. Choose meaningful supported settings or a representative preset and compose the result. Do not modify the user's saved defaults or source just to produce a cover; use an isolated session or retained cover-state snapshot.
2. Capture only the rendered result with the app's existing export path or a browser screenshot of its output. Use a 16:9 frame, keep the important content legible at a 214px thumbnail width, and leave the name to the Workspace text overlay. No panels, browser chrome, baked-in title or decorative border.
3. Save the static raster asset under `public/toolcraft/cover.png` (JPEG/WebP are also accepted, up to 8 MiB). Retain the exact settings as `app-cover-state.json` for reproduction. Animated apps capture a completed held frame and record the chosen time in the description.
4. Write `app-cover.json` at the app root:

```json
{
  "version": 1,
  "title": "My App",
  "asset": "public/toolcraft/cover.png",
  "generation": {
    "kind": "app-composition",
    "source": "src/app/app-composition.tsx",
    "state": "app-cover-state.json",
    "description": "Actual app result at the recorded settings; 16:9 output capture, no editor UI."
  }
}
```

Use the real output/composition entry in `source`. These fields record how the cover was made; metadata alone does not prove image provenance. Inspect the image and actual app result together. The asset and settings are normal product files, not diagnostics. Add a brief worklog entry with the capture path, settings and verification.

## Integration and verification

Catalogs discover covers from each registered app root. No name-specific host branches or imports from a documentation gallery are needed. Each definition supplies one reusable cover.

Missing or invalid cover metadata/asset is an explicit setup error. A transient image-loading failure may leave the accessible title usable, but that fallback does not count as a completed cover. Verify actual image loading and 16:9 display in the consuming catalog.

Update the cover when the app's result changes materially. Cover creation does not enable user-facing artifact export, alter source defaults, grant optional SVG/video export permission, or trigger a new aggregate delivery/performance run for an existing app.
