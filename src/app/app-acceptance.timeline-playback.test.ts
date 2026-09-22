import { exportRequestFixture } from "./app-acceptance.export-request-test-fixtures";
import { describe, expect, it } from "vitest";
import { timelineModule } from "@/toolcraft/runtime";

import type {
  ToolcraftComponentAcceptance,
  ToolcraftProductReadiness,
  ToolcraftTransferMode,
} from "./acceptance/types";
import {
  defineContractSchemaFixture,
  validateContractAcceptance as validateBaseContractAcceptance,
} from "./app-acceptance.contract-fixtures";
import { playbackTimelineAcceptance } from "./app-acceptance.timeline-test-utils";

function createTimelineSchema(mode: "keyframes" | "playback" = "playback") {
  return defineContractSchemaFixture({
    base: {
      canvas: { enabled: true },
      identity: { id: "timeline-fixture", title: "Timeline fixture" },
      panels: { controls: { sections: [], title: "Controls" } },
    },
    modules: [timelineModule({ mode })],
  });
}

const timelineProductReadiness: ToolcraftProductReadiness = {
  exportIntent: {
    image: {
      evidence: exportRequestFixture(
        "Remove image export; this fixture must not offer downloadable artifacts.",
      ),
      mode: "user-removed",
    },
    svg: { mode: "not-requested" },
    video: { mode: "not-requested" },
  },
  interactionOwnership: [],
  mode: "product",
  productName: "Timeline fixture",
  productSummary: "A non-spatial timeline behavior fixture.",
  requestedBehavior: "Control animation playback through the runtime timeline.",
  viewInteraction: {
    mode: "non-spatial",
    reason: "The timeline fixture has no spatial view.",
  },
};

const timelinePersistenceAcceptance: ToolcraftComponentAcceptance = {
  automated: true,
  automatedTestName: "timeline state restores after reload",
  browser: {
    budget: "standard" as const,
    file: "e2e/app-controls.spec.ts",
    testName: "browser: timeline state restores after reload",
  },
  componentType: "persistence",
  evidence: "persistence-state",
  expectedObservable: "Timeline state restores after a real browser reload.",
  fixture: "timeline persistence fixture",
  id: "persistence.reload",
  kind: "runtime",
  persistenceCoverage: "reload",
  persistenceSlices: ["timeline"],
  userAction: "Edit the timeline, reload the page, and inspect restored state.",
};

type TimelineValidationOverrides = Parameters<
  typeof validateBaseContractAcceptance
>[0];

function validateContractAcceptance(
  overrides: TimelineValidationOverrides = {},
): string[] {
  return validateBaseContractAcceptance({
    ...overrides,
    acceptance: [
      ...(overrides.acceptance ?? []),
      timelinePersistenceAcceptance,
    ],
    productReadiness: timelineProductReadiness,
  });
}

