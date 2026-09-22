'use client';

import * as React from 'react';
import type { CSSProperties } from 'react';
import { AnimatePresence, motion } from 'motion/react';

import type {
  ToolcraftTimelineKeyframeEasing,
  ToolcraftTimelineKeyframeGroup,
} from '../../state/types';
import {
  clampToolcraftTimelineTime,
  roundToolcraftTimelineKeyframeTime,
  toolcraftTimelineScrubStepSeconds,
} from '../../state/timeline-values';
import {
  getTimelineEventTargetElement,
  isEditableTimelineEventTarget,
  isTimelineInteractiveElement,
} from './timeline-event-targets';
import { findTimelineKeyframe } from './timeline-keyframes';
import { TimelineKeyframeRow } from './timeline-keyframe-row';
import {
  getTimelineCalcPositionStyle,
  timelineExpandedTrackEndOffsetPx,
  timelineExpandedTrackStartOffsetPx,
  timelineKeyframePresenceTransition,
  timelineRulerLeftInsetPx,
  timelineRulerRightInsetPx,
  timelineTrackColumnBorderWidthPx,
} from './timeline-panel-layout';

const timelinePlayheadSafeZonePx = 7;
const timelinePlayheadHitAreaWidthPx =
  timelineTrackColumnBorderWidthPx + timelinePlayheadSafeZonePx * 2;

type TimelineExpandedContentProps = {
  currentTimeSeconds: number;
  durationSeconds: number;
  isScrubbing: boolean;
  keyframeGroups: readonly ToolcraftTimelineKeyframeGroup[];
  onChangeKeyframeEasing: (keyframeId: string, easing: ToolcraftTimelineKeyframeEasing) => void;
  onDeleteControlKeyframes: (controlId: string) => void;
  onDeleteKeyframe: (keyframeId: string) => void;
  onKeyframeDragStart: () => void;
  onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  onLostPointerCapture: () => void;
  onMoveKeyframe: (keyframeId: string, timeSeconds: number) => string | null;
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: React.PointerEvent<HTMLDivElement>) => void;
  onSelectedKeyframeChange: (keyframeId: string | null) => void;
  selectedKeyframeId: string | null;
  stripRef: React.RefObject<HTMLDivElement | null>;
};

function cn(...classNames: Array<string | false | null | undefined>): string {
  return classNames.filter(Boolean).join(' ');
}

function formatTimelineSeconds(value: number): string {
  return value.toFixed(2);
}

function getTimelineRulerTicks(durationSeconds: number): number[] {
  return [0, 0.25, 0.5, 0.75, 1].map((ratio) => durationSeconds * ratio);
}

function getTimelineRulerMarkRatios(): number[] {
  return Array.from({ length: 33 }, (_value, index) => index / 32);
}

function getTimelineTrackPositionStyle(
  currentTimeSeconds: number,
  durationSeconds: number,
): CSSProperties {
  const ratio = Math.max(0, Math.min(1, currentTimeSeconds / durationSeconds));

  return getTimelineCalcPositionStyle(
    ratio,
    timelineExpandedTrackStartOffsetPx * (1 - ratio) - timelineExpandedTrackEndOffsetPx * ratio,
  );
}

