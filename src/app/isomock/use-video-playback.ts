import * as React from "react";
import {
  toolcraftTimelineMaxDurationSeconds,
  toolcraftTimelineMinDurationSeconds,
} from "@/toolcraft/runtime";
import {
  useToolcraftDispatch,
  useToolcraftSelector,
} from "@/toolcraft/runtime/react";

import type { IsomockDecodedSource } from "./source";

function rethrowUnlessAborted(error: DOMException): void {
  if (error.name !== "AbortError") throw error;
}

export function useIsomockVideoPlayback(
  source: IsomockDecodedSource | null,
): number {
  const dispatch = useToolcraftDispatch();
  const video = source?.kind === "video" ? source : null;
  const [frame, setFrame] = React.useState(0);
  const isPlaying = useToolcraftSelector((state) => state.timeline.isPlaying);
  const pausedTime = useToolcraftSelector(
    (state) => state.timeline.currentTimeSeconds,
  );
  const durationSeconds = useToolcraftSelector(
    (state) => state.timeline.durationSeconds,
  );

  React.useEffect(() => {
    if (!video) return;
    const clipDuration = Math.min(
      toolcraftTimelineMaxDurationSeconds,
      Math.max(toolcraftTimelineMinDurationSeconds, video.duration),
    );
    if (Math.abs(clipDuration - durationSeconds) > 0.01)
      dispatch({ durationSeconds: clipDuration, type: "timeline.setDuration" });
  }, [dispatch, durationSeconds, video]);

  React.useEffect(() => {
    if (!video) return undefined;
    const element = video.element;
    let shownTime = Number.NaN;
    let handle = requestAnimationFrame(function tick() {
      if (element.currentTime !== shownTime && !element.seeking) {
        shownTime = element.currentTime;
        setFrame((count) => count + 1);
      }
      handle = requestAnimationFrame(tick);
    });
    return () => {
      cancelAnimationFrame(handle);
      element.pause();
    };
  }, [video]);

  React.useEffect(() => {
    if (!video) return;
    const element = video.element;
    if (isPlaying) {
      void element.play().catch(rethrowUnlessAborted);
      return;
    }
    element.pause();
    element.currentTime = pausedTime % video.duration;
  }, [isPlaying, pausedTime, video]);

  return frame;
}