describe("starter acceptance timeline playback contract", () => {
  it("requires timeline playback coverage when a playback timeline is enabled", () => {
    expect(
      validateContractAcceptance({
        schema: createTimelineSchema(),
        acceptance: [],
      }),
    ).toEqual(
      expect.arrayContaining([
        'panels.timeline mode "playback" requires a runtime acceptance entry with timelineCoverage "playback" proving pause, scrub, duration/loop, and rendered-frame behavior.',
      ]),
    );
  });

  it("requires playback timeline coverage to prove duration drives renderer progress", () => {
    expect(
      validateContractAcceptance({
        schema: createTimelineSchema(),
        acceptance: [
          {
            automated: true,
            automatedTestName:
              "timeline playback controls drive rendered output",
            browser: {
              budget: "standard",
              file: "e2e/app-controls.spec.ts",
              testName:
                "browser: timeline playback controls drive rendered output",
            },
            componentType: "timeline",
            evidence: "timeline-output",
            expectedObservable:
              "Pause, scrub, and playback update visible renderer output.",
            fixture: "timeline playback fixture",
            id: "timeline.playback",
            kind: "runtime",
            target: "timeline.playback",
            timelineCoverage: "playback",
            timelinePlaybackCoverage: [
              "pause-resume",
              "scrub",
              "rendered-frame",
            ],
            userAction: "Pause, scrub, and resume timeline playback.",
          },
        ],
      }),
    ).toContain(
      'timeline.playback timelineCoverage "playback" must declare timelinePlaybackCoverage for pause-resume, scrub, duration, loop, and rendered-frame. Duration coverage must prove renderer progress maps 0..state.timeline.durationSeconds, not a local fixed animation duration.',
    );
  });

  it("requires timeline animation intent to declare loop duration provenance", () => {
    expect(
      validateContractAcceptance({
        schema: createTimelineSchema(),
        acceptance: [playbackTimelineAcceptance],
        transferMode: {
          animationIntent: { mode: "timeline-playback" },
          mode: "new-toolcraft-app",
          referenceInputs: [],
        } as unknown as ToolcraftTransferMode,
      }),
    ).toContain(
      'appTransferMode.animationIntent mode "timeline-playback" must declare loopDuration with source, seconds, and evidence. Do not let runtime/template fallback duration such as 8s stand in for product loop intent.',
    );
  });

  it("requires playback timeline apps to declare matching playback animation intent", () => {
    expect(
      validateContractAcceptance({
        schema: createTimelineSchema(),
        acceptance: [playbackTimelineAcceptance],
        transferMode: {
          animationIntent: { mode: "none" },
          mode: "new-toolcraft-app",
          referenceInputs: [],
        },
      }),
    ).toContain(
      'panels.timeline mode "playback" requires appTransferMode.animationIntent mode "timeline-playback" with loopDuration provenance.',
    );
  });

  it("requires keyframe timeline apps to declare matching keyframe animation intent", () => {
    expect(
      validateContractAcceptance({
        schema: createTimelineSchema("keyframes"),
        acceptance: [playbackTimelineAcceptance],
        transferMode: {
          animationIntent: { mode: "none" },
          mode: "new-toolcraft-app",
          referenceInputs: [],
        },
      }),
    ).toContain(
      'panels.timeline mode "keyframes" requires appTransferMode.animationIntent mode "timeline-keyframes" with loopDuration provenance.',
    );
  });

  it("requires declared loop duration to match timeline default duration", () => {
    expect(
      validateContractAcceptance({
        schema: createTimelineSchema(),
        acceptance: [playbackTimelineAcceptance],
        transferMode: {
          animationIntent: {
            loopDuration: {
              evidence:
                "The product timing model derives a six second forward animation cycle from the authored baseline.",
              seconds: 6,
              source: "product-derived",
            },
            mode: "timeline-playback",
          },
          mode: "new-toolcraft-app",
          referenceInputs: [],
        },
      }),
    ).toContain(
      "panels.timeline.defaultDurationSeconds (8) must match appTransferMode.animationIntent.loopDuration.seconds (6).",
    );
  });

  it("rejects a non-product loop duration source structurally", () => {
    expect(
      validateContractAcceptance({
        schema: createTimelineSchema(),
        acceptance: [playbackTimelineAcceptance],
        transferMode: {
          animationIntent: {
            loopDuration: {
              evidence: "Duración elegida para el producto.",
              seconds: 8,
              source: "runtime" as never,
            },
            mode: "timeline-playback",
          },
          mode: "new-toolcraft-app",
          referenceInputs: [],
        },
      }),
    ).toContain(
      'appTransferMode.animationIntent.loopDuration.source must be "reference", "user-request", or "product-derived"; received "runtime". Runtime/template fallback is not a valid loop-duration source.',
    );
  });

  it("requires typed seamless-loop proof when loop coverage is declared", () => {
    expect(
      validateContractAcceptance({
        schema: createTimelineSchema(),
        acceptance: [
          {
            automated: true,
            automatedTestName: "timeline duration edit drives renderer output",
            browser: {
              budget: "standard",
              file: "e2e/app-controls.spec.ts",
              testName:
                "browser: timeline duration edit drives renderer output",
            },
            componentType: "timeline",
            evidence: "timeline-output",
            expectedObservable:
              "Editing timeline duration changes the playback range and renderer follows state.timeline.durationSeconds.",
            fixture: "timeline playback fixture",
            id: "timeline.playback",
            kind: "runtime",
            target: "timeline.playback",
            timelineCoverage: "playback",
            timelinePlaybackCoverage: [
              "pause-resume",
              "scrub",
              "duration",
              "loop",
              "rendered-frame",
            ],
            userAction:
              "Edit timeline duration, scrub the range, pause, and resume playback.",
          },
        ],
      }),
    ).toContain(
      'timeline.playback timelinePlaybackCoverage "loop" must declare timelineLoopProof with forward-only direction, forbidden reverse playback, first-last-match seam, and reproved-after-edit duration behavior. Browser evidence still proves the real samples and seam.',
    );
  });

  it("rejects an incomplete typed loop proof regardless of prose", () => {
    expect(
      validateContractAcceptance({
        schema: createTimelineSchema(),
        acceptance: [
          {
            automated: true,
            automatedTestName:
              "timeline duration edit verifies a seamless forward-only loop",
            browser: {
              budget: "standard",
              file: "e2e/app-controls.spec.ts",
              testName: "browser: timeline duration edit verifies loop seam",
            },
            componentType: "timeline",
            evidence: "timeline-output",
            expectedObservable:
              "Editing timeline duration keeps a seamless forward-only loop and stitches first and last frames.",
            fixture: "timeline playback fixture",
            id: "timeline.playback",
            kind: "runtime",
            target: "timeline.playback",
            timelineCoverage: "playback",
            timelineLoopProof: {
              direction: "forward-only",
              durationChange: "reproved-after-edit",
              reversePlayback: "forbidden",
              seam: "unchecked" as never,
            },
            timelinePlaybackCoverage: [
              "pause-resume",
              "scrub",
              "duration",
              "loop",
              "rendered-frame",
            ],
            userAction:
              "Edit timeline duration and verify first and last frames stitch with no mirror fallback.",
          },
        ],
      }),
    ).toContain(
      'timeline.playback timelinePlaybackCoverage "loop" must declare timelineLoopProof with forward-only direction, forbidden reverse playback, first-last-match seam, and reproved-after-edit duration behavior. Browser evidence still proves the real samples and seam.',
    );
  });

  it("accepts neutral-language prose when the typed loop proof is complete", () => {
    expect(
      validateContractAcceptance({
        schema: createTimelineSchema(),
        acceptance: [
          {
            automated: true,
            automatedTestName: "timeline duration edit verifies a generic loop",
            browser: {
              budget: "standard",
              file: "e2e/app-controls.spec.ts",
              testName:
                "browser: timeline duration edit verifies a generic loop",
            },
            componentType: "timeline",
            evidence: "timeline-output",
            expectedObservable:
              "La salida mantiene el ciclo previsto tras editar la duración.",
            fixture: "timeline playback fixture",
            id: "timeline.playback",
            kind: "runtime",
            target: "timeline.playback",
            timelineCoverage: "playback",
            timelineLoopProof: {
              direction: "forward-only",
              durationChange: "reproved-after-edit",
              reversePlayback: "forbidden",
              seam: "first-last-match",
            },
            timelinePlaybackCoverage: [
              "pause-resume",
              "scrub",
              "duration",
              "loop",
              "rendered-frame",
            ],
            userAction: "Editar la duración y comprobar el resultado.",
          },
        ],
      }),
    ).not.toContain(
      'timeline.playback timelinePlaybackCoverage "loop" must declare timelineLoopProof with forward-only direction, forbidden reverse playback, first-last-match seam, and reproved-after-edit duration behavior. Browser evidence still proves the real samples and seam.',
    );
  });
});
