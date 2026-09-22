import { filterLayoutGroupsForControlIds } from "./controls-panel-layout-groups";
import {
  deriveSplitToolcraftControlSectionId,
  preserveToolcraftInternalControlSectionRegistration,
  registerToolcraftInternalControlSection,
} from "./controls-panel-section-id";
import type {
  ResolvedToolcraftControlSchema,
  ResolvedToolcraftControlSectionSchema,
  ResolvedToolcraftNonModelControlSchema,
  ToolcraftControlSchema,
} from "./types";

type ToolcraftControlActionSchema = NonNullable<
  ToolcraftControlSchema["actions"]
>[number];

type ToolcraftPanelActionsControl = Extract<ResolvedToolcraftNonModelControlSchema, { type: "panelActions" }>;

type ResolvedControlEntry = [string, ResolvedToolcraftControlSchema];
type PanelActionsEntry = [string, ToolcraftPanelActionsControl];

function isPanelActionsControl(
  control: ResolvedToolcraftControlSchema,
): control is ToolcraftPanelActionsControl {
  return control.type === "panelActions";
}

function isPanelActionsEntry(
  entry: ResolvedControlEntry,
): entry is PanelActionsEntry {
  return isPanelActionsControl(entry[1]);
}

function partitionControlEntries(entries: readonly ResolvedControlEntry[]): {
  actionEntries: PanelActionsEntry[];
  passthroughEntries: ResolvedControlEntry[];
} {
  const actionEntries: PanelActionsEntry[] = [];
  const passthroughEntries: ResolvedControlEntry[] = [];

  for (const entry of entries) {
    if (isPanelActionsEntry(entry)) {
      actionEntries.push(entry);
    } else {
      passthroughEntries.push(entry);
    }
  }

  return { actionEntries, passthroughEntries };
}

function isPrimaryPanelAction(action: ToolcraftControlActionSchema): boolean {
  return typeof action !== "string" && action.variant !== "outline";
}

function orderPanelActions(
  actions: readonly ToolcraftControlActionSchema[],
): ToolcraftControlActionSchema[] {
  if (actions.length !== 2) {
    return [...actions];
  }

  return [...actions].sort(
    (left, right) =>
      Number(isPrimaryPanelAction(left)) - Number(isPrimaryPanelAction(right)),
  );
}

function createMergedPanelActionsControl(
  entries: readonly PanelActionsEntry[],
): ToolcraftPanelActionsControl | null {
  const firstControl = entries[0]?.[1];

  if (!firstControl) {
    return null;
  }

  const actions = entries.flatMap(([, control]) => [
    ...(control.actions ?? []),
  ]);

  return {
    ...firstControl,
    applicability: { mode: "always", origin: "explicit" },
    actions: orderPanelActions(actions),
    target: firstControl.target || "panel.actions",
    type: "panelActions",
  };
}

function getBodySectionTitleAfterActionSplit(
  title: ResolvedToolcraftControlSectionSchema["title"],
): ResolvedToolcraftControlSectionSchema["title"] {
  if (!title) {
    return title;
  }

  return isActionOrExportSectionTitle(title) ? undefined : title;
}

function isActionOrExportSectionTitle(title: string): boolean {
  const normalizedTitle = title.trim().toLowerCase();

  return (
    normalizedTitle === "action" ||
    normalizedTitle === "actions" ||
    normalizedTitle === "export" ||
    normalizedTitle === "exports"
  );
}

function getSectionIdAfterActionSplit(
  section: ResolvedToolcraftControlSectionSchema,
  entries: readonly ResolvedControlEntry[],
  removedActionCount: number,
): string {
  return removedActionCount > 0
    ? deriveSplitToolcraftControlSectionId(section.id, entries)
    : section.id;
}

export function splitControlsPanelActionSections(
  sections: readonly ResolvedToolcraftControlSectionSchema[],
): {
  bodySections: ResolvedToolcraftControlSectionSchema[];
  stickyFooterSections: ResolvedToolcraftControlSectionSchema[];
} {
  const bodySections: ResolvedToolcraftControlSectionSchema[] = [];
  const stickyFooterSections: ResolvedToolcraftControlSectionSchema[] = [];
  const stickyFooterActionEntries: PanelActionsEntry[] = [];

  for (const section of sections) {
    const entries: ResolvedControlEntry[] = Object.entries(section.controls);
    // Settings is mandatory even for hosts with no enabled canvas/timeline fields.
    if (section.id === "runtime.setup" && entries.length === 0) {
      bodySections.push(section);
      continue;
    }
    const { actionEntries, passthroughEntries } =
      partitionControlEntries(entries);

    if (section.actionGroup) {
      stickyFooterActionEntries.push(...actionEntries);

      if (passthroughEntries.length > 0) {
        const splitSection = {
          ...section,
          controls: Object.fromEntries(passthroughEntries),
          id: getSectionIdAfterActionSplit(
            section,
            passthroughEntries,
            actionEntries.length,
          ),
        };

        stickyFooterSections.push(
          actionEntries.length > 0
            ? registerToolcraftInternalControlSection(splitSection)
            : preserveToolcraftInternalControlSectionRegistration(
                section,
                splitSection,
              ),
        );
      }

      continue;
    }

    if (passthroughEntries.length > 0) {
      const controlIds = new Set(passthroughEntries.map(([id]) => id));
      const layoutGroups = filterLayoutGroupsForControlIds(
        section.layoutGroups,
        controlIds,
      );
      const title = getBodySectionTitleAfterActionSplit(section.title);

      const splitSection = {
        ...section,
        controls: Object.fromEntries(passthroughEntries),
        id: getSectionIdAfterActionSplit(
          section,
          passthroughEntries,
          actionEntries.length,
        ),
        layoutGroups: layoutGroups.length > 0 ? layoutGroups : undefined,
        title,
      };

      bodySections.push(
        actionEntries.length > 0
          ? registerToolcraftInternalControlSection(splitSection)
          : preserveToolcraftInternalControlSectionRegistration(
              section,
              splitSection,
            ),
      );
    }

    if (actionEntries.length > 0) {
      stickyFooterActionEntries.push(...actionEntries);
    }
  }

  const mergedActionsControl = createMergedPanelActionsControl(
    stickyFooterActionEntries,
  );

  if (mergedActionsControl) {
    stickyFooterSections.unshift(
      registerToolcraftInternalControlSection({
        actionGroup: "secondary",
        controls: { footer: mergedActionsControl },
        id: "runtime.export",
        layout: "standalone",
        title: "Export",
      }),
    );
  }

  return { bodySections, stickyFooterSections };
}
