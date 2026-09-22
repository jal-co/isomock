'use client';

import * as React from 'react';
import { useRef, useState, type CSSProperties } from 'react';
import { Eye, EyeOff, Trash2 } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

import type {
  ToolcraftTimelineKeyframe,
  ToolcraftTimelineKeyframeEasing,
  ToolcraftTimelineKeyframeGroup,
} from '../../state/types';
import {
  clampToolcraftTimelineTime,
  getToolcraftTimelineKeyframeId,
  roundToolcraftTimelineKeyframeTime,
} from '../../state/timeline-values';
import { TimelineIconButton } from './timeline-icon-button';
import { TimelineKeyframeEasingPopover } from './timeline-easing-popover';
import {
  getTimelineCalcPositionStyle,
  timelineKeyframePresenceTransition,
  timelineKeyframeRowHeightPx,
  timelineTrackEndInsetPx,
  timelineTrackStartVisualOffsetPx,
} from './timeline-panel-layout';

type TimelineKeyframeDragState = {
  controlId: string;
  didMove: boolean;
  initialTimeSeconds: number;
  keyframeId: string;
  latestTimeSeconds: number;
  pointerId: number;
  trackElement: HTMLElement;
  wasSelectedOnPointerDown: boolean;
};

type TimelineKeyframeRowProps = {
  durationSeconds: number;
  group: ToolcraftTimelineKeyframeGroup;
  isScrubbing: boolean;
  onChangeKeyframeEasing: (keyframeId: string, easing: ToolcraftTimelineKeyframeEasing) => void;
  onDeleteControlKeyframes: (controlId: string) => void;
  onKeyframeDragStart: () => void;
  onMoveKeyframe: (keyframeId: string, timeSeconds: number) => string | null;
  onSelectedKeyframeChange: (keyframeId: string | null) => void;
  selectedKeyframeId: string | null;
};

function cn(...classNames: Array<string | false | null | undefined>): string {
  return classNames.filter(Boolean).join(' ');
}

function formatTimelineSeconds(value: number): string {
  return value.toFixed(2);
}

function getTimelineKeyframePositionStyle(
  timeSeconds: number,
  durationSeconds: number,
): CSSProperties {
  const ratio = Math.max(0, Math.min(1, timeSeconds / durationSeconds));

  return getTimelineCalcPositionStyle(ratio, timelineTrackStartVisualOffsetPx * (1 - ratio));
}

function getTimelineTrackTimeFromClientX({
  clientX,
  durationSeconds,
  trackElement,
}: {
  clientX: number;
  durationSeconds: number;
  trackElement: HTMLElement;
}): number {
  const rect = trackElement.getBoundingClientRect();
  const trackLeft = rect.left + timelineTrackStartVisualOffsetPx;
  const trackWidth = Math.max(
    1,
    rect.width - timelineTrackStartVisualOffsetPx - timelineTrackEndInsetPx,
  );
  const ratio = Math.max(0, Math.min(1, (clientX - trackLeft) / trackWidth));

  return roundToolcraftTimelineKeyframeTime(
    clampToolcraftTimelineTime(durationSeconds * ratio, durationSeconds),
  );
}

