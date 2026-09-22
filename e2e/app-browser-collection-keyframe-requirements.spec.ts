import { expect, test } from "@playwright/test";
import { defineToolcraft, timelineModule } from "@/toolcraft/runtime";

import { deriveToolcraftBrowserRuntimeRequirements } from "./browser-runtime-evidence-requirements";

test("collection keyframe coverage derives one protected browser requirement per field", () => {
  const schema = defineToolcraft({
    base: {
      canvas: { enabled: true },
      identity: { id: "collection-browser", title: "Collection browser" },
      panels: {
        controls: {
          sections: [
            {
              controls: {
                notes: {
                  applicability: { mode: "always" },
                  defaultValue: [],
                  itemControls: {
                    opacity: {
                      defaultValue: 60,
                      keyframeable: true,
                      type: "slider",
                    },
                    position: {
                      defaultValue: { x: 0, y: 0 },
                      keyframeable: true,
                      type: "vector",
                    },
                  },
                  target: "storyboard.notes",
                  type: "collectionActions",
                },
              },
              id: "notes",
            },
          ],
          title: "Controls",
        },
      },
    },
    modules: [timelineModule({ mode: "keyframes" })],
  });
  const acceptance = {
    automated: true,
    automatedTestName: "collection fields keyframe",
    browser: {
      budget: "standard",
      file: "e2e/app-controls.spec.ts",
      testName: "browser: collection fields keyframe",
    } as const,
    collectionItemKeyframeCoverage: ["position", "opacity"],
    componentType: "collectionActions",
    evidence: "product-output" as const,
    expectedObservable: "Each opted field changes evaluated item output.",
    fixture: "two notes",
    id: "storyboard.notes",
    kind: "control" as const,
    target: "storyboard.notes",
    userAction: "Keyframe each opted collection field.",
  };
  const requirements = deriveToolcraftBrowserRuntimeRequirements(
    [acceptance],
    schema,
  );

  expect(
    requirements.filter(
      (requirement) =>
        requirement.evidenceType === "timeline-keyframes" &&
        requirement.requirementId.includes(":"),
    ),
  ).toEqual([
    expect.objectContaining({ requirementId: "storyboard.notes:position" }),
    expect.objectContaining({ requirementId: "storyboard.notes:opacity" }),
  ]);

  expect(
    deriveToolcraftBrowserRuntimeRequirements(
      [
        {
          ...acceptance,
          collectionItemKeyframeCoverage: ["position", "opacity", "extra"],
        },
      ],
      schema,
    ).filter((requirement) => requirement.requirementId.includes(":")),
  ).toEqual([]);
});
