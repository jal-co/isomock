export type ToolcraftViewInteractionAuthority =
  | Readonly<{
      kind: "explicit-user-request";
      requestQuote: string;
    }>
  | Readonly<{
      kind: "inspected-behavioral-reference";
      observedBehavior: string;
      referenceId: string;
    }>;

export type ToolcraftViewInteractionIntent =
  | {
      mode: "non-spatial";
      reason: string;
    }
  | {
      mode: "orbit";
      orientationTargets: readonly string[];
    }
  | {
      authority: ToolcraftViewInteractionAuthority;
      mode: "fixed-camera";
    }
  | {
      authority: ToolcraftViewInteractionAuthority;
      mode: "timeline-camera";
    };
