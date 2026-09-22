import {
  isToolcraftPersistenceRecord,
  toolcraftPersistedPanelIds,
} from "./persistence-shared";
import { readPoint } from "./persistence-reader-primitives";
import type { ToolcraftPanelSnapEdge } from "../contracts/types";
import type { ToolcraftInitialState, ToolcraftPanelState } from "./types";
import type { ResolvedToolcraftAppSchema } from "../schema/resolved-app-schema";

function isAllowedPanelSnapEdge(
  value: unknown,
  allowedEdges: readonly ToolcraftPanelSnapEdge[],
): value is ToolcraftPanelSnapEdge {
  return (
    typeof value === "string" && allowedEdges.some((edge) => edge === value)
  );
}

function readPanel(
  value: unknown,
  allowedSnapEdges: readonly ToolcraftPanelSnapEdge[],
): Partial<ToolcraftPanelState> | undefined {
  if (!isToolcraftPersistenceRecord(value)) {
    return undefined;
  }

  const panel: Partial<ToolcraftPanelState> = {};
  const offset = readPoint(value.offset);

  if (offset) {
    panel.offset = offset;
  }

  if (typeof value.collapsed === "boolean") {
    panel.collapsed = value.collapsed;
  }

  if (typeof value.extended === "boolean") {
    panel.extended = value.extended;
  }

  if (typeof value.hidden === "boolean") {
    panel.hidden = value.hidden;
  }

  if (
    typeof value.scrollTop === "number" &&
    Number.isFinite(value.scrollTop) && value.scrollTop >= 0
  ) {
    panel.scrollTop = value.scrollTop;
  }

  if (isAllowedPanelSnapEdge(value.snapEdge, allowedSnapEdges)) {
    panel.snapEdge = value.snapEdge;
  }

  return Object.keys(panel).length > 0 ? panel : undefined;
}

export function readPanels(
  schema: ResolvedToolcraftAppSchema,
  value: unknown,
): ToolcraftInitialState["panels"] | undefined {
  if (!isToolcraftPersistenceRecord(value)) {
    return undefined;
  }

  const panels: NonNullable<ToolcraftInitialState["panels"]> = {};

  for (const panelId of toolcraftPersistedPanelIds) {
    const snapEdges = schema.assembly.surfaces.panels[panelId]?.snapEdges ?? [];
    const panel = readPanel(value[panelId], snapEdges);

    if (panel) {
      panels[panelId] = panel;
    }
  }

  const controlsValue = value.controls;

  if (isToolcraftPersistenceRecord(controlsValue)) {
    const collapsedSectionsValue = controlsValue.collapsedSections;

    if (isToolcraftPersistenceRecord(collapsedSectionsValue)) {
      const validSectionIds = new Set(
        schema.panels.controls?.sections.map((section) => section.id) ?? [],
      );
      const collapsedSections: Record<string, boolean> = {};

      for (const [sectionId, collapsed] of Object.entries(
        collapsedSectionsValue,
      )) {
        if (validSectionIds.has(sectionId) && collapsed === true) {
          collapsedSections[sectionId] = true;
        }
      }

      panels.controls = {
        ...panels.controls,
        collapsedSections,
      };
    }
  }

  return Object.keys(panels).length > 0 ? panels : undefined;
}
