import { registerToolcraftInternalControlSection } from "./controls-panel-section-id";
import type { ToolcraftControlSectionSchema } from "./types";

export const toolcraftRuntimeDefaultsSectionId = "runtime.defaults";

export function createToolcraftRuntimeDefaultsSection(): ToolcraftControlSectionSchema {
  return registerToolcraftInternalControlSection({
    id: toolcraftRuntimeDefaultsSectionId,
    title: "Defaults",
    layout: "standalone",
    controls: {
      settingsTransfer: {
        applicability: { mode: "always" },
        label: false,
        target: "runtime.settingsTransfer",
        type: "settingsTransfer",
      },
    },
  });
}
