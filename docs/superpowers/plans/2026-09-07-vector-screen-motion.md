# Vector Screen Motion Implementation Plan

> **For agentic workers:** Use inline execution with the signed local Toolcraft workflow; `superpowers:executing-plans` is unavailable in this environment. The user has authorized implementation. No additional approval or full audit is required.

**Goal:** Reject mirrored spatial-pad output in newly generated apps without changing the correct built-in pad or existing apps.

**Architecture:** Derive a mandatory `vector-screen-motion` browser requirement from the resolved schema, not authored acceptance prose. A protected helper drags every visible spatial pad under the exact control target and measures a stable, isolated product marker in screenshot pixels in four directions. Keep color-balance semantics separate; do not globally negate canonical vector values.

**Tech Stack:** TypeScript, existing Toolcraft schema and proof session, Playwright screenshots, browser PNG decoding, Vitest.

## Design and scope

- Only `starter/` is editable. No runtime/UI, generated app, example, dependency, renderer, or website changes.
- `vector` with omitted/default variant and `chromaOffset` is spatial. White balance, color balance, and tone bias are semantic color axes. Cartesian mode changes numeric Y convention, not the required visual gesture direction for a spatial pad.
- Inspect `itemControl` and `itemControls` as well as the top-level control. One target-level proof checks every visible spatial pad in that owner; an empty fixture cannot pass. Collection fixtures must expose all distinct spatial fields.
- Use a paused deterministic scene, fixed camera/viewport, and a distinguishable existing product/source marker. No fake test-only artwork in production. Marker pixels must move on screen while pointer is held, persist after release, and retain size. A source texture offset is an inverse sampling transform: a desired positive displacement generally requires subtracting the offset from sampling coordinates, with the renderer's basis conversion applied once.
- Do not accept text-input edits, runtime values, data attributes, generic image hashes, arbitrary point callbacks, or changing the pad variant as substitutes for spatial proof.
- This is a bounded regression guard, not a universal scene-understanding system: the agent chooses a genuine recognizable marker and representative stable view. Color-axis semantics remain covered by both compound parts.

## Task 1: Schema-derived mandatory proof

Files: create `starter/src/app/acceptance/vector-screen-motion.ts` and `.test.ts`; edit `starter/e2e/browser-runtime-evidence-requirements.ts`, `starter/src/app/test-evidence/browser-runtime-contract.ts`; create `starter/e2e/app-browser-vector-requirements.spec.ts`.

- [x] Test default, explicit default, Cartesian, chroma offset, semantic variants, non-vector controls, and both nested templates.

```ts
expect(requiresToolcraftVectorScreenMotion({ type: "vector" })).toBe(true);
expect(requiresToolcraftVectorScreenMotion({ type: "vector", variant: "whiteBalance" })).toBe(false);
expect(requiresToolcraftVectorScreenMotion({ type: "collectionActions", itemControl: { type: "vector" } })).toBe(true);
```

- [x] Run `pnpm --filter toolcraft-starter exec vitest run src/app/acceptance/vector-screen-motion.test.ts`; observe failure before implementation.
- [x] Add the classifier; derive the specialized requirement independently of `controlPartCoverage`.

```ts
if (control && requiresToolcraftVectorScreenMotion(control)) {
  evidenceTypes.push("vector-screen-motion");
}
```

- [x] Verify generic compound/output evidence cannot satisfy the new requirement and semantic pads do not acquire it.

## Task 2: Protected four-direction pixel proof

Files: create `starter/e2e/browser-vector-screen-motion.ts`, `starter/e2e/browser-vector-marker.ts`, `starter/e2e/app-browser-vector-screen-motion.spec.ts`, and its framework fixture helper. Extend `starter/e2e/browser-control-target-helpers.ts` with exact owner lookup while preserving existing field lookup.

