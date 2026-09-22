import { commitToolcraftValuePatch } from "./history-patches";
import { tagToolcraftHistoryPatchDomains } from "./history-patch-metadata";
import type { ToolcraftHistoryMode, ToolcraftState } from "./types";

/** Keep product value names independent from runtime history state fields. */
export function commitToolcraftControlStateReplacement(
  state: ToolcraftState,
  replacement: Pick<ToolcraftState, "timeline" | "values">,
  label: string,
  history?: { group?: string; mode?: ToolcraftHistoryMode },
): ToolcraftState {
  const targets = Object.keys(replacement.values).filter(
    (target) => !Object.is(state.values[target], replacement.values[target]),
  );
  const timelineChanged = replacement.timeline !== state.timeline;
  if (targets.length === 0 && !timelineChanged) return state;
  const patch = tagToolcraftHistoryPatchDomains(
    { after: {}, before: {}, label },
    {
      values: {
        before: Object.fromEntries(
          targets.map((target) => [target, state.values[target]]),
        ),
        after: Object.fromEntries(
          targets.map((target) => [target, replacement.values[target]]),
        ),
      },
      state: {
        before: timelineChanged ? { timeline: state.timeline } : {},
        after: timelineChanged ? { timeline: replacement.timeline } : {},
      },
    },
  );
  return commitToolcraftValuePatch(
    timelineChanged ? { ...state, timeline: replacement.timeline } : state,
    patch,
    replacement.values,
    history,
  );
}
