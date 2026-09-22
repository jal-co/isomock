import type {
  ToolcraftComponentAcceptance,
  ToolcraftProductReadiness,
  ToolcraftTransferMode,
} from "./acceptance/types";

import { appSchema } from "./app-schema";
export { appControlSectionInventory } from "./app-control-inventory";

const persistenceSlices =
  appSchema.persistence.storage === "localStorage"
    ? appSchema.persistence.include
    : [];

export const appTransferMode: ToolcraftTransferMode = {
  animationIntent: {
    loopDuration: {
      evidence: "Two seconds expose deterministic feedback decay and replay quickly.",
      seconds: 2,
      source: "product-derived",
    },
    mode: "timeline-playback",
  },
  mode: "new-toolcraft-app",
  referenceInputs: [],
};

export const appProductReadiness: ToolcraftProductReadiness = {
  exportIntent: {
    image: { mode: "toolcraft-default" },
    svg: { mode: "not-requested" },
    video: { mode: "not-requested" },
  },
  interactionOwnership: [
    {
      alternative: {
        reason:
          "A canvas copy would add renderer chrome for a binary field property without improving direct manipulation.",
        surface: "canvas",
      },
      capability: "property-edit",
      evidence: {
        detail:
          "Usability comparison keeps the Field availability switch discoverable beside its dependent Impulse property.",
        source: "usability-analysis",
      },
      id: "field-toggle",
      reason:
        "The controls panel owns the global Field availability property and its conditional settings.",
      selectionScope: { mode: "global" },
      surface: "panel",
      target: "simulation.enabled",
    },
    {
      alternative: {
        reason:
          "A canvas gesture would hide the exact impulse value and duplicate the panel's accessible numeric edit.",
        surface: "canvas",
      },
      capability: "precise-value-entry",
      evidence: {
        detail:
          "Usability comparison selects the labeled slider for exact, keyboard-accessible impulse adjustment.",
        source: "usability-analysis",
      },
      id: "impulse-entry",
      reason:
        "The controls panel provides precise global impulse entry without placing product controls on the field.",
      selectionScope: { mode: "global" },
      surface: "panel",
      target: "simulation.impulse",
    },
    {
      alternative: {
        reason:
          "Panel buttons would separate continuous panning from the spatial viewport feedback it controls.",
        surface: "panel",
      },
      capability: "direct-spatial-edit",
      evidence: {
        detail:
          "Usability comparison selects direct canvas dragging for continuous viewport offset feedback.",
        source: "usability-analysis",
      },
      id: "viewport-pan",
      reason:
        "The canvas owns viewport panning because the gesture directly moves the visible world frame.",
      surface: "canvas",
      target: "canvas.setOffset",
    },
    {
      alternative: {
        reason:
          "Panel controls would duplicate runtime zoom tools and detach zoom focus from the visible canvas.",
        surface: "panel",
      },
      capability: "direct-spatial-edit",
      evidence: {
        detail:
          "Usability comparison selects canvas wheel and runtime zoom gestures around the active viewport focus.",
        source: "usability-analysis",
      },
      id: "viewport-zoom",
      reason:
        "The canvas owns viewport zoom because scale and focus require immediate spatial feedback.",
      surface: "canvas",
      target: "canvas.setViewport",
    },
  ],
  mode: "product",
  productName: "VGPU Physical Feedback",
  productSummary:
    "A deterministic two-color impulse and decay field backed by WebGPU feedback textures.",
  requestedBehavior:
    "Adjust the impulse, scrub deterministic field time, navigate an infinite canvas, and export the current scene crop.",
  viewInteraction: {
    mode: "non-spatial",
    reason: "The physical field is two-dimensional and has no model camera.",
  },
};

