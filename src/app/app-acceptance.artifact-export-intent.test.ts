import { exportRequestFixture } from "./app-acceptance.export-request-test-fixtures";
import { describe, expect, it } from "vitest";

import {
  getToolcraftArtifactExportIntentEvidenceErrors,
  resolveToolcraftArtifactExportIntent,
  validateToolcraftArtifactExportIntentCorrespondence,
} from "./acceptance/artifact-export-intent";
import type { ToolcraftArtifactExportIntent } from "./acceptance/types";

const deliveryCases: readonly Readonly<{
  expected: Readonly<{
    imageEnabled: boolean;
    svgEnabled: boolean;
    videoEnabled: boolean;
  }>;
  intent: ToolcraftArtifactExportIntent;
  name: string;
}>[] = [
  {
    expected: { imageEnabled: true, svgEnabled: false, videoEnabled: false },
    intent: {
      image: { mode: "toolcraft-default" },
      svg: { mode: "not-requested" },
      video: { mode: "not-requested" },
    },
    name: "enables default image export without unrequested video export",
  },
  {
    expected: { imageEnabled: true, svgEnabled: false, videoEnabled: false },
    intent: {
      image: {
        evidence: exportRequestFixture("Add PNG image export."),
        mode: "user-requested",
      },
      svg: { mode: "not-requested" },
      video: { mode: "not-requested" },
    },
    name: "enables explicitly requested image export",
  },
  {
    expected: { imageEnabled: false, svgEnabled: false, videoEnabled: false },
    intent: {
      image: {
        evidence: exportRequestFixture("Remove image export."),
        mode: "user-removed",
      },
      svg: { mode: "not-requested" },
      video: { mode: "not-requested" },
    },
    name: "disables explicitly removed image export",
  },
  {
    expected: { imageEnabled: true, svgEnabled: false, videoEnabled: true },
    intent: {
      image: { mode: "toolcraft-default" },
      svg: { mode: "not-requested" },
      video: {
        evidence: exportRequestFixture("Add MP4 video export."),
        mode: "user-requested",
      },
    },
    name: "enables explicitly requested video export",
  },
  {
    expected: { imageEnabled: true, svgEnabled: false, videoEnabled: true },
    intent: {
      image: {
        evidence: exportRequestFixture("Add PNG image export."),
        mode: "user-requested",
      },
      svg: { mode: "not-requested" },
      video: {
        evidence: exportRequestFixture("Add MP4 video export."),
        mode: "user-requested",
      },
    },
    name: "enables explicitly requested image and video export",
  },
  {
    expected: { imageEnabled: false, svgEnabled: false, videoEnabled: true },
    intent: {
      image: {
        evidence: exportRequestFixture("Remove image export."),
        mode: "user-removed",
      },
      svg: { mode: "not-requested" },
      video: {
        evidence: exportRequestFixture("Add MP4 video export."),
        mode: "user-requested",
      },
    },
    name: "keeps requested video export when image export is removed",
  },
  {
    expected: { imageEnabled: false, svgEnabled: true, videoEnabled: false },
    intent: {
      image: {
        evidence: exportRequestFixture("Replace image export with editable SVG export."),
        mode: "user-removed",
      },
      svg: {
        evidence: exportRequestFixture("Add editable SVG export."),
        mode: "user-requested",
      },
      video: { mode: "not-requested" },
    },
    name: "enables requested SVG without retaining default image export",
  },
];

