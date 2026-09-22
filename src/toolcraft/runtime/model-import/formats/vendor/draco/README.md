# Bundled Draco glTF decoder

These generated decoder assets are the browser-only glTF Draco build distributed
with `three@0.185.1` under `examples/jsm/libs/draco/gltf`:

- `draco_wasm_wrapper.cjs` is the Emscripten WASM wrapper with its unreachable
  Node `fs` and `path` requires removed for a browser-only module worker graph.
- `draco_decoder_gltf.wasm.json` contains the matching WASM binary as a data URL
  so Vite, Webpack, and Turbopack can bundle the module worker identically.

The upstream project is [Google Draco](https://github.com/google/draco). These
generated assets are licensed under the Apache License 2.0; the complete terms
are included in `LICENSE`. The source files are kept local so generated
Toolcraft applications can decode geometry without a CDN or runtime network
dependency.