export const appAcceptance: readonly ToolcraftComponentAcceptance[] = [
  {
    automated: true,
    automatedTestName: "declares production reload coverage for the generated product schema",
    browser: {
      budget: "extended-io",
      file: "e2e/app-persistence.spec.ts",
      testName: "browser: app restores exact canvas, values, and panel workspace slices after reload",
    },
    componentType: "persistence",
    evidence: "persistence-state",
    expectedObservable:
      "Canvas, field values, and panel workspace restore after a real reload.",
    fixture: "physical feedback persisted workspace",
    id: "persistence.reload",
    kind: "runtime",
    persistenceCoverage: "reload",
    persistenceSlices,
    target: "canvas.size.width",
    userAction: "Change Canvas width and Impulse, move Controls, then reload.",
  },
  {
    automated: true,
    automatedTestName: "physical feedback controls change deterministic pixels",
    browser: {
      budget: "standard",
      file: "e2e/app-vgpu-provider.spec.ts",
      testName: "browser acceptance: VGPU impulse changes rendered pixels",
    },
    componentType: "slider",
    evidence: "rendered-pixels",
    expectedObservable: "Changing Impulse changes the center pixel of the physical field.",
    fixture: "finite VGPU field at render scale 2",
    id: "renderer.impulse",
    interactionId: "impulse-entry",
    kind: "control",
    target: "simulation.impulse",
    userAction: "Drag Impulse and inspect the WebGPU canvas center pixel.",
  },
  {
    automated: true,
    automatedTestName: "physical feedback uses selected backing pixels",
    browser: {
      budget: "standard",
      file: "e2e/app-vgpu-provider.spec.ts",
      testName: "browser vgpu: finite scene at render scale 2",
    },
    componentType: "canvas",
    evidence: "rendered-pixels",
    expectedObservable:
      "Finite canvas backing remains CSS size times device pixel ratio times selected scale during steady, interaction, and playback states.",
    fixture: "finite VGPU backing",
    id: "renderer.render-scale",
    kind: "runtime",
    renderScaleCoverage: {
      kind: "selected-backing-pixels",
      states: ["interaction", "playback", "steady"],
    },
    target: "canvas.renderScale",
    userAction: "Select render scale 2 and inspect live backing pixels.",
  },
  {
    automated: true,
    automatedTestName: "background inclusion controls preview and PNG transparency",
    backgroundOutputCoverage: [
      "preview-hidden-when-excluded",
      "image-transparent-when-excluded",
      "infinity-viewport-color-and-dependency",
    ],
    browser: {
      budget: "standard",
      file: "e2e/app-vgpu-provider.spec.ts",
      testName: "browser acceptance: VGPU background inclusion controls output",
    },
    componentType: "switch",
    evidence: "rendered-pixels",
    expectedObservable:
      "Turning Background off removes the finite preview base, exports transparent PNG corners, and disables Infinity canvas.",
    fixture: "physical field background semantics",
    id: "renderer.background-inclusion",
    kind: "control",
    target: "export.includeBackground",
    userAction: "Toggle Background and compare preview, Infinity dependency, and PNG alpha.",
  },
  {
    automated: true,
    automatedTestName: "background color changes physical field output",
    browser: {
      budget: "standard",
      file: "e2e/app-vgpu-provider.spec.ts",
      testName: "browser acceptance: VGPU background color reaches export",
    },
    componentType: "color",
    evidence: "exported-bytes",
    expectedObservable:
      "The selected Background color appears at the scene export corners.",
    fixture: "physical field selected background",
    id: "renderer.background-color",
    kind: "control",
    target: "appearance.background",
    userAction: "Change Background color and inspect decoded export corners.",
  },
  {
    automated: true,
    automatedTestName: "image format options remain selectable",
    browser: {
      budget: "standard",
      file: "e2e/app-vgpu-provider.spec.ts",
      testName: "browser acceptance: VGPU image formats remain selectable",
    },
    componentType: "select",
    evidence: "product-output",
    expectedObservable: "PNG and JPG remain available image formats.",
    fixture: "physical field image formats",
    id: "renderer.image-format",
    kind: "control",
    optionCoverage: ["png", "jpg"],
    target: "export.image.format",
    userAction: "Select PNG and JPG and observe the selected format.",
  },
  {
    automated: true,
    automatedTestName: "image resolution options remain selectable",
    browser: {
      budget: "standard",
      file: "e2e/app-vgpu-provider.spec.ts",
      testName: "browser acceptance: VGPU image resolutions remain selectable",
    },
    componentType: "select",
    evidence: "product-output",
    expectedObservable: "2K, 4K, and 8K remain available image resolutions.",
    fixture: "physical field image resolutions",
    id: "renderer.image-resolution",
    kind: "control",
    optionCoverage: ["2k", "4k", "8k"],
    target: "export.image.resolution",
    userAction: "Select 2K, 4K, and 8K and observe the selected resolution.",
  },
  {
    automated: true,
    automatedTestName: "physical feedback uses runtime scene bounds",
    browser: {
      budget: "standard",
      file: "e2e/app-vgpu-provider-infinity.spec.ts",
      testName: "browser vgpu: Infinity scene bounds",
    },
    componentType: "canvas",
    evidence: "viewport-side-effect",
    expectedObservable:
      "Infinity mode changes only the finite boundary while the VGPU product frame, renderer identity, and live backing remain continuous.",
    fixture: "infinite physical field bounds",
    id: "renderer.infinity-mode",
    infinityCanvasCoverage: "mode-continuity-and-restoration",
    kind: "runtime",
    target: "canvas.infinity",
    userAction: "Toggle Infinity both directions and inspect VGPU frame, renderer, and backing continuity.",
  },
  {
    automated: true,
    automatedTestName: "physical feedback resets on backward timeline",
    browser: {
      budget: "standard",
      file: "e2e/app-vgpu-provider.spec.ts",
      testName: "browser vgpu: timeline reset and replay",
    },
    componentType: "timeline",
    evidence: "timeline-output",
    expectedObservable:
      "Forward scrub advances the field and backward scrub resets and replays from one seed and clock.",
    fixture: "two-second feedback timeline",
    id: "renderer.timeline",
    kind: "runtime",
    target: "timeline.playback",
    timelineCoverage: "playback",
    timelineLoopProof: {
      direction: "forward-only",
      durationChange: "reproved-after-edit",
      reversePlayback: "forbidden",
      seam: "first-last-match",
    },
    timelinePlaybackCoverage: "all-playback-behavior",
    userAction: "Scrub forward and backward, then play, pause, and resume.",
  },
  {
    automated: true,
    automatedTestName: "physical feedback coalesces viewport activity",
    browser: {
      budget: "standard",
      file: "e2e/app-vgpu-provider.spec.ts",
      testName: "browser vgpu: viewport interaction coalesces and resumes",
    },
    componentType: "canvas viewport",
    evidence: "viewport-side-effect",
    expectedObservable:
      "Viewport pan coalesces non-essential submissions and resumes at current time without changing playback state.",
    fixture: "interactive VGPU viewport",
    id: "renderer.viewport",
    interactionId: "viewport-pan",
    kind: "runtime",
    target: "canvas.setOffset",
    userAction:
      "Drag and wheel-pan the canvas while observing frame and playback state.",
  },
  {
    automated: true,
    automatedTestName: "physical feedback canvas zoom coalesces and resumes",
    browser: {
      budget: "standard",
      file: "e2e/app-vgpu-provider.spec.ts",
      testName: "browser acceptance: VGPU canvas zoom coalesces and resumes",
    },
    componentType: "canvas viewport",
    evidence: "viewport-side-effect",
    expectedObservable:
      "Viewport zoom coalesces non-essential submissions and resumes at current time without changing playback state.",
    fixture: "interactive VGPU viewport",
    id: "renderer.viewport-zoom",
    interactionId: "viewport-zoom",
    kind: "runtime",
    target: "canvas.setViewport",
    userAction: "Zoom the canvas while observing frame and playback state.",
  },
  {
    actionCoverage: ["export.png"],
    automated: true,
    automatedTestName: "physical feedback export is deterministic",
    browser: {
      budget: "standard",
      file: "e2e/app-vgpu-provider.spec.ts",
      testName: "browser vgpu: image export uses scene bounds",
    },
    componentType: "panelActions",
    evidence: "exported-bytes",
    exportArtifactCoverage: "all-required-image-export-behavior",
    expectedObservable:
      "PNG export keeps the saved artboard in Infinity and contains the expected corner and center colors.",
    fixture: "VGPU scene-bounds image export",
    id: "renderer.image-export",
    kind: "control",
    target: "actions.output",
    userAction: "Enable Infinity canvas, export PNG, and inspect decoded pixels.",
  },
  {
    automated: true,
    automatedTestName: "physical feedback export keeps the saved artboard across modes",
    browser: {
      budget: "standard",
      file: "e2e/app-vgpu-provider.spec.ts",
      testName: "browser acceptance: VGPU export preserves framing across Infinity",
    },
    componentType: "canvas",
    evidence: "exported-bytes",
    expectedObservable:
      "Infinity PNG export preserves the saved finite artboard dimensions, crop, background and decoded pixels.",
    fixture: "VGPU scene-bounds image crop",
    id: "renderer.infinity-export",
    infinityCanvasCoverage: "scene-bounds-image-export",
    kind: "runtime",
    target: "canvas.infinity",
    userAction: "Toggle Infinity and compare decoded exports for identical dimensions and content.",
  },
  {
    automated: true,
    automatedTestName: "physical feedback rejects unavailable webgpu",
    browser: {
      budget: "standard",
      file: "e2e/app-vgpu-provider.spec.ts",
      testName: "browser vgpu: unsupported state rejects export",
    },
    componentType: "renderer state",
    evidence: "product-output",
    expectedObservable:
      "Missing WebGPU displays an accessible unsupported state and rejects export with a typed error.",
    fixture: "navigator.gpu unavailable",
    id: "renderer.unsupported",
    kind: "runtime",
    target: "actions.output",
    userAction: "Open without navigator.gpu and attempt PNG export.",
  },
  {
    automated: true,
    automatedTestName: "physical feedback disposes resources once",
    browser: {
      budget: "standard",
      file: "e2e/app-vgpu-provider.spec.ts",
      testName: "browser vgpu: unmount disposes owned resources",
    },
    componentType: "switch",
    evidence: "product-output",
    expectedObservable:
      "Turning Field off leaves a blank quality-evidence canvas at exact backing while unmounting one target-readback presentation and disposing one GPU resource.",
    fixture: "VGPU renderer teardown",
    id: "renderer.teardown",
    interactionId: "field-toggle",
    kind: "control",
    target: "simulation.enabled",
    userAction: "Turn Field off and inspect resource disposal evidence.",
  },
];
