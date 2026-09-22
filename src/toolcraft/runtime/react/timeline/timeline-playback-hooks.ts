'use client';

import * as React from 'react';
import { useEffect, useRef, useState } from 'react';

import { getToolcraftTimelineLoopTime } from '../../state/timeline-loop';
import {
  clampToolcraftTimelineTime,
  toolcraftTimelineScrubStepSeconds,
} from '../../state/timeline-values';

type TimelineClockOptions = {
  durationSeconds: number;
  getCurrentTimeSeconds: () => number;
  isHoverPaused: boolean;
  isLooping: boolean;
  isPlaying: boolean;
  isScrubbing: boolean;
  setCurrentTimeSeconds: React.Dispatch<React.SetStateAction<number>>;
  setIsPlaying: React.Dispatch<React.SetStateAction<boolean>>;
};

type TimelineScrubberOptions = {
  commitCurrentTimeSeconds: () => void;
  currentTimeSeconds: number;
  disabled?: boolean;
  durationSeconds: number;
  setCurrentTimeSeconds: React.Dispatch<React.SetStateAction<number>>;
  setIsPlaying: React.Dispatch<React.SetStateAction<boolean>>;
};

type TimelineScrubberResult = {
  handleScrubKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  handleScrubLostPointerCapture: () => void;
  handleScrubPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  handleScrubPointerMove: (event: React.PointerEvent<HTMLDivElement>) => void;
  handleScrubPointerUp: (event: React.PointerEvent<HTMLDivElement>) => void;
  isScrubbing: boolean;
  stripRef: React.RefObject<HTMLDivElement | null>;
};

function getKeyboardScrubTime({
  currentTimeSeconds,
  durationSeconds,
  key,
}: {
  currentTimeSeconds: number;
  durationSeconds: number;
  key: string;
}): number | null {
  if (key === 'ArrowLeft') {
    return currentTimeSeconds - toolcraftTimelineScrubStepSeconds;
  }

  if (key === 'ArrowRight') {
    return currentTimeSeconds + toolcraftTimelineScrubStepSeconds;
  }

  if (key === 'Home') {
    return 0;
  }

  if (key === 'End') {
    return durationSeconds;
  }

  return null;
}

export function useTimelineClock({
  durationSeconds,
  getCurrentTimeSeconds,
  isHoverPaused,
  isLooping,
  isPlaying,
  isScrubbing,
  setCurrentTimeSeconds,
  setIsPlaying,
}: TimelineClockOptions): void {
  useEffect(() => {
    if (
      !isPlaying ||
      isHoverPaused ||
      isScrubbing ||
      typeof window === 'undefined' ||
      typeof window.requestAnimationFrame !== 'function'
    ) {
      return;
    }

    let frame = 0;
    let previousTimestamp = window.performance.now();
    const tick = (timestamp: number) => {
      const elapsedSeconds = (timestamp - previousTimestamp) / 1000;

      previousTimestamp = timestamp;
      const nextValue = getCurrentTimeSeconds() + elapsedSeconds;

      if (nextValue < durationSeconds) {
        setCurrentTimeSeconds(nextValue);
        frame = window.requestAnimationFrame(tick);
        return;
      }

      if (isLooping) {
        setCurrentTimeSeconds(
          getToolcraftTimelineLoopTime({
            currentTimeSeconds: nextValue,
            durationSeconds,
          }),
        );
        frame = window.requestAnimationFrame(tick);
        return;
      }

      setCurrentTimeSeconds(durationSeconds);
      setIsPlaying(false);
    };

    frame = window.requestAnimationFrame(tick);

    return () => window.cancelAnimationFrame(frame);
  }, [
    durationSeconds,
    getCurrentTimeSeconds,
    isHoverPaused,
    isLooping,
    isPlaying,
    isScrubbing,
    setCurrentTimeSeconds,
    setIsPlaying,
  ]);
}