export function TimelineKeyframeRow({
  durationSeconds,
  group,
  isScrubbing,
  onChangeKeyframeEasing,
  onDeleteControlKeyframes,
  onKeyframeDragStart,
  onMoveKeyframe,
  onSelectedKeyframeChange,
  selectedKeyframeId,
}: TimelineKeyframeRowProps): React.JSX.Element {
  const [isVisible, setIsVisible] = useState(true);
  const [draftKeyframeTimes, setDraftKeyframeTimes] = useState<Record<string, number>>({});
  const keyframeDragRef = useRef<TimelineKeyframeDragState | null>(null);
  const keyframeClickIntentRef = useRef<{
    didMove: boolean;
    keyframeId: string;
    wasSelectedOnPointerDown: boolean;
  } | null>(null);
  const selectedGroupKeyframe = group.keyframes.find(
    (keyframe) => keyframe.id === selectedKeyframeId,
  );
  const getKeyframeTrackElement = (target: Element): HTMLElement | null =>
    target.closest('[data-slot="timeline-keyframe-track"]');
  const handleKeyframePointerDown = (
    event: React.PointerEvent<HTMLButtonElement>,
    keyframe: ToolcraftTimelineKeyframe,
  ): void => {
    const trackElement = getKeyframeTrackElement(event.currentTarget);

    if (!trackElement) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    onSelectedKeyframeChange(keyframe.id);
    onKeyframeDragStart();
    const wasSelectedOnPointerDown = keyframe.id === selectedKeyframeId;

    keyframeClickIntentRef.current = {
      didMove: false,
      keyframeId: keyframe.id,
      wasSelectedOnPointerDown,
    };
    keyframeDragRef.current = {
      controlId: keyframe.controlId,
      didMove: false,
      initialTimeSeconds: keyframe.timeSeconds,
      keyframeId: keyframe.id,
      latestTimeSeconds: keyframe.timeSeconds,
      pointerId: event.pointerId,
      trackElement,
      wasSelectedOnPointerDown,
    };
  };
  const handleKeyframePointerMove = (event: React.PointerEvent<HTMLButtonElement>): void => {
    const dragState = keyframeDragRef.current;

    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const nextTimeSeconds = getTimelineTrackTimeFromClientX({
      clientX: event.clientX,
      durationSeconds,
      trackElement: dragState.trackElement,
    });

    dragState.latestTimeSeconds = nextTimeSeconds;
    const didMove = nextTimeSeconds !== dragState.initialTimeSeconds;
    dragState.didMove = didMove;

    if (keyframeClickIntentRef.current?.keyframeId === dragState.keyframeId) {
      keyframeClickIntentRef.current.didMove = didMove;
    }

    setDraftKeyframeTimes((currentDrafts) =>
      currentDrafts[dragState.keyframeId] === nextTimeSeconds
        ? currentDrafts
        : { ...currentDrafts, [dragState.keyframeId]: nextTimeSeconds },
    );
  };
  const endKeyframeDrag = (event: React.PointerEvent<HTMLButtonElement>): void => {
    const dragState = keyframeDragRef.current;

    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (dragState.didMove) {
      const nextSelectedKeyframeId = onMoveKeyframe(
        dragState.keyframeId,
        dragState.latestTimeSeconds,
      );

      onSelectedKeyframeChange(
        nextSelectedKeyframeId ??
          getToolcraftTimelineKeyframeId(dragState.controlId, dragState.latestTimeSeconds),
      );
    }

    setDraftKeyframeTimes((currentDrafts) => {
      const nextDrafts = { ...currentDrafts };

      delete nextDrafts[dragState.keyframeId];
      return nextDrafts;
    });
    keyframeDragRef.current = null;
  };

  return (
    <motion.div
      animate={{ height: timelineKeyframeRowHeightPx, opacity: 1 }}
      className={cn(
        'w-full shrink-0 overflow-hidden border-t border-[color:color-mix(in_oklab,var(--border)_6%,transparent)] transition-colors duration-150 ease-out select-none first:border-t-0',
        selectedGroupKeyframe
          ? 'bg-[color:color-mix(in_oklab,var(--foreground)_3%,transparent)]'
          : !isScrubbing && 'hover:bg-[color:color-mix(in_oklab,var(--foreground)_3%,transparent)]',
      )}
      data-scrubbing={isScrubbing ? 'true' : 'false'}
      data-slot="timeline-keyframe-row"
      data-visible={isVisible ? 'true' : 'false'}
      exit={{ height: 0, opacity: 0 }}
      initial={{ height: 0, opacity: 0 }}
      transition={timelineKeyframePresenceTransition}
    >
      <div className="grid h-9 w-full grid-cols-[164px_minmax(0,1fr)_36px] overflow-visible">
        <div className="flex h-full min-w-0 items-center gap-1.5 border-r border-[color:color-mix(in_oklab,var(--border)_6%,transparent)] pr-1.5 pl-1 text-[11px] leading-4 text-[color:color-mix(in_oklab,var(--foreground)_75%,transparent)] select-none">
          <TimelineIconButton
            label={`Toggle ${group.label} visibility`}
            onClick={() => setIsVisible((currentValue) => !currentValue)}
            size="icon-sm"
            tooltipSide="top"
          >
            {isVisible ? (
              <Eye data-icon="visibility-visible" />
            ) : (
              <EyeOff data-icon="visibility-hidden" />
            )}
          </TimelineIconButton>
          <span
            className={cn(
              'block min-w-0 flex-1 truncate pr-2 transition-[color,opacity] duration-150 ease-out',
              !isVisible && 'text-[color:var(--foreground)] opacity-40',
            )}
            title={group.label}
          >
            {group.label}
          </span>
          {selectedGroupKeyframe ? (
            <span className="ml-auto flex shrink-0" data-slot="timeline-keyframe-easing-control">
              <TimelineKeyframeEasingPopover
                easing={selectedGroupKeyframe.easing}
                label={group.label}
                onChange={(nextEasing) =>
                  onChangeKeyframeEasing(selectedGroupKeyframe.id, nextEasing)
                }
              />
            </span>
          ) : null}
        </div>
        <div
          className="relative h-full min-h-0 overflow-visible border-r border-[color:color-mix(in_oklab,var(--border)_6%,transparent)]"
          data-slot="timeline-keyframe-track"
        >
          <div
            className={cn(
              'absolute inset-0 overflow-visible',
              isVisible ? 'text-[color:var(--link)]' : 'text-[color:var(--foreground)]',
            )}
            data-slot="timeline-keyframe-track-content"
            style={{ opacity: isVisible ? undefined : 0.15 }}
          >
            <span
              className={cn(
                'absolute top-1/2 right-0 h-px -translate-y-1/2',
                isVisible
                  ? 'bg-[color:color-mix(in_oklab,currentColor_40%,transparent)]'
                  : 'bg-current',
              )}
              style={{ left: timelineTrackStartVisualOffsetPx }}
            />
            <AnimatePresence initial={false}>
              {group.keyframes.map((keyframe) => {
                const isSelected = keyframe.id === selectedKeyframeId;
                const displayTimeSeconds = draftKeyframeTimes[keyframe.id] ?? keyframe.timeSeconds;

                return (
                  <motion.button
                    animate={{ opacity: 1 }}
                    aria-label={`${group.label} keyframe at ${formatTimelineSeconds(
                      keyframe.timeSeconds,
                    )}s`}
                    aria-pressed={isSelected}
                    className="absolute top-1/2 z-30 m-0 size-2 -translate-x-1/2 -translate-y-1/2 cursor-default appearance-none border-0 bg-transparent p-0 text-current outline-none"
                    data-selected={isSelected ? 'true' : undefined}
                    data-slot="timeline-keyframe"
                    exit={{ opacity: 0 }}
                    initial={{ opacity: 0 }}
                    key={keyframe.id}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      const clickIntent = keyframeClickIntentRef.current;

                      keyframeClickIntentRef.current = null;

                      if (clickIntent?.didMove) {
                        return;
                      }

                      if (clickIntent?.keyframeId === keyframe.id) {
                        onSelectedKeyframeChange(
                          clickIntent.wasSelectedOnPointerDown ? null : keyframe.id,
                        );
                        return;
                      }

                      onSelectedKeyframeChange(isSelected ? null : keyframe.id);
                    }}
                    onPointerCancel={endKeyframeDrag}
                    onPointerDown={(event) => handleKeyframePointerDown(event, keyframe)}
                    onPointerMove={handleKeyframePointerMove}
                    onPointerUp={endKeyframeDrag}
                    style={getTimelineKeyframePositionStyle(displayTimeSeconds, durationSeconds)}
                    title={keyframe.valueLabel}
                    transition={timelineKeyframePresenceTransition}
                    type="button"
                  >
                    <span
                      aria-hidden="true"
                      className={cn(
                        'absolute top-1/2 left-1/2 block size-[7px] -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[1px]',
                        isSelected && isVisible ? 'bg-[color:var(--foreground)]' : 'bg-current',
                      )}
                    />
                  </motion.button>
                );
              })}
            </AnimatePresence>
          </div>
        </div>
        <div className="flex h-full min-w-0 items-center justify-center">
          <TimelineIconButton
            label={`Delete ${group.label} keyframes`}
            onClick={() => {
              onSelectedKeyframeChange(null);
              onDeleteControlKeyframes(group.controlId);
            }}
            size="icon-sm"
            tooltipSide="top"
          >
            <Trash2 />
          </TimelineIconButton>
        </div>
      </div>
    </motion.div>
  );
}
