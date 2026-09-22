# Module Authoring

> Reading route: start with `workflow.md`. Core generated-app rules live in `core/*`; this is the framework module-authoring reference.

Toolcraft uses static trusted modules inside a modular monolith. Products select the public factories through `defineToolcraft({ base, modules })`, then connect product ports with `composeToolcraftApp`. Add or change framework modules in the source monorepo and regenerate affected standalone applications. Do not patch copied `src/toolcraft` in a generated product.

## One owner, applicable mechanisms

A module owns a reusable capability, its options, declarations, applicable execution adapters and outcome evidence. A product section on existing controls and values usually remains product composition. A module does not need an empty reducer, provider or resource manager for mechanisms it does not use.

| Part | Framework mechanism | Owner responsibility |
| --- | --- | --- |
| Definition | Opaque, isolated, immutable declaration; internal contract v2 | Public factory, checked options, capabilities, dependencies and explicit default providers |
| Settings | Common schema controls, data snapshot, ordering and target ownership | Named fields, defaults, semantic checks and placement |
| Panel | `configuration` payload, surface ordering and existing PanelHost | Surface policy, actual React adapter and applicable commands |
| Commands | Exhaustive typed handler map, one dispatch and history transition | Command handler and its state changes |
| Persistence | Included slices, envelope and exclusive field ownership | Decoder and writer for its payload |
| Source | Registry, admission, staging, atomic commit, cancellation and repository | Match/plan/prepare; typed payload and applicable restore/repair services |
| Artifact | Shared export job, snapshot, leases and settlement | Action handler and format-specific policy |
| Scene | Canvas/viewport hosts and declared product ports | Product interaction policy or an actual runtime interaction adapter |
| Renderer | Existing registered renderer pipeline and cache/resource contracts | Typed passes and output behavior |

Default resolution rejects multiple defaults for an unsatisfied capability, duplicate selected provider IDs, and different opaque definitions competing for one module ID. Several requesters can share a default when they reference the same opaque definition.

Declarations contain plain data. Functions, React elements, workers, repository instances, accessors, symbols and cyclic data do not belong in schema or module plans. Executable adapters are connected at composition boundaries and never serialized into workspace state.

## Source layout and boundaries

In the monorepo, start at `packages/toolcraft-runtime/src/modules/built-ins/<id>/`. Keep the public `<id>-module.ts` factory, `declaration.ts` codec, applicable `product-policy.ts`, `core/` mechanisms and `react/` adapters together. Supporting code can remain in canonical shared document mechanisms when several capabilities need it.

- `modules/contract/` contains the common definition, data, command, persistence, surface and binding protocols. Closed product capability/contribution types describe the supported public catalog; extending that typed catalog is deliberate registration work.
- `modules/resolution/` receives catalogs explicitly. Dependency resolution does not import factories. Contribution phases do not import the executable catalog.
- `composition/` selects declaration codecs and connects core owners. `public-state.ts` preserves state/reducer entry points and injects the transition into the store; `public-persistence.ts` connects the envelope and owner codecs. Neither store nor its durable transition imports these facades.
- `react/composition/` connects panel adapters. Owners use existing Toolcraft/UI hosts and canonical control implementations.
- `modules/built-ins/<id>/react/` is explicitly a React layer. Other new production directories default to core. An owner can import another owner's `contracts.ts`, never its private implementation, including through type-only imports.
- `testing/` under a module is test support. Production cannot import it, and the CLI excludes it from generated applications. Protected capability proof remains in starter acceptance/testing rather than production runtime.

The source export still copies the complete runtime. Module absence does not promise code pruning, tree shaking or dynamic plugin loading.

## Existing owners

| Module | Declaration and execution responsibility |
| --- | --- |
| `image-export` | Image settings codec and image artifact action; shared export job and raster scene composition |
| `svg-export` | SVG action and required vector renderer; editable vector artifact semantics |
| `video-export` | Video settings/action; requires `timeline.playback` with the explicit playback default provider |
| `timeline` | Playback/keyframe options, panel configuration, React surface, command maps and timeline persistence codec |
| `layers` | Layers surface, management commands and layer persistence codec |
| `media-source` | Source policy, file/image registrations and media persistence; shared asset/document operations stay available |
| `model-3d` | Model source handler, worker, hydration and repair binding; requires `media.source`; custom presentation still requires its explicit port |
| `canvas-editing` | Product direct-edit interaction policy and the required `scene.canvasContent` port |
| `spatial-view` | Spatial product policy and the actual lazy orientation-gizmo layer; existing orbit hooks and schema targets remain canonical |

