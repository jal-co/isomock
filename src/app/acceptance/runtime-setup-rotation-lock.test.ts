import { describe, expect, it } from "vitest";
import {
  defineToolcraft,
  spatialViewModule,
  timelineModule,
  type ResolvedToolcraftAppSchema,
} from "@/toolcraft/runtime";
import {
  getToolcraftRuntimeSetupSectionErrors,
  isRuntimeSetupControlTarget,
} from "./runtime-setup";
import { isToolcraftProductSectionControl } from "./controls";

function schema(gizmo = true, timeline = true) {
  return defineToolcraft({
    base: {
      identity: { id: "rotation-lock-contract", title: "Rotation lock" },
      canvas: { enabled: true },
      panels: {
        controls: {
          title: "Controls",
          sections: gizmo
            ? [
                {
                  id: "view",
                  title: "View",
                  controls: {
                    orientation: {
                      type: "orientationGizmo",
                      target: "view.orbit",
                      label: false,
                      keyframeable: false,
                      applicability: { mode: "always" },
                    },
                  },
                },
              ]
            : [],
        },
      },
    },
    modules: [
      ...(gizmo ? [spatialViewModule()] : []),
      ...(timeline ? [timelineModule({ mode: "playback" })] : []),
    ],
  });
}

type Section = NonNullable<
  ResolvedToolcraftAppSchema["panels"]["controls"]
>["sections"][number];
function editSetup(
  app: ResolvedToolcraftAppSchema,
  edit: (setup: Section) => Section,
): ResolvedToolcraftAppSchema {
  const controls = app.panels.controls!;
  return {
    ...app,
    panels: {
      ...app.panels,
      controls: {
        ...controls,
        sections: controls.sections.map((section) =>
          section.id === "runtime.setup" ? edit(section) : section,
        ),
      },
    },
  };
}

describe("generated app rotation lock contract", () => {
  it.each([
    [true, true],
    [true, false],
    [false, true],
    [false, false],
  ])(
    "accepts the runtime-owned final row: gizmo=%s timeline=%s",
    (gizmo, timeline) => {
      expect(
        getToolcraftRuntimeSetupSectionErrors(schema(gizmo, timeline)),
      ).toEqual([]);
    },
  );

  it("excludes the runtime lock from app-authored product controls", () => {
    const lock =
      schema().panels.controls!.sections[1]!.controls.rotationLocked!;
    expect(isRuntimeSetupControlTarget(lock.target)).toBe(true);
    expect(isToolcraftProductSectionControl(lock)).toBe(false);
  });

  it("rejects a missing lock, reversed row and lost inline grouping", () => {
    const app = schema();
    const withoutLock = editSetup(app, (setup) => ({
      ...setup,
      controls: Object.fromEntries(
        Object.entries(setup.controls).filter(
          ([id]) => id !== "rotationLocked",
        ),
      ),
    }));
    expect(
      getToolcraftRuntimeSetupSectionErrors(withoutLock).join("\n"),
    ).toContain("must include Lock rotation");
    const reversed = editSetup(app, (setup) => {
      const { timelineExtended, rotationLocked, ...rest } = setup.controls;
      return {
        ...setup,
        controls: {
          ...rest,
          rotationLocked: rotationLocked!,
          timelineExtended: timelineExtended!,
        },
      };
    });
    expect(
      getToolcraftRuntimeSetupSectionErrors(reversed).join("\n"),
    ).toContain("in that order in its final row");
    expect(
      getToolcraftRuntimeSetupSectionErrors(
        editSetup(app, (setup) => ({ ...setup, layoutGroups: [] })),
      ).join("\n"),
    ).toContain("two-column inline");
  });

  it("rejects an irrelevant lock in a 2D app", () => {
    const lock =
      schema().panels.controls!.sections[1]!.controls.rotationLocked!;
    const invalid = editSetup(schema(false), (setup) => ({
      ...setup,
      controls: { ...setup.controls, rotationLocked: lock },
    }));
    expect(getToolcraftRuntimeSetupSectionErrors(invalid).join("\n")).toContain(
      "exactly when the app declares an orientationGizmo",
    );
  });
});
