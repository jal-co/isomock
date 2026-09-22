import {
  canvasEditingModule,
  imageExportModule,
  layersModule,
  masksModule,
  mediaSourceModule,
  model3dModule,
  spatialViewModule,
  svgExportModule,
  timelineModule,
  videoExportModule,
  type ToolcraftProductModuleDefinition,
  type ToolcraftProductModuleId,
} from "@/toolcraft/runtime";
import { describe, expect, it } from "vitest";

import { TOOLCRAFT_ARTIFACT_CAPABILITY_PROOFS_BY_ROLE } from "../export-artifact-coverage";
import { TOOLCRAFT_CAPABILITY_PROOF_CATALOG } from "./catalog";
import { createResolvedProductModulePlanFixture } from "./test-plan-fixtures";
import { createStrayCapabilityProofAcceptance } from "./test-proof-fixtures";
import { createCapabilityProofValidationContextFixture } from "./test-validation-fixtures";
import { validateToolcraftCapabilityProofs } from "./validate-capability-proofs";

const expectedRecipes = {
  "artifact.image-export": {
    ownerId: "artifact-export",
    proof: {
      coverage: "all-required-image-export-behavior",
      kind: "artifact-export",
      role: "export-image",
    },
  },
  "artifact.svg-export": {
    ownerId: "artifact-export",
    proof: {
      coverage: "all-required-svg-export-behavior",
      kind: "artifact-export",
      role: "export-svg",
    },
  },
  "artifact.video-export": {
    ownerId: "artifact-export",
    proof: {
      coverage: "all-required-video-export-behavior",
      kind: "artifact-export",
      role: "export-video",
    },
  },
  "canvas.editing": {
    ownerId: "canvas-editing",
    proof: { kind: "canvas-editing" },
  },
  "foreground.soft-ellipses": { ownerId: "masks", proof: { kind: "masks" } },
  "layers.management": { ownerId: "layers", proof: { kind: "layers" } },
  "media.source": {
    ownerId: "media-source",
    proof: { kind: "media-source", persistenceSlice: "media" },
  },
  "model.3d": { ownerId: "model-3d", proof: { kind: "model-3d" } },
  "spatial.view": {
    ownerId: "spatial-view",
    proof: { kind: "spatial-view" },
  },
  "timeline.keyframes": {
    ownerId: "timeline",
    proof: { kind: "timeline", mode: "keyframes" },
  },
  "timeline.playback": {
    ownerId: "timeline",
    proof: { kind: "timeline", mode: "playback" },
  },
} as const;

// Read capabilities from the executable runtime definitions, independently of
// both the proof catalog and its expected descriptors. The record also makes a
// newly added runtime module a compile error until this oracle includes it.
const runtimeModules = {
  "canvas-editing": canvasEditingModule(),
  "image-export": imageExportModule(),
  layers: layersModule(),
  masks: masksModule(),
  "media-source": mediaSourceModule(),
  "model-3d": model3dModule(),
  "spatial-view": spatialViewModule(),
  "svg-export": svgExportModule(),
  timeline: timelineModule({ mode: "keyframes" }),
  "video-export": videoExportModule(),
} satisfies Record<ToolcraftProductModuleId, ToolcraftProductModuleDefinition>;
const allCapabilities = [...new Set(
  Object.values(runtimeModules).flatMap((module) => module.provides),
)].sort();

