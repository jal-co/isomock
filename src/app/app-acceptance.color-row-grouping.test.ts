import { defineToolcraft } from "@/toolcraft/runtime";
import { describe, expect, it } from "vitest";

import { getToolcraftControlSectionInvariantErrors } from "./acceptance/control-layout";

function makeMixedColorSchema(includeSemanticGroups: boolean) {
  const withSemanticGroup = (
    semanticGroup: string,
  ): { semanticGroup: string } | Record<string, never> =>
    includeSemanticGroups ? { semanticGroup } : {};

  return defineToolcraft({
    base: {
      identity: { id: "contract-fixture", title: "Contract fixture" },
      canvas: { enabled: true },
      panels: {
        controls: {
          sections: [
            {
              controls: {
                trackEnabled: {
                  applicability: { mode: "always" as const },
                  defaultValue: true,
                  label: "Track",
                  target: "track.enabled",
                  type: "switch",
                },
                trackColor: {
                  applicability: { mode: "always" as const },
                  ...withSemanticGroup("track-line"),
                  defaultValue: { hex: "#F1F1F1" },
                  label: "Track color",
                  target: "track.color",
                  type: "color",
                },
                lowerColor: {
                  applicability: { mode: "always" as const },
                  ...withSemanticGroup("track-range"),
                  defaultValue: { hex: "#7A9CBD" },
                  label: "Lower",
                  target: "track.lower",
                  type: "color",
                },
                upperColor: {
                  applicability: { mode: "always" as const },
                  ...withSemanticGroup("track-range"),
                  defaultValue: { hex: "#52AAFF" },
                  label: "Upper",
                  target: "track.upper",
                  type: "color",
                },
              },
              id: "track-appearance",
              title: "Track Appearance",
            },
          ],
          title: "Controls",
        },
      },
    },
    modules: [],
  });
}

function makeColorOnlySchema() {
  return defineToolcraft({
    base: {
      identity: { id: "contract-fixture", title: "Contract fixture" },
      canvas: { enabled: true },
      panels: {
        controls: {
          sections: [
            {
              controls: {
                trackColor: {
                  applicability: { mode: "always" as const },
                  defaultValue: { hex: "#F1F1F1" },
                  label: "Track",
                  target: "track.color",
                  type: "color",
                },
                lowerColor: {
                  applicability: { mode: "always" as const },
                  defaultValue: { hex: "#7A9CBD" },
                  label: "Lower",
                  target: "track.lower",
                  type: "color",
                },
                upperColor: {
                  applicability: { mode: "always" as const },
                  defaultValue: { hex: "#52AAFF" },
                  label: "Upper",
                  target: "track.upper",
                  type: "color",
                },
              },
              id: "track-palette",
              title: "Track Palette",
            },
          ],
          title: "Controls",
        },
      },
    },
    modules: [],
  });
}

describe("starter acceptance semantic color rows", () => {
  it("rejects ambiguous plain colors in a mixed section", () => {
    expect(
      getToolcraftControlSectionInvariantErrors(makeMixedColorSchema(false)),
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "must declare semanticGroup for every plain Color",
        ),
      ]),
    );
  });

  it("accepts explicit color banks in a mixed section", () => {
    expect(
      getToolcraftControlSectionInvariantErrors(makeMixedColorSchema(true)),
    ).toEqual([]);
  });

  it("keeps a color-only section as one implicit bank", () => {
    expect(
      getToolcraftControlSectionInvariantErrors(makeColorOnlySchema()),
    ).toEqual([]);
  });
});
