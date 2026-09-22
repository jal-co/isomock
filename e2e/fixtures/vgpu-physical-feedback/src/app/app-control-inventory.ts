import type { ToolcraftControlSectionInventoryEntry } from "./acceptance/types";

export const appControlSectionInventory: readonly ToolcraftControlSectionInventoryEntry[] = [
  {
    entity: "Physical feedback field",
    entityId: "physical-feedback-field",
    finiteSelectors: [
      {
        affectedTargets: [],
        reason: "Field availability controls its explicitly conditional Impulse setting.",
        role: "branch",
        target: "simulation.enabled",
      },
    ],
    groupingReason:
      "Field availability and impulse strength jointly define the simulated output.",
    id: "simulation",
    targets: ["simulation.enabled", "simulation.impulse"],
    title: "Simulation",
  },
  {
    entity: "Output background",
    entityId: "output-background",
    finiteSelectors: [
      {
        affectedTargets: ["appearance.background"],
        reason: "Background inclusion determines whether its color affects output.",
        role: "branch",
        target: "export.includeBackground",
      },
    ],
    groupingReason:
      "Inclusion and color jointly define the preview and exported field background.",
    id: "background",
    targets: ["export.includeBackground", "appearance.background"],
    title: "Background",
  },
  {
    entity: "Image delivery",
    entityId: "image-delivery",
    finiteSelectors: [
      {
        reason: "Image format changes its own exported artifact encoding.",
        role: "parameter",
        target: "export.image.format",
      },
      {
        reason: "Image resolution changes its own exported artifact dimensions.",
        role: "parameter",
        target: "export.image.resolution",
      },
    ],
    groupingReason:
      "Format and resolution jointly configure the exported physical field image.",
    id: "runtime.image-export",
    targets: ["export.image.format", "export.image.resolution"],
    title: "Image Export",
  },
];
