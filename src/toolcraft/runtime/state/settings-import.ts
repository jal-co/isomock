import { reduceToolcraftCanvasCommand } from "./canvas-reducer";
import { reduceToolcraftControlsCommand } from "./controls-reducer";
import { getToolcraftValueControls, getInvalidToolcraftKeyedCollectionTarget } from "./control-value-normalization";
import { isToolcraftPersistenceRecord } from "./persistence-shared";
import { commitToolcraftStatePatch } from "./history-patches";
import {
  tagToolcraftCanvasStateHistoryPatch,
  tagToolcraftHistoryPatchDomains,
} from "./history-patch-metadata";
import { getToolcraftSettingsMediaState } from "./media-settings";
import { getMediaReadyTimelineState } from "./timeline-readiness";
import {
  clampToolcraftTimelineDurationSeconds,
  clampToolcraftTimelineTime,
  toolcraftTimelineMinDurationSeconds,
} from "./timeline-values";
import type { ToolcraftSettingsState, ToolcraftState } from "./types";

function importedStateFields(state: ToolcraftState): Record<string, unknown> {
  return {
    "canvas.mode": state.canvas.mode,
    "canvas.size": state.canvas.size,
    "canvas.offset": state.canvas.offset,
    layers: state.layers,
    mediaAssets: state.mediaAssets,
    selectedLayerId: state.selectedLayerId,
    timeline: state.timeline,
  };
}

/** Assemble through canonical reducers, then publish one state/history operation. */
export function applyToolcraftSettingsState(
  state: ToolcraftState,
  settings: ToolcraftSettingsState,
): ToolcraftState {
  if (getInvalidToolcraftKeyedCollectionTarget(getToolcraftValueControls(state.schema), settings.values)) return state;
  let next = reduceToolcraftControlsCommand(state, {
    type: "controls.apply",
    history: "skip",
    values: settings.values,
  });
  next = reduceToolcraftCanvasCommand(next, {
    ...settings.canvas,
    type: "canvas.applySettings",
    history: "skip",
  });
  next = { ...next, ...getToolcraftSettingsMediaState(next, settings.assets) };
  // File item records belong only to restored assets at this exact upload target.
  // Otherwise a later upload may reuse a skipped media ID and inherit its values.
  for (const control of getToolcraftValueControls(state.schema).values()) {
    if (control.type !== "fileDrop" || !control.itemControls) continue;
    const items: unknown = next.values[control.target];
    if (!Array.isArray(items)) continue;
    const ids = new Set(
      next.mediaAssets
        .filter((asset) => asset.sourceTarget === control.target)
        .map(({ id }) => id),
    );
    const retained = items.filter(
      (item: unknown) =>
        isToolcraftPersistenceRecord(item) &&
        typeof item.mediaId === "string" &&
        ids.has(item.mediaId),
    );
    if (retained.length !== items.length) {
      next = {
        ...next,
        values: { ...next.values, [control.target]: retained },
      };
    }
  }
  if (state.schema.panels.timeline?.enabled) {
    const durationSeconds = clampToolcraftTimelineDurationSeconds(
      settings.timeline.durationSeconds,
      toolcraftTimelineMinDurationSeconds,
    );
    next = {
      ...next,
      timeline: getMediaReadyTimelineState(
        state.schema,
        {
          ...next.timeline,
          ...settings.timeline,
          durationSeconds,
          currentTimeSeconds: clampToolcraftTimelineTime(
            settings.timeline.currentTimeSeconds,
            durationSeconds,
          ),
          isPlaying: false,
        },
        next.mediaAssets,
      ),
    };
  }
  const changedTargets = Object.keys(next.values).filter(
    (target) => !Object.is(next.values[target], state.values[target]),
  );
  const patch = tagToolcraftCanvasStateHistoryPatch(
    tagToolcraftHistoryPatchDomains(
      {
        label: "Import settings",
        group: "settings.import",
        before: {},
        after: {},
      },
      {
        state: {
          before: importedStateFields(state),
          after: importedStateFields(next),
        },
        values: {
          before: Object.fromEntries(
            changedTargets.map((target) => [target, state.values[target]]),
          ),
          after: Object.fromEntries(
            changedTargets.map((target) => [target, next.values[target]]),
          ),
        },
      },
    ),
  );
  return { ...commitToolcraftStatePatch(state, patch), values: next.values };
}
