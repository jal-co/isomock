import type { ReadonlyToolcraftState, ToolcraftReadonly } from "../../state/readonly-state";
import type {
  ResolvedToolcraftControlSchema,
  ResolvedToolcraftControlSectionSchema,
} from "../../schema/types";
import {
  isToolcraftControlVisible,
  isToolcraftSectionVisible,
} from "../controls-panel/conditions/control-conditions";

export type ToolcraftOrientationControlEntry = {
  control: ToolcraftReadonly<ResolvedToolcraftControlSchema>;
  id: string;
  section: ToolcraftReadonly<ResolvedToolcraftControlSectionSchema>;
};

export function getToolcraftOrientationControlEntries(
  sections: ToolcraftReadonly<readonly ResolvedToolcraftControlSectionSchema[]>,
): ToolcraftOrientationControlEntry[] {
  return sections.flatMap((section) =>
    Object.entries(section.controls).flatMap(([id, control]) =>
      control.type === "orientationGizmo" ? [{ control, id, section }] : [],
    ),
  );
}

export function resolveToolcraftOrientationControl(
  state: ReadonlyToolcraftState,
  entries: readonly ToolcraftOrientationControlEntry[],
): ToolcraftOrientationControlEntry | null {
  const visibleEntries = entries.filter(
    ({ control, section }) =>
      isToolcraftSectionVisible(state, section) &&
      isToolcraftControlVisible(state, control),
  );

  if (visibleEntries.length > 1) {
    throw new Error(
      `Multiple orientationGizmo controls are visible at the same time: ${visibleEntries
        .map(({ id }) => id)
        .join(", ")}. Visibility conditions must select at most one canvas handle.`,
    );
  }

  return visibleEntries[0] ?? null;
}
