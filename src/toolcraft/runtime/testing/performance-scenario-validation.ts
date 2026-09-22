import type { ToolcraftPipelineInteraction } from "./performance-types";

export function requiresConcreteUiTarget(interaction: ToolcraftPipelineInteraction): boolean {
  return (
    interaction === "control-change" ||
    interaction === "control-drag" ||
    interaction === "export" ||
    interaction === "mask-drag" ||
    interaction === "timeline-playback" ||
    interaction === "timeline-scrub"
  );
}
