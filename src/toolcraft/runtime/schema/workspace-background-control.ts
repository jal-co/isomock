import { toolcraftCanvasWorkspaceBackgroundTarget } from "./runtime-targets";
import type { ToolcraftControlSchema } from "./types";

export function createWorkspaceBackgroundControl(): ToolcraftControlSchema {
  return {
    applicability: { mode: "always" },
    defaultValue: "dots",
    keyframeable: false,
    label: "Workspace",
    options: [{ label: "Blanc", value: "blanc" }, { label: "Dots", value: "dots" }],
    target: toolcraftCanvasWorkspaceBackgroundTarget,
    type: "select",
  };
}