export function TimelineExpandedContent({
  currentTimeSeconds,
  durationSeconds,
  isScrubbing,
  keyframeGroups,
  onChangeKeyframeEasing,
  onDeleteControlKeyframes,
  onDeleteKeyframe,
  onKeyframeDragStart,
  onKeyDown,
  onLostPointerCapture,
  onMoveKeyframe,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onSelectedKeyframeChange,
  selectedKeyframeId,
  stripRef,
}: TimelineExpandedContentProps): React.JSX.Element {
  const trackPlayheadStyle = getTimelineTrackPositionStyle(currentTimeSeconds, durationSeconds);
  const selectedKeyframe = findTimelineKeyframe(keyframeGroups, selectedKeyframeId);
  const deleteSelectedKeyframe = (): void => {
    if (!selectedKeyframeId) {
      return;
    }

    onDeleteKeyframe(selectedKeyframeId);
    onSelectedKeyframeChange(null);
  };
  const moveSelectedKeyframeByStep = (direction: -1 | 1): void => {
    if (!selectedKeyframe) {
      return;
    }

    const nextTimeSeconds = roundToolcraftTimelineKeyframeTime(
      clampToolcraftTimelineTime(
        selectedKeyframe.timeSeconds + toolcraftTimelineScrubStepSeconds * direction,
        durationSeconds,
      ),
    );

    if (nextTimeSeconds === selectedKeyframe.timeSeconds) {
      return;
    }

    const nextSelectedKeyframeId = onMoveKeyframe(selectedKeyframe.id, nextTimeSeconds);

    onSelectedKeyframeChange(nextSelectedKeyframeId ?? selectedKeyframe.id);
  };
  const handleExpandedKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (isEditableTimelineEventTarget(event.target)) {
      return;
    }

    if (event.key === 'Delete' || event.key === 'Backspace') {
      if (!selectedKeyframeId) {
        return;
      }

      event.preventDefault();
      deleteSelectedKeyframe();
      return;
    }

    if (event.key === 'Escape' && selectedKeyframeId) {
      event.preventDefault();
      onSelectedKeyframeChange(null);
      return;
    }

    if (event.key === 'ArrowLeft' && selectedKeyframe) {
      event.preventDefault();
      moveSelectedKeyframeByStep(-1);
      return;
    }

    if (event.key === 'ArrowRight' && selectedKeyframe) {
      event.preventDefault();
      moveSelectedKeyframeByStep(1);
      return;
    }

    onKeyDown(event);
  };
  const handleExpandedPointerDown = (event: React.PointerEvent<HTMLDivElement>): void => {
    const targetElement = getTimelineEventTargetElement(event.target);
    const clickedKeyframe = targetElement?.closest('[data-slot="timeline-keyframe"]');
    const clickedInteractiveElement = isTimelineInteractiveElement(event.target);

    if (!clickedKeyframe && !clickedInteractiveElement && selectedKeyframeId) {
      onSelectedKeyframeChange(null);
    }

    if (clickedInteractiveElement && !clickedKeyframe) {
      return;
    }

    onPointerDown(event);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-slot="timeline-expanded">
      <div className="relative grid h-9 min-w-0 shrink-0 grid-cols-[164px_minmax(0,1fr)_36px] after:pointer-events-none after:absolute after:inset-x-0 after:-bottom-px after:h-px after:bg-[color:color-mix(in_oklab,var(--border)_20%,transparent)]">
        <div className="flex min-w-0 items-center px-3 text-[11px] leading-4 text-[color:color-mix(in_oklab,var(--foreground)_75%,transparent)] select-none">
          <span className="min-w-0 truncate opacity-60">Properties</span>
        </div>
        <div className="relative min-w-0 text-[10px] leading-none text-[color:color-mix(in_oklab,var(--muted-foreground)_80%,transparent)] tabular-nums">
          <div
            className="absolute top-[13px] h-2 overflow-visible"
            data-slot="timeline-expanded-ruler-labels"
            style={{ left: timelineRulerLeftInsetPx, right: timelineRulerRightInsetPx }}
          >
            {getTimelineRulerTicks(durationSeconds).map((tick, index, ticks) => (
              <span
                className="absolute top-0 -translate-x-1/2 text-center"
                key={tick.toFixed(2)}
                style={{ left: `${(index / (ticks.length - 1)) * 100}%` }}
              >
                {Math.round(tick)}
              </span>
            ))}
          </div>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute bottom-0 h-2"
            data-slot="timeline-expanded-ruler"
            style={{ left: timelineRulerLeftInsetPx, right: timelineRulerRightInsetPx }}
          >
            {getTimelineRulerMarkRatios().map((ratio, index) => (
              <span
                className={cn(
                  'absolute bottom-0 w-px -translate-x-1/2',
                  index % 8 === 0
                    ? 'h-2.5 bg-[color:color-mix(in_oklab,var(--border)_20%,transparent)]'
                    : 'h-1.5 bg-[color:color-mix(in_oklab,var(--border)_10%,transparent)]',
                )}
                data-major-tick={index % 8 === 0 ? 'true' : undefined}
                key={ratio}
                style={{ left: `${ratio * 100}%` }}
              />
            ))}
          </div>
        </div>
        <div aria-hidden="true" className="min-w-0" />
      </div>
      <div
        aria-label="Playback position"
        aria-valuemax={Number(formatTimelineSeconds(durationSeconds))}
        aria-valuemin={0}
        aria-valuenow={Number(formatTimelineSeconds(currentTimeSeconds))}
        className="group/timeline-expanded-scrubber relative min-h-0 flex-1 touch-none overflow-visible outline-none select-none"
        data-dragging={isScrubbing ? 'true' : undefined}
        data-slot="timeline-expanded-scrubber"
        data-timeline-track-end={timelineExpandedTrackEndOffsetPx}
        data-timeline-track-start={timelineExpandedTrackStartOffsetPx}
        onKeyDown={handleExpandedKeyDown}
        onLostPointerCapture={onLostPointerCapture}
        onPointerCancel={onPointerUp}
        onPointerDown={handleExpandedPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        ref={stripRef}
        role="slider"
        tabIndex={0}
      >
        <span
          aria-hidden="true"
          className="absolute top-0 bottom-0 z-20 w-px -translate-x-1/2 bg-[color:var(--foreground)]"
          data-slot="timeline-expanded-playhead"
          style={trackPlayheadStyle}
        />
        <span
          aria-hidden="true"
          className={cn(
            'absolute top-0 bottom-0 z-[25] -translate-x-1/2 cursor-ew-resize',
            isScrubbing && 'cursor-grabbing',
          )}
          data-slot="timeline-expanded-playhead-hit-area"
          style={{ ...trackPlayheadStyle, width: timelinePlayheadHitAreaWidthPx }}
        />
        <span
          aria-hidden="true"
          className={cn(
            'absolute top-[-1px] z-30 size-[9px] -translate-x-1/2 -translate-y-1/2 cursor-ew-resize rounded-[2px] bg-[color:var(--foreground)] shadow-[0_2px_2px_color-mix(in_oklab,var(--background)_20%,transparent)] transition-transform duration-[120ms] ease-out',
            isScrubbing && 'scale-[1.25] cursor-grabbing',
          )}
          data-slot="timeline-expanded-playhead-handle"
          style={trackPlayheadStyle}
        />
        <motion.div
          animate={{ opacity: keyframeGroups.length === 0 ? 1 : 0 }}
          aria-hidden={keyframeGroups.length === 0 ? undefined : 'true'}
          className="pointer-events-none absolute inset-0 flex min-h-0 items-center justify-center px-4 text-center text-[11px] leading-4 text-[color:color-mix(in_oklab,var(--foreground)_30%,transparent)]"
          initial={false}
          transition={timelineKeyframePresenceTransition}
        >
          Add your first keyframe from the properties panel.
        </motion.div>
        <AnimatePresence initial={false}>
          {keyframeGroups.map((group) => (
            <TimelineKeyframeRow
              durationSeconds={durationSeconds}
              group={group}
              isScrubbing={isScrubbing}
              key={group.controlId}
              onChangeKeyframeEasing={onChangeKeyframeEasing}
              onDeleteControlKeyframes={onDeleteControlKeyframes}
              onKeyframeDragStart={onKeyframeDragStart}
              onMoveKeyframe={onMoveKeyframe}
              onSelectedKeyframeChange={onSelectedKeyframeChange}
              selectedKeyframeId={selectedKeyframeId}
            />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
