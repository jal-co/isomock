# Decision Contract

Use this before writing a schema, spec, or implementation plan. It separates hard runtime rules from product decisions.

## Rule Levels

| Level          | Meaning                    | Required Handling                                 |
| -------------- | -------------------------- | ------------------------------------------------- |
| Invariant      | Cannot be violated         | Follow it; tests should fail if broken            |
| Default        | Normal choice              | Use it unless the spec proves a reason not to     |
| Heuristic      | Product-dependent decision | Decide from product behavior and test the choice  |
| Escape hatch   | Allowed exception          | Explain why and add stronger coverage             |
| Recommendation | Style guidance             | Follow unless product behavior requires otherwise |

## Area Guide

| Area               | Decision Type             | Summary                                                                                                                                       |
| ------------------ | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime shell      | Invariant                 | Use `defineToolcraft({ base, modules })` and `composeToolcraftApp`; the signed host renders `ToolcraftApp`                                    |
| Canvas             | Mixed                     | No app UI in `canvasContent`; handles are product-dependent                                                                                   |
| Panels             | Mixed                     | Panel mechanics are hard; panel presence is product-dependent                                                                                 |
| Layers             | Heuristic, then invariant | Enable only for user-requested layer workflows; fully test when enabled                                                                                  |
| Timeline           | Heuristic, then invariant | Choose from Animation Intent Inventory and transport behavior                                                                                 |
| Controls           | Mixed                     | Bind every visible control, choose one evidence-backed surface per operation, and make artifact UI match required export intent               |
| Renderer           | Default plus invariant    | Choose technique from fidelity/workload and declare spatial view interaction before renderer code                                             |
| Reference analysis | Invariant                 | Register typed motion-reference evidence, classify complete behavior, and prove browser parity before implementation                          |
| Reference clone    | Invariant                 | Preserve reference behavior unless redesign is explicit                                                                                       |
| Acceptance         | Invariant                 | Prove product observables, not only runtime mutation                                                                                          |
| Performance        | Mixed                     | Workload controls need enforced envelope boundaries; derived paths receive central profiles; animated previews yield to viewport interactions |
| Persistence        | Default, then invariant   | State persistence must be explicit; localStorage apps must prove reload restoration                                                           |
| Workflow           | Invariant                 | Follow signed local workflow, use available skills, and run browser verification                                                              |

The runtime shell invariant means product code exports the result of `composeToolcraftApp(appSchema, ports)` and does not edit the signed route. The host renders `ToolcraftApp`; product modules must not author `ToolcraftAppComposition` or hand-compose `ToolcraftRoot`, `CanvasShell`, `ControlsPanel`, `TimelinePanel`, `LayersPanel`, or `ToolbarPanel`. App-specific source also must not render built-in control components directly; schema controls and named composition ports are the allowed extension points.

## Rule Catalog

This catalog mirrors `TOOLCRAFT_DECISION_CONTRACT`. If runtime adds or renames a rule id, this page and `AGENTS.md` must list the same id.

`output-export-required` keeps artifact intent and implementation in exact correspondence. Product-mode readiness records `productReadiness.exportIntent`; schema actions, applicable settings sections, and artifact acceptance expose exactly the enabled image/SVG/video capabilities. SVG is explicit-request-only and means self-contained editable vectors. The authoritative decision sequence and evidence requirements live in `core/setup-export.md`. `interaction-surface-ownership` classifies property edits as global or selected-entity; selected properties name their selection interaction and prove bidirectional isolation with two entities. `layers-enabled-behavior` reuses that proof for `selectedLayer.*`.

`renderer-gpu-provider` makes GPU pass semantics create typed backend pressure, then selects backend/provider separately for each `rendererTechnique.gpu` preview/export surface before implementation. Compute, storage-resource, and feedback passes create WebGPU pressure; new custom WebGPU uses the app-pinned VGPU capability, while exceptions stay closed and evidence-bearing. The canonical decision matrix lives in the [renderer guide](renderer-technique.md).

[//]: # (toolcraft-contract:decision-rule-table:start)
| Rule ID | Level | Area |
| --- | --- | --- |
| `runtime-shell-required` | invariant | runtime-shell |
| `canvas-no-app-ui` | invariant | canvas |
| `canvas-surface-preserved` | invariant | canvas |
| `infinity-canvas-scene-bounds` | invariant | canvas |
| `canvas-handle-placement` | heuristic | canvas |
| `interaction-surface-ownership` | invariant | controls |
| `panel-host-behavior` | invariant | panels |
| `layers-enable-only-when-needed` | heuristic | layers |
| `layers-enabled-behavior` | invariant | layers |
| `timeline-mode-choice` | heuristic | timeline |
| `timeline-enabled-behavior` | invariant | timeline |
| `controls-product-coverage` | invariant | controls |
| `output-export-required` | invariant | controls |
| `controls-section-inventory-required` | invariant | controls |
| `controls-component-layout-invariants` | invariant | controls |
| `controls-layout-heuristics` | heuristic | controls |
| `renderer-technique-inventory` | default | renderer |
| `renderer-gpu-provider` | invariant | renderer |
| `renderer-view-interaction` | invariant | renderer |
| `model-appearance-presentation` | invariant | renderer |
| `reference-clone-source-of-truth` | invariant | reference-clone |
| `video-reference-analysis` | invariant | reference-analysis |
| `acceptance-product-observable` | invariant | acceptance |
| `performance-coverage-levels` | invariant | performance |
| `persistence-policy-explicit` | default | persistence |
| `workflow-required` | invariant | workflow |
[//]: # (toolcraft-contract:decision-rule-table:end)

## Enforcement

Hard rules belong in validators and browser gates, not only prose. Heuristics need decision criteria and tests for the chosen behavior.

| Enforcement                | Use It For                                                |
| -------------------------- | --------------------------------------------------------- |
| Runtime behavior           | Mechanics owned by the shared runtime                     |
| Schema normalization       | Repeated layout and density decisions                     |
| Acceptance validator       | Product behavior and control coverage                     |
| Performance validator      | Workload envelopes, canonical paths, and central profiles |
| Browser helper             | Real UI interaction and visual breakage                   |
| CLI integrity check        | Generated-app source boundaries                           |
| Local docs and `AGENTS.md` | Decision criteria and workflow instructions               |
