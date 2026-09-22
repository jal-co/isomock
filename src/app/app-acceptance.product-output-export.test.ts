import { describe, expect, it } from "vitest";

import { resolveToolcraftArtifactExportIntent } from "./acceptance/artifact-export-intent";
import { appProductReadiness } from "./app-acceptance";
import {
  textLooksLikePngExport,
  textLooksLikeSvgExport,
  textLooksLikeVideoExport,
} from "./app-acceptance.export-test-utils";
import {
  getControlOptionValues,
  getSchemaBackgroundControlTargets,
  getSchemaImageExportSection,
  getSchemaPanelActionSearchTexts,
  getSchemaVideoExportSection,
  getSectionControlByTarget,
  getSectionControlIdByTarget,
} from "./app-acceptance.schema-test-utils";

describe("Toolcraft output export acceptance contract", () => {
  it("requires product output apps to expose export actions in the sticky footer", () => {
    if (appProductReadiness.mode === "starter") {
      return;
    }

    const delivery = resolveToolcraftArtifactExportIntent(
      appProductReadiness.exportIntent,
    );
    const panelActionTexts = getSchemaPanelActionSearchTexts();
    const backgroundColorTargets = getSchemaBackgroundControlTargets(new Set(["color"]));
    const backgroundToggleTargets = getSchemaBackgroundControlTargets(
      new Set(["checkbox", "select", "segmented", "switch"]),
    );

    if (delivery.imageEnabled || delivery.svgEnabled || delivery.videoEnabled) {
      expect(
        panelActionTexts.length,
        "Product apps with artifact delivery must define panelActions in the controls panel sticky footer.",
      ).toBeGreaterThan(0);
      expect(
        backgroundColorTargets.length,
        "Product apps with artifact delivery must expose a user-facing background color control.",
      ).toBeGreaterThan(0);
      expect(
        backgroundToggleTargets.length,
        'Product apps with artifact delivery must expose export.includeBackground in runtime Setup as a Switch labeled "Background".',
      ).toBeGreaterThan(0);
    }

    const imageExportSection = getSchemaImageExportSection();
    const imageFormatControl = getSectionControlByTarget(
      imageExportSection,
      "export.image.format",
    );
    const imageResolutionControl = getSectionControlByTarget(
      imageExportSection,
      "export.image.resolution",
    );
    const imageFormatOptionValues = getControlOptionValues(imageFormatControl);
    const imageResolutionOptionValues = getControlOptionValues(imageResolutionControl);
    const imageFormatControlId = getSectionControlIdByTarget(
      imageExportSection,
      "export.image.format",
    );
    const imageResolutionControlId = getSectionControlIdByTarget(
      imageExportSection,
      "export.image.resolution",
    );
    const imageExportHasInlinePair =
      imageFormatControlId === undefined || imageResolutionControlId === undefined
        ? false
        : imageExportSection?.layoutGroups?.some(
            (group) =>
              group.layout === "inline" &&
              group.columns === 2 &&
              group.controls.includes(imageFormatControlId) &&
              group.controls.includes(imageResolutionControlId),
          ) === true;

    expect(
      panelActionTexts.some(textLooksLikePngExport),
      "Image export action presence must match resolved product export intent.",
    ).toBe(delivery.imageEnabled);
    expect(
      imageExportSection !== undefined,
      '"Image Export" section presence must match resolved product export intent.',
    ).toBe(delivery.imageEnabled);
    expect(
      panelActionTexts.some(textLooksLikeSvgExport),
      "SVG export action presence must match resolved product export intent.",
    ).toBe(delivery.svgEnabled);

    if (delivery.imageEnabled) {
      expect(
        imageFormatControl,
        'The separate "Image Export" section must include a format control with target "export.image.format".',
      ).toBeDefined();
      expect(
        imageFormatControl?.type,
        "Image Export format must use the same Select/dropdown structure as Video Export.",
      ).toBe("select");
      expect(
        imageFormatOptionValues,
        'Image format options must include "png" and "jpg".',
      ).toEqual(expect.arrayContaining(["png", "jpg"]));
      expect(
        imageFormatControl?.defaultValue,
        'Image format must default to "png".',
      ).toBe("png");
      expect(
        imageResolutionControl,
        'The separate "Image Export" section must include a resolution control with target "export.image.resolution".',
      ).toBeDefined();
      expect(
        imageResolutionControl?.type,
        "Image Export resolution must use the same Select/dropdown structure as Video Export.",
      ).toBe("select");
      expect(
        imageResolutionOptionValues,
        'Image resolution options must include "2k", "4k", and "8k".',
      ).toEqual(expect.arrayContaining(["2k", "4k", "8k"]));
      expect(
        imageResolutionControl?.defaultValue,
        'Image resolution must default to "4k".',
      ).toBe("4k");
      expect(
        imageExportHasInlinePair,
        "Image Export format and resolution must render as a compact inline pair.",
      ).toBe(true);
    }

    const videoExportSection = getSchemaVideoExportSection();
    const videoFormatControl = getSectionControlByTarget(
      videoExportSection,
      "export.video.format",
    );
    const videoResolutionControl = getSectionControlByTarget(
      videoExportSection,
      "export.video.resolution",
    );
    const videoFormatOptionValues = getControlOptionValues(videoFormatControl);
    const videoResolutionOptionValues = getControlOptionValues(videoResolutionControl);
    expect(
      panelActionTexts.some(textLooksLikeVideoExport),
      "Video export action presence must match resolved product export intent.",
    ).toBe(delivery.videoEnabled);
    expect(
      videoExportSection !== undefined,
      '"Video Export" section presence must match resolved product export intent.',
    ).toBe(delivery.videoEnabled);
    const videoFormatControlId = getSectionControlIdByTarget(
      videoExportSection,
      "export.video.format",
    );
    const videoResolutionControlId = getSectionControlIdByTarget(
      videoExportSection,
      "export.video.resolution",
    );
    const videoExportHasInlinePair =
      videoFormatControlId === undefined || videoResolutionControlId === undefined
        ? false
        : videoExportSection?.layoutGroups?.some(
            (group) =>
              group.layout === "inline" &&
              group.controls.includes(videoFormatControlId) &&
              group.controls.includes(videoResolutionControlId),
          ) === true;

    if (delivery.videoEnabled) {
      if (delivery.imageEnabled) {
        expect(
          panelActionTexts.length,
          "Apps with image and video delivery need separate footer actions for Export Video and Export PNG.",
        ).toBeGreaterThanOrEqual(2);
      }
      expect(
        videoFormatControl,
        'The separate "Video Export" section must include a format control with target "export.video.format".',
      ).toBeDefined();
      expect(
        ["select", "segmented"],
        "Video format must be a Select or Segmented control so the user chooses a supported container instead of typing a freeform value.",
      ).toContain(videoFormatControl?.type);
      expect(
        videoFormatOptionValues,
        'Video format options must include safe browser baseline choices: "webm" and "mp4".',
      ).toEqual(expect.arrayContaining(["webm", "mp4"]));
      expect(
        videoResolutionControl,
        'The separate "Video Export" section must include a resolution control with target "export.video.resolution".',
      ).toBeDefined();
      expect(
        ["select"],
        "Video resolution must be a Select control with explicit output-size choices.",
      ).toContain(videoResolutionControl?.type);
      expect(
        videoResolutionOptionValues,
        'Video resolution options must include "current" and "4k".',
      ).toEqual(expect.arrayContaining(["current", "4k"]));
      expect(
        videoResolutionControl?.defaultValue,
        'Video resolution must default to "current".',
      ).toBe("current");
      expect(
        videoFormatControl?.defaultValue,
        'Video format must default to "mp4".',
      ).toBe("mp4");
      expect(
        videoExportHasInlinePair,
        "Video Export format and resolution must render as a compact inline pair unless a documented fit fallback is used.",
      ).toBe(true);
    }
  });
});
