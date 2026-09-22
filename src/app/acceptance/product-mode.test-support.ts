import { defineToolcraft, type ToolcraftControlSchema, type ToolcraftControlSectionSchema } from "@/toolcraft/runtime";
import type { ToolcraftControlSectionInventoryEntry } from "./types";

export const modeRequest = {
  source: "user-message",
  messageRef: "test-user-message:1",
  messageText: "Add Diagram and Map modes.",
  quote: "Diagram and Map modes",
} as const;

export function createProductModeFixture(overrides: {
  late?: boolean;
  mode?: Partial<Extract<ToolcraftControlSchema, { type: "segmented" }>>;
  diagram?: Partial<Pick<ToolcraftControlSchema, "applicability" | "target">>;
  extra?: ToolcraftControlSectionSchema[];
  before?: ToolcraftControlSectionSchema[];
  modeSection?: Partial<Omit<ToolcraftControlSectionSchema, "controls">>;
} = {}) {
  const sections: ToolcraftControlSectionSchema[] = [
    {
      id: "scene-choice", title: "Scene",
      ...overrides.modeSection,
      controls: {
        mode: {
          type: "segmented", target: "scene.mode", label: "Mode",
          applicability: { mode: "always" }, keyframeable: false,
          defaultValue: "diagram",
          options: [{ label: "Diagram", value: "diagram" }, { label: "Map", value: "map" }],
          ...overrides.mode,
        },
      },
    },
    {
      id: "diagram", title: "Diagram",
      controls: {
        caption: {
          type: "text", target: "scene.caption", label: "Caption", defaultValue: "Diagram caption",
          applicability: { mode: "conditional", all: [{ target: "scene.mode", equals: "diagram" }] },
          ...overrides.diagram,
        },
      },
    },
    {
      id: "map", title: "Map",
      controls: {
        caption: {
          type: "text", target: "map.caption", label: "Caption", defaultValue: "Map caption",
          applicability: { mode: "conditional", all: [{ target: "scene.mode", equals: "map" }] },
        },
      },
    },
  ];
  sections.push(...(overrides.extra ?? []));
  if (overrides.late) sections.push(sections.shift()!);
  sections.unshift(...(overrides.before ?? []));
  const schema = defineToolcraft({
    base: { identity: { id: "product-mode-fixture", title: "Product modes" }, canvas: { enabled: true }, panels: { controls: { title: "Controls", sections } } },
    modules: [],
  });
  const inventory: ToolcraftControlSectionInventoryEntry[] = [
    {
      id: "scene-choice", title: "Scene", entityId: "scene-choice", entity: "Scene choice",
      groupingReason: "Select the explicitly requested product scene.", targets: ["scene.mode"],
      finiteSelectors: [{ target: "scene.mode", role: "branch", affectedTargets: [], reason: "Switch between the requested Diagram and Map scenes.", productMode: { request: modeRequest, sharedTargets: [] } }],
    },
    { id: "diagram", title: "Diagram", entityId: "diagram", entity: "Diagram", groupingReason: "Author the Diagram caption in its own scene.", targets: ["scene.caption"], finiteSelectors: [] },
    { id: "map", title: "Map", entityId: "map", entity: "Map", groupingReason: "Author the Map caption in its own scene.", targets: ["map.caption"], finiteSelectors: [] },
  ];
  return { schema, inventory };
}
