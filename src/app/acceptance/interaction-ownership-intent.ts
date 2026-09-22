export type ToolcraftInteractionSurface = "canvas" | "panel";

export type ToolcraftInteractionCapability =
  | "collection-edit"
  | "command"
  | "direct-spatial-edit"
  | "precise-value-entry"
  | "property-edit"
  | "spatial-selection"
  | "structured-selection";

export type ToolcraftInteractionEvidenceSource =
  | "reference"
  | "usability-analysis"
  | "user-request";

type ToolcraftInteractionOwnershipBase = {
  alternative: {
    reason: string;
    surface: ToolcraftInteractionSurface;
  };
  capability: ToolcraftInteractionCapability;
  evidence: {
    detail: string;
    source: ToolcraftInteractionEvidenceSource;
  };
  id: string;
  reason: string;
  surface: ToolcraftInteractionSurface;
  target: string;
};

export type ToolcraftInteractionOwnershipEntry =
  | (ToolcraftInteractionOwnershipBase & {
      capability: "precise-value-entry" | "property-edit";
      selectionScope:
        | Readonly<{ mode: "global" }>
        | Readonly<{
            mode: "selected-entity";
            selectionInteractionId: string;
          }>;
    })
  | (ToolcraftInteractionOwnershipBase & {
      capability: Exclude<
        ToolcraftInteractionCapability,
        "precise-value-entry" | "property-edit"
      >;
      selectionScope?: never;
    });