export function useTimelineScrubber({
  commitCurrentTimeSeconds,
  currentTimeSeconds,
  disabled = false,
  durationSeconds,
  setCurrentTimeSeconds,
  setIsPlaying,
}: TimelineScrubberOptions): TimelineScrubberResult {
  const [isScrubbing, setIsScrubbing] = useState(false);
  const isScrubbingRef = useRef(false);
  const isMountedRef = useRef(true);
  const commitCurrentTimeSecondsRef = useRef(commitCurrentTimeSeconds);
  const stripRef = useRef<HTMLDivElement | null>(null);
  commitCurrentTimeSecondsRef.current = commitCurrentTimeSeconds;

  const finishScrub = React.useCallback((): void => {
    if (!isScrubbingRef.current) {
      return;
    }

    isScrubbingRef.current = false;
    if (isMountedRef.current) {
      setIsScrubbing(false);
    }
    commitCurrentTimeSecondsRef.current();
  }, []);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      finishScrub();
    };
  }, [finishScrub]);

  useEffect(() => {
    if (disabled) {
      finishScrub();
    }
  }, [disabled, finishScrub]);

  const getScrubGeometry = (): { rect: DOMRect; trackStart: number; trackWidth: number } | null => {
    const rect = stripRef.current?.getBoundingClientRect();

    if (!(rect && rect.width > 0)) {
      return null;
    }

    const rawTrackStart = Number.parseFloat(stripRef.current?.dataset.timelineTrackStart ?? '0');
    const trackStart = Number.isFinite(rawTrackStart) ? rawTrackStart : 0;
    const rawTrackEndInset = Number.parseFloat(stripRef.current?.dataset.timelineTrackEnd ?? '0');
    const trackEndInset = Number.isFinite(rawTrackEndInset) ? rawTrackEndInset : 0;
    const trackWidth = Math.max(1, rect.width - trackStart - trackEndInset);

    return { rect, trackStart, trackWidth };
  };
  const canStartScrubbingFromPointerEvent = (
    event: React.PointerEvent<HTMLDivElement>,
  ): boolean => {
    const geometry = getScrubGeometry();

    if (!geometry) {
      return false;
    }

    const isExpandedTimeline = geometry.trackStart > 0;
    const startedFromExpandedPlayhead =
      event.target instanceof Element &&
      event.target.closest(
        [
          '[data-slot="timeline-expanded-playhead"]',
          '[data-slot="timeline-expanded-playhead-handle"]',
          '[data-slot="timeline-expanded-playhead-hit-area"]',
        ].join(','),
      );

    if (isExpandedTimeline) {
      return Boolean(startedFromExpandedPlayhead);
    }

    return event.clientX >= geometry.rect.left + geometry.trackStart;
  };
  const setCurrentTimeFromClientX = (clientX: number): void => {
    const geometry = getScrubGeometry();

    if (!geometry) {
      return;
    }

    const { rect, trackStart, trackWidth } = geometry;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left - trackStart) / trackWidth));

    setCurrentTimeSeconds(
      clampToolcraftTimelineTime(durationSeconds * ratio, durationSeconds),
    );
  };
  const handleScrubKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (disabled) {
      return;
    }

    const nextTime = getKeyboardScrubTime({
      currentTimeSeconds,
      durationSeconds,
      key: event.key,
    });

    if (nextTime === null) {
      return;
    }

    event.preventDefault();
    setCurrentTimeSeconds(clampToolcraftTimelineTime(nextTime, durationSeconds));
    commitCurrentTimeSeconds();
  };
  const handleScrubPointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (disabled || !canStartScrubbingFromPointerEvent(event)) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    isScrubbingRef.current = true;
    setIsPlaying(false);
    setIsScrubbing(true);
    setCurrentTimeFromClientX(event.clientX);
  };
  const handleScrubPointerMove = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (!isScrubbingRef.current) {
      return;
    }

    setCurrentTimeFromClientX(event.clientX);
  };
  const handleScrubPointerUp = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (!isScrubbingRef.current) {
      return;
    }

    finishScrub();

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return {
    handleScrubKeyDown,
    handleScrubLostPointerCapture: finishScrub,
    handleScrubPointerDown,
    handleScrubPointerMove,
    handleScrubPointerUp,
    isScrubbing,
    stripRef,
  };
}