describe("Toolcraft capability proof catalog", () => {
  it("is an exhaustive frozen data-only map to executable owner descriptors", () => {
    expect(Object.keys(TOOLCRAFT_CAPABILITY_PROOF_CATALOG)).toEqual(
      [...allCapabilities].sort(),
    );

    for (const capabilityId of allCapabilities) {
      const recipe = TOOLCRAFT_CAPABILITY_PROOF_CATALOG[capabilityId];
      expect(recipe).toEqual({
        capabilityId,
        ...expectedRecipes[capabilityId],
      });
      expect(Object.isFrozen(recipe)).toBe(true);
      expect(Object.isFrozen(recipe.proof)).toBe(true);
      expect(
        Object.values(recipe).some((value) => typeof value === "function"),
      ).toBe(false);
      expect(JSON.stringify(recipe)).not.toMatch(/browserTestName|acceptance row/iu);
    }
    expect(Object.isFrozen(TOOLCRAFT_CAPABILITY_PROOF_CATALOG)).toBe(true);
  });

  it("shares one frozen artifact descriptor authority with every export recipe", () => {
    expect(
      Object.isFrozen(TOOLCRAFT_ARTIFACT_CAPABILITY_PROOFS_BY_ROLE),
    ).toBe(true);

    for (const descriptor of Object.values(
      TOOLCRAFT_ARTIFACT_CAPABILITY_PROOFS_BY_ROLE,
    )) {
      const recipe =
        TOOLCRAFT_CAPABILITY_PROOF_CATALOG[descriptor.capabilityId];
      expect(recipe.proof).toBe(descriptor.proof);
      expect(Object.isFrozen(descriptor)).toBe(true);
      expect(Object.isFrozen(descriptor.proof)).toBe(true);
    }
  });

  it("builds recursively frozen typed plans without resolver imports", () => {
    const plan = createResolvedProductModulePlanFixture([
      "artifact.video-export",
      "timeline.playback",
    ]);

    expect(plan.capabilities.map(({ capabilityId }) => capabilityId)).toEqual([
      "artifact.video-export",
      "timeline.playback",
    ]);
    expect(plan.modules.map(({ id }) => id)).toEqual(["timeline", "video-export"]);
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.capabilities)).toBe(true);
    expect(Object.isFrozen(plan.capabilities[0])).toBe(true);
    expect(Object.isFrozen(plan.modules)).toBe(true);
    expect(Object.isFrozen(plan.modules[0]?.provides)).toBe(true);
  });

  it("requires the same recipes for explicit and default-provided capabilities", () => {
    const context = createCapabilityProofValidationContextFixture();
    const explicit = validateToolcraftCapabilityProofs({
      context,
      plan: createResolvedProductModulePlanFixture([
        "media.source",
        "timeline.playback",
      ]),
    });
    const provided = validateToolcraftCapabilityProofs({
      context,
      plan: createResolvedProductModulePlanFixture(
        ["media.source", "timeline.playback"],
        {
          "media.source": "default-provider",
          "timeline.playback": "default-provider",
        },
      ),
    });

    expect(provided).toEqual(explicit);
    expect(provided.join("\n")).toContain("media.source");
    expect(provided.join("\n")).toContain('timelineCoverage "playback"');
  });

  it("is order-invariant, sorted, frozen, and leaves every input unchanged", () => {
    const forwardPlan = createResolvedProductModulePlanFixture(allCapabilities);
    const reversePlan = createResolvedProductModulePlanFixture(
      [...allCapabilities].reverse(),
    );
    const context = createCapabilityProofValidationContextFixture();
    const contextSnapshot = JSON.stringify(context);
    const planSnapshot = JSON.stringify(forwardPlan);

    const forward = validateToolcraftCapabilityProofs({
      context,
      plan: forwardPlan,
    });
    const reverse = validateToolcraftCapabilityProofs({
      context,
      plan: reversePlan,
    });

    expect(forward).toEqual(reverse);
    expect(forward).toEqual([...forward].sort());
    expect(Object.isFrozen(forward)).toBe(true);
    expect(JSON.stringify(forwardPlan)).toBe(planSnapshot);
    expect(JSON.stringify(context)).toBe(contextSnapshot);
  });

  it.each(allCapabilities)(
    "rejects %s-specific proof claims when the capability is absent",
    (capabilityId) => {
      const context = createCapabilityProofValidationContextFixture([
        createStrayCapabilityProofAcceptance(capabilityId),
      ]);
      const diagnostics = validateToolcraftCapabilityProofs({
        context,
        plan: createResolvedProductModulePlanFixture([]),
      });

      expect(diagnostics).toContain(
        capabilityId === "layers.management"
          ? `stray.${capabilityId} declares layerCoverage "selection" but panels.layers is not enabled.`
          : `Acceptance "stray.${capabilityId}" claims ${capabilityId} proof but that capability is absent.`,
      );
    },
  );
});