- [x] Add positive and negative browser fixtures: correct DOM and canvas output, mirrored X, mirrored Y, swapped axes, no motion, delayed-until-release motion, moving viewport, missing marker, wrong target, and nested second-pad inversion. Failures must attach no evidence.
- [x] Implement `expectToolcraftVectorScreenMotion({ proofSession, requirementId, target, markers: [{ selector, rgb }] })`. The helper owns mouse events and screenshot decoding; product callers supply no action or coordinate reader.
- [x] For each visible spatial pad, start at its center and drag right/left/down/up by 15% of its dimensions. Assert at least two pixels of signed displacement, bounded perpendicular drift, stable marker area, stable viewport/surface rectangle, and stable live/released positions. Use fixed tolerances and bounded settling samples. Always release the pointer in `finally`.
- [x] Attach `vector-screen-motion` and the already-proven generic product-output/axis evidence only after every pad and direction passes.
- [x] Run `pnpm --filter toolcraft-starter exec playwright test e2e/app-browser-vector-requirements.spec.ts e2e/app-browser-vector-screen-motion.spec.ts --workers=1`.

## Task 3: Authoring guidance and compatibility

Files: update `starter/AGENTS.md`, `starter/docs/toolcraft/core/control-selection.md`, `starter/docs/toolcraft/component-rules.md`, `starter/docs/toolcraft/acceptance-testing.md`; keep this plan's execution record current.

- [x] Document screen gesture invariants, inverse texture sampling, world/UV basis conversion, semantic color exceptions, nested fixture requirements, and the public helper example.
- [x] Run focused existing target-owner and runtime-requirement tests; run starter typecheck because the helper and evidence union are shared framework interfaces.
- [x] Run `pnpm starter:docs-check` and focused source-ownership/integrity tests to confirm new protected files are included in generated copies. No full build, delivery, performance suite, dependency install, commit, or push in this task.

## Execution record

Preflight: systematic debugging completed; brainstorming and writing-plans read. Control-selection/layout Plan, schema/component Implementation, and acceptance Verification route documents read. Repository was clean. Inline execution uses local workflow fallback. No product app will be modified.

Completed in `starter/` only. The neutral starter composition, runtime/UI packages, and generated apps remain untouched. Documentation detail lives in `docs/toolcraft/vector-controls.md` to preserve required-reading budgets. Named semantic color variants and actual Width/Height size inputs are excluded from spatial proof; `coordinateMode` is not an escape hatch.

Verification:

- Classifier: 7 Vitest tests passed after the initial missing-module red test.
- Browser: 35 distinct focused tests passed across the vector, runtime requirement, applicability, and proof-session specs. The final changed browser batch (14 vector plus 2 applicability tests) passed in 55.5 seconds; the final 3 requirement tests passed in 1.6 seconds. This is functional testing, not measured performance.
- A real WebGL shader with inverse-sampling sign `+` is rejected; its `-` mapping passes, alongside DOM, Canvas2D, and Cartesian-number fixtures using the actual built-in pad. Assertions on expected failure messages prevent unrelated fixture failures from masquerading as inversion detection.
- Existing applicability meta-test fixtures lacked current `finiteSelectors`; fixed that fixture and its literal types. Tightened the edited requirement module to its actual resolved-schema input and corrected its pre-existing type import/optional-kind declarations. Product applicability behavior was not changed.
- A first-frame empty screenshot exposed a settling edge in the new helper; both initial samples now run inside the bounded settling retry. Final positive and negative cases passed without widening direction/marker tolerances.
- 19 source ownership/evidence-boundary tests passed; the new helpers and docs are included in the protected generated inventory.
- `pnpm starter:typecheck`, a direct TypeScript check of the edited e2e helpers/specs and their imports, `pnpm starter:docs-check`, and `git diff --check` passed.

Limitations: the guard checks an agent-selected genuine marker in a representative stable view, not every conceivable scene/camera/input. Semantic color pads retain their existing outcome recipe. Existing exported applications only acquire the new guard through the normal starter regeneration/update process; none were patched here.