const evidenceCases: readonly Readonly<{
  expected: readonly string[];
  intent: ToolcraftArtifactExportIntent;
  name: string;
}>[] = [
  {
    expected: [],
    intent: {
      image: { mode: "toolcraft-default" },
      svg: { mode: "not-requested" },
      video: { mode: "not-requested" },
    },
    name: "accepts default image and not-requested video modes",
  },
  {
    expected: [],
    intent: {
      image: {
        evidence: exportRequestFixture("Add PNG image export."),
        mode: "user-requested",
      },
      svg: { mode: "not-requested" },
      video: { mode: "not-requested" },
    },
    name: "accepts nonblank requested image evidence",
  },
  {
    expected: [],
    intent: {
      image: {
        evidence: exportRequestFixture("Remove image export."),
        mode: "user-removed",
      },
      svg: { mode: "not-requested" },
      video: { mode: "not-requested" },
    },
    name: "accepts nonblank image removal evidence",
  },
  {
    expected: [],
    intent: {
      image: { mode: "toolcraft-default" },
      svg: { mode: "not-requested" },
      video: {
        evidence: exportRequestFixture("Add MP4 video export."),
        mode: "user-requested",
      },
    },
    name: "accepts nonblank requested video evidence",
  },
  {
    expected: [
      "Image export user-removed intent requires structured user-message evidence with non-empty messageRef, messageText, and quote.",
    ],
    intent: {
      image: { evidence: exportRequestFixture(" \n\t "), mode: "user-removed" },
      svg: { mode: "not-requested" },
      video: { mode: "not-requested" },
    },
    name: "rejects blank image removal evidence",
  },
  {
    expected: [
      "Image export user-requested intent requires structured user-message evidence with non-empty messageRef, messageText, and quote.",
    ],
    intent: {
      image: { evidence: exportRequestFixture("   "), mode: "user-requested" },
      svg: { mode: "not-requested" },
      video: { mode: "not-requested" },
    },
    name: "rejects blank requested image evidence",
  },
  {
    expected: [
      "Video export user-requested intent requires structured user-message evidence with non-empty messageRef, messageText, and quote.",
    ],
    intent: {
      image: { mode: "toolcraft-default" },
      svg: { mode: "not-requested" },
      video: { evidence: exportRequestFixture("\t"), mode: "user-requested" },
    },
    name: "rejects blank requested video evidence",
  },
  {
    expected: [
      "SVG export user-requested intent requires structured user-message evidence with non-empty messageRef, messageText, and quote.",
    ],
    intent: {
      image: { mode: "toolcraft-default" },
      svg: { evidence: exportRequestFixture("\t"), mode: "user-requested" },
      video: { mode: "not-requested" },
    },
    name: "rejects blank requested SVG evidence",
  },
  {
    expected: [
      "Image export user-removed intent requires structured user-message evidence with non-empty messageRef, messageText, and quote.",
      "Video export user-requested intent requires structured user-message evidence with non-empty messageRef, messageText, and quote.",
    ],
    intent: {
      image: { evidence: exportRequestFixture(" "), mode: "user-removed" },
      svg: { mode: "not-requested" },
      video: { evidence: exportRequestFixture("\n"), mode: "user-requested" },
    },
    name: "aggregates blank image and video evidence errors",
  },
];

describe("Toolcraft artifact export intent", () => {
  it.each(deliveryCases)("$name", ({ expected, intent }) => {
    const delivery = resolveToolcraftArtifactExportIntent(intent);

    expect(delivery).toEqual(expected);
    expect(Object.isFrozen(delivery)).toBe(true);
  });

  it.each(evidenceCases)("$name", ({ expected, intent }) => {
    expect(getToolcraftArtifactExportIntentEvidenceErrors(intent)).toEqual(
      expected,
    );
  });

  it("validates enabled and disabled delivery against typed schema facts", () => {
    expect(
      validateToolcraftArtifactExportIntentCorrespondence({
        hasImageExportAction: false,
        hasImageExportSection: false,
        hasSvgExportAction: false,
        hasVideoExportAction: true,
        hasVideoExportSection: true,
        intent: {
          image: { mode: "toolcraft-default" },
          svg: { mode: "not-requested" },
          video: { mode: "not-requested" },
        },
      }),
    ).toEqual({
      delivery: { imageEnabled: true, svgEnabled: false, videoEnabled: false },
      errors: [
        'Image export intent "toolcraft-default" requires an export-image panel action.',
        'Image export intent "toolcraft-default" requires an "Image Export" section.',
        'Video export intent "not-requested" must not have an export-video panel action.',
        'Video export intent "not-requested" must not have a "Video Export" section.',
      ],
    });
  });

  it("aggregates evidence and correspondence errors without prose inference", () => {
    expect(
      validateToolcraftArtifactExportIntentCorrespondence({
        hasImageExportAction: true,
        hasImageExportSection: true,
        hasSvgExportAction: false,
        hasVideoExportAction: false,
        hasVideoExportSection: false,
        intent: {
          image: { evidence: exportRequestFixture("  "), mode: "user-removed" },
          svg: { mode: "not-requested" },
          video: { evidence: exportRequestFixture("\t"), mode: "user-requested" },
        },
      }),
    ).toEqual({
      delivery: { imageEnabled: false, svgEnabled: false, videoEnabled: true },
      errors: [
        "Image export user-removed intent requires structured user-message evidence with non-empty messageRef, messageText, and quote.",
        "Video export user-requested intent requires structured user-message evidence with non-empty messageRef, messageText, and quote.",
        'Image export intent "user-removed" must not have an export-image panel action.',
        'Image export intent "user-removed" must not have an "Image Export" section.',
        'Video export intent "user-requested" requires an export-video panel action.',
        'Video export intent "user-requested" requires a "Video Export" section.',
      ],
    });
  });

  it("requires requested SVG to correspond to one typed action without a settings section", () => {
    expect(
      validateToolcraftArtifactExportIntentCorrespondence({
        hasImageExportAction: false,
        hasImageExportSection: false,
        hasSvgExportAction: false,
        hasVideoExportAction: false,
        hasVideoExportSection: false,
        intent: {
          image: {
            evidence: exportRequestFixture("Only SVG export; remove image export."),
            mode: "user-removed",
          },
          svg: {
            evidence: exportRequestFixture("Add editable SVG export."),
            mode: "user-requested",
          },
          video: { mode: "not-requested" },
        },
      }),
    ).toEqual({
      delivery: { imageEnabled: false, svgEnabled: true, videoEnabled: false },
      errors: [
        'SVG export intent "user-requested" requires an export-svg panel action.',
      ],
    });
  });
});