Canvas-editing operations describe product-port responsibilities; listing `drag` does not install an invisible runtime drag handler for arbitrary product content. Spatial-view supplies a real runtime handle adapter. Document the difference between a validation policy and executed behavior when declaring the next owner.

Layers management is separate from shared scene entities. Media imports still create scene entities without a Layers panel. Command payload unions live in the Layers/Timeline owner `contracts.ts`; the central public `ToolcraftCommand` union composes them. The public command-ID inventory remains explicit and is checked for exhaustive type coverage. Shared animation data also remains available to compound controls and evaluation. A collection-field keyframe edit uses a pure shared timeline-data operation and commits values plus timeline in one history transaction.

Model workers and model-specific source lifecycle are constructed only when `model.3d` is resolved. The generic source runtime exposes its core coordinator separately from extension services, so an extension cannot overwrite core cancellation or disposal. Disposal publishes one stable promise and closes import admission before cancellation callbacks can re-enter the coordinator. Cancellation and disposal hooks may return `void` or `Promise<void>`; the coordinator awaits their completion and settlement before closing shared repository state, and aggregates synchronous and asynchronous cleanup errors.

## Adding a module

1. Define the user capability and classify it as product composition, a standard module using existing mechanisms, or an extension of a framework mechanism. Record applicable state, resource and proof ownership.
2. Create its factory and declaration codec. Keep option normalization and named payload fields at the owner. Return the original opaque definition; do not spread, forge or cache copied definitions.
3. Add the public module/capability/contribution types and factory export to the trusted catalog. Register declaration codecs in `composition/module-declaration-catalog.ts`. Update the default-provider catalog only when an actual dependency has an explicitly selected default.
4. Choose existing mechanisms. New settings use `normalizeToolcraftSettingsContribution` and the common ordering/materialization path. Panel contributions use `{ id, moduleId, kind: "panel-surface", surface, configuration }`; the surface materializer does not switch on module names.
5. Connect only applicable core and React adapters. Artifact actions go through the artifact-action catalog, whose mapped type preserves each declared role/owner pair; panel adapters through React composition; source adapters through source composition. Add typed command-handler maps and persistence codecs when those mechanisms are needed. Check command keys and persisted fields for ownership conflicts before merging maps.
6. Extend the public typed state/schema composition when introducing a new document field or surface. The product API deliberately remains closed. A new source asset kind, control codec, schema surface or renderer technique may require a framework contract extension; do not disguise it as an unvalidated JSON dictionary or a module-specific branch in a generic coordinator.
7. Register protected capability proof in the starter proof catalog and implement observable results, including absence and applicable reload/resource behavior. Keep optional SVG/video request authority and export evidence unchanged.
8. Run the directly relevant owner tests, typecheck for public contract changes, AST boundary checks for dependency changes, and focused browser cases for affected wiring. Update this guide when the recipe changes. Regenerate a temporary standalone fixture to verify copying, exclusions and rewritten imports.

Factory definitions, catalogs and resolver use the same internal declaration version. V2 panel metadata uses `configuration`; this does not change persisted workspace v2 or settings-transfer format. Mixed declaration versions and definitions from another runtime instance are rejected.

## Extension proof fixtures

`modules/testing/extensibility/` contains three unrelated examples that exercise the same mechanisms used by production owners:

- `settings-module.ts`: a grid section with arbitrary `spacing` and `color` fields, canonical slider/color controls, its own option validation, immutable data, and ordering before Image Export.
- `notes-module.tsx`: a new panel configuration rendered in the existing PanelHost, a typed `notes.replace` command, and a payload codec. Tests verify the command result, reload decoding, field collisions and module absence.
- `palette-source.ts`: a checked palette payload transported in the supported file envelope. The resolved module binding selects its handler. Tests use the actual source runtime and repository to prove atomic import, typed restore, module absence, cancellation and disposal. It does not introduce a new production asset kind or a shipped palette-import feature.

These are mechanism tests with a test catalog, not product registrations or a second runtime. Their extra command/state types stay out of the public built-in union. A production owner must additionally register its public types, composition entry and protected proof.

## Review checklist

A module is ready when its declaration, actual consumers and protected proof agree. Reject an orphan declaration, missing adapter, duplicate state/command owner, copied reducer, cleanup that races settlement, or an implicit optional-export dependency.

Ask whether a helper removes a special case or merely forwards a call. Keep shared scene operations in the document core; keep capability policy at its owner. Preserve public factory signatures and durable formats unless the requested behavior requires a versioned migration.

Architecture refactoring alone does not authorize measured performance or a complete delivery audit. Follow the focused verification and lifecycle rules in `workflow.md`.
