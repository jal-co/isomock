import { describe, expect, it } from "vitest";

import { getToolcraftExportArtifactProofErrors } from "../export-artifact-coverage";
import { contractSchemaFixture } from "../../app-acceptance.contract-fixtures";
import {
  keyframesTimelineAcceptance,
  playbackTimelineAcceptance,
} from "../../app-acceptance.timeline-test-utils";
import { createResolvedProductModulePlanFixture } from "./test-plan-fixtures";
import {
  createArtifactAcceptance,
  createExportSchema,
  createLayerAcceptance,
} from "./test-proof-fixtures";
import { createCapabilityProofValidationContextFixture } from "./test-validation-fixtures";
import { validateToolcraftCapabilityProofs } from "./validate-capability-proofs";

describe("Toolcraft artifact, timeline, and layers proof owners", () => {
  it.each([
    ["artifact.image-export", "image", "export-image"],
    ["artifact.svg-export", "svg", "export-svg"],
    ["artifact.video-export", "video", "export-video"],
  ] as const)(
    "accepts exact %s bytes and typed-action proof",
    (capabilityId, kind, role) => {
      const acceptance = [createArtifactAcceptance(kind)];
      const context = createCapabilityProofValidationContextFixture(
        acceptance,
        {
          schema: createExportSchema(role),
        },
      );

      expect(
        validateToolcraftCapabilityProofs({
          context,
          plan: createResolvedProductModulePlanFixture([capabilityId]),
        }),
      ).toEqual([]);
    },
  );

  it("requires typed action and exported-bytes proof for an active artifact", () => {
    const diagnostics = validateToolcraftCapabilityProofs({
      context: createCapabilityProofValidationContextFixture(),
      plan: createResolvedProductModulePlanFixture(["artifact.image-export"]),
    });

    expect(diagnostics).toEqual([
      "artifact.image-export requires a typed export-image action.",
      "artifact.image-export requires exported-bytes acceptance with automated and browser proof.",
    ]);
  });

  it("rejects a typed artifact action when its capability is absent", () => {
    expect(
      validateToolcraftCapabilityProofs({
        context: createCapabilityProofValidationContextFixture([], {
          schema: createExportSchema("export-image"),
        }),
        plan: createResolvedProductModulePlanFixture([]),
      }),
    ).toEqual([
      'Typed export-image action "export.png" on "actions.output" claims artifact.image-export but that capability is absent.',
    ]);
  });

  it("fails closed when capability artifact proof inventory is incomplete", () => {
    const schema = createExportSchema("export-image");
    expect(() =>
      getToolcraftExportArtifactProofErrors({
        acceptance: [],
        capabilityIds: ["artifact.image-export"],
        capabilityProofs: [],
        schema,
      }),
    ).toThrow("exactly one canonical proof for every artifact role");
    expect(() =>
      getToolcraftExportArtifactProofErrors({
        acceptance: [],
        capabilityIds: ["artifact.image-export"],
        capabilityProofs: [
          {
            capabilityId: "artifact.image-export",
            proof: {
              coverage: "all-required-image-export-behavior",
              kind: "artifact-export",
              role: "export-image",
            },
          },
          {
            capabilityId: "artifact.svg-export",
            proof: {
              coverage: "all-required-svg-export-behavior",
              kind: "artifact-export",
              role: "export-svg",
            },
          },
          {
            capabilityId: "model.3d",
            proof: {
              coverage: "all-required-video-export-behavior",
              kind: "artifact-export",
              role: "export-video",
            },
          },
        ],
        schema,
      }),
    ).toThrow("exactly one canonical proof for every artifact role");
    if (false) {
      // @ts-expect-error Capability mode requires its exact proof inventory.
      getToolcraftExportArtifactProofErrors({
        acceptance: [],
        capabilityIds: ["artifact.image-export"],
        schema,
      });
      // @ts-expect-error Artifact proof validation requires exact capability facts.
      getToolcraftExportArtifactProofErrors({
        acceptance: [],
        schema,
      });
    }
  });

  it("accepts the complete playback and keyframe recipes", () => {
    const schema = {
      ...contractSchemaFixture,
      panels: {
        ...contractSchemaFixture.panels,
        timeline: {
          defaultDurationSeconds: 8,
          enabled: true,
          mode: "keyframes" as const,
        },
      },
    };
    const context = createCapabilityProofValidationContextFixture(
      [playbackTimelineAcceptance, keyframesTimelineAcceptance],
      { schema },
    );

    expect(
      validateToolcraftCapabilityProofs({
        context,
        plan: createResolvedProductModulePlanFixture([
          "timeline.keyframes",
          "timeline.playback",
        ]),
      }),
    ).toEqual([]);
  });

  it("accepts selection, visibility, reorder, and grouping layer proof", () => {
    const acceptance = (
      ["selection", "visibility", "reorder", "grouping"] as const
    ).map(createLayerAcceptance);
    const context = createCapabilityProofValidationContextFixture(acceptance, {
      schema: {
        ...contractSchemaFixture,
        panels: { ...contractSchemaFixture.panels, layers: true },
      },
    });

    expect(
      validateToolcraftCapabilityProofs({
        context,
        plan: createResolvedProductModulePlanFixture(["layers.management"]),
      }),
    ).toEqual([]);
  });
});
