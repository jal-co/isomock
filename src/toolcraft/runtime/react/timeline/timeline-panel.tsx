'use client';

import * as React from 'react';
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { PanelHoverSurface } from '@/toolcraft/ui/components/panel/internal-panel-hover';
import { motion } from 'motion/react';

import type {
  ToolcraftPanelState,
  ToolcraftState,
  ToolcraftTimelineKeyframeEasing,
  ToolcraftTimelineKeyframeGroup,
} from '../../state/types';
import { isTimelineReadyForPlayback } from '../../state/timeline-readiness';
import {
  clampToolcraftTimelineDurationSeconds,
  getToolcraftTimelineKeyframeId,
} from '../../state/timeline-values';
import {
  getTimelineEventTargetElement,
  isEditableTimelineEventTarget,
  isTimelineInteractiveElement,
} from './timeline-event-targets';
import { TimelineExpandedContent } from './timeline-expanded-content';
import { findTimelineKeyframe } from './timeline-keyframes';
import {
  TimelinePanelHeader,
  TimelinePanelMask,
} from './timeline-panel-header';
import {
  timelinePanelExpandedWidthPx,
  useTimelinePanelResponsiveLayout,
} from './timeline-panel-responsive-layout';
import { timelineKeyframeRowHeightPx } from './timeline-panel-layout';
import { useTimelineClock, useTimelineScrubber } from './timeline-playback-hooks';
import { PanelContainer } from '../panel-host/panel-host';
import { useToolcraftPanelBinding } from '../panel-host/use-toolcraft-panel-binding';
import type { PanelPlacement, PanelStateChange } from '../panel-host/panel-host-types';
import { useToolcraftStore } from '../app-shell/toolcraft-store-context';
import {
  useToolcraftCommittedSelector,
  useToolcraftDependencySelector,
} from '../app-shell/toolcraft-selectors';
import { useToolcraftDispatch } from '../app-shell/use-toolcraft';

type TimelinePanelProps = {
  className?: string;
  defaultExpanded?: boolean;
  framed?: boolean;
  onPanelStateChange?: PanelStateChange;
  panelPlacement?: PanelPlacement;
  panelState?: ToolcraftPanelState;
  variant?: 'compact' | 'extended';
};

function cn(...classNames: Array<string | false | null | undefined>): string {
  return classNames.filter(Boolean).join(' ');
}

const timelinePanelCollapsedSize = { height: 36 } as const;
const timelinePanelCompactWidthPx = 36;
const timelinePanelCollapsedWidthPx = 256;
const timelinePanelSurfaceBorderHeightPx = 2;
const timelinePanelHeaderHeightPx = 36;
const timelineExpandedRulerHeightPx = 36;
const timelineEmptyStateHeightPx = timelineKeyframeRowHeightPx;
const maxVisibleTimelineKeyframeRows = 8;
const timelineKeyframeListMaxHeightPx =
  maxVisibleTimelineKeyframeRows * timelineKeyframeRowHeightPx;
const timelinePanelExpandCollapseTransition = {
  damping: 34,
  mass: 0.85,
  stiffness: 330,
  type: 'spring',
} as const;
const timelinePanelResizeTransition = {
  duration: 0.16,
  ease: [0.22, 1, 0.36, 1],
} as const;
const playbackDependencies = [{ kind: 'playback' }] as const;
const selectSchema = (state: ToolcraftState) => state.schema;
const selectMediaAssets = (state: ToolcraftState) => state.mediaAssets;
const selectCommittedTimeline = (state: ToolcraftState) => state.timeline;
const selectCurrentTimeSeconds = (state: ToolcraftState) =>
  state.timeline.currentTimeSeconds;

function getTimelinePanelExpandedSize(keyframeGroups: readonly ToolcraftTimelineKeyframeGroup[]): {
  height: number;
  width: number;
} {
  const rowCount = keyframeGroups.length;
  const rowAreaHeight =
    rowCount > 0
      ? Math.min(rowCount * timelineKeyframeRowHeightPx, timelineKeyframeListMaxHeightPx)
      : timelineEmptyStateHeightPx;

  return {
    height:
      timelinePanelSurfaceBorderHeightPx +
      timelinePanelHeaderHeightPx +
      timelineExpandedRulerHeightPx +
      rowAreaHeight,
    width: timelinePanelExpandedWidthPx,
  };
}

export function TimelinePanel({
  className,
  defaultExpanded = false,
  framed = true,
  onPanelStateChange,
  panelPlacement,
  panelState,
  variant = 'extended',
}: TimelinePanelProps): React.JSX.Element | null {
  const dispatch = useToolcraftDispatch();
  const panelBinding = useToolcraftPanelBinding({
    onPanelStateChange,
    panelId: 'timeline',
    panelState,
  });
  const resolvedPanelState = panelBinding.panelState;
  const store = useToolcraftStore();
  const schema = useToolcraftCommittedSelector(selectSchema);
  const mediaAssets = useToolcraftCommittedSelector(selectMediaAssets);
  const timeline = useToolcraftCommittedSelector(selectCommittedTimeline);
  const currentTimeSeconds = useToolcraftDependencySelector(
    selectCurrentTimeSeconds,
    Object.is,
    playbackDependencies,
  );

  if (!schema.panels.timeline) {
    return null;
  }

  const keyframesEnabled = schema.assembly.capabilities.includes('timeline.keyframes');
  const playbackReady = isTimelineReadyForPlayback(schema, mediaAssets);

  const {
    durationSeconds,
    expanded,
    isLooping,
    isPlaying,
    keyframeGroups,
    selectedKeyframeId,
  } = timeline;
  const [defaultExpandedPending, setDefaultExpandedPending] = useState(defaultExpanded);
  const [isHoverPaused, setIsHoverPaused] = useState(false);
  const displayedIsPlaying = playbackReady && isPlaying;
  const isCompact = variant === 'compact';
  const isExpanded = !isCompact && keyframesEnabled && (expanded || defaultExpandedPending);
  const expandedPanelSize = getTimelinePanelExpandedSize(keyframeGroups);
  const previousIsExpandedRef = useRef(isExpanded);
  const isExpandCollapseTransition = previousIsExpandedRef.current !== isExpanded;
  const timelinePanelTransition = isExpandCollapseTransition
    ? timelinePanelExpandCollapseTransition
    : timelinePanelResizeTransition;

  useEffect(() => {
    previousIsExpandedRef.current = isExpanded;
  }, [isExpanded]);
  useEffect(() => {
    if (playbackReady) {
      return;
    }

    if (currentTimeSeconds !== 0) {
      dispatch({ currentTimeSeconds: 0, type: 'timeline.setCurrentTime' });
    }

    if (isPlaying) {
      dispatch({ isPlaying: false, type: 'timeline.setPlaying' });
    }
  }, [currentTimeSeconds, dispatch, isPlaying, playbackReady]);
  useEffect(() => {
    if (!defaultExpanded || !keyframesEnabled) {
      return;
    }

    dispatch({ expanded: true, type: 'timeline.setExpanded' });
    setDefaultExpandedPending(false);
  }, [defaultExpanded, dispatch, keyframesEnabled]);

  const setCurrentTimeSeconds = useCallback(
    (nextValue: React.SetStateAction<number>): void => {
      const currentTime = store.getState().timeline.currentTimeSeconds;
      const resolvedValue =
        typeof nextValue === 'function'
          ? nextValue(currentTime)
          : nextValue;

      store.dispatchTransient({
        currentTimeSeconds: resolvedValue,
        type: 'timeline.setCurrentTime',
      });
    },
    [store],
  );
  const commitCurrentTimeSeconds = useCallback((): void => {
    store.commitTransient('playback');
  }, [store]);
  const getCurrentTimeSeconds = useCallback(
    (): number => store.getState().timeline.currentTimeSeconds,
    [store],
  );
  const setIsPlaying = useCallback(
    (nextValue: React.SetStateAction<boolean>): void => {
      const currentIsPlaying = store.getState().timeline.isPlaying;
      const resolvedValue =
        typeof nextValue === 'function' ? nextValue(currentIsPlaying) : nextValue;

      dispatch({ isPlaying: resolvedValue, type: 'timeline.setPlaying' });
    },
    [dispatch, store],
  );
  const setSelectedKeyframeId = useCallback(
    (keyframeId: string | null): void => {
      dispatch({ keyframeId, type: 'timeline.selectKeyframe' });
    },
    [dispatch],
  );
  const scrubber = useTimelineScrubber({
    commitCurrentTimeSeconds,
    currentTimeSeconds,
    disabled: !playbackReady,
    durationSeconds,
    setCurrentTimeSeconds,
    setIsPlaying,
  });
  const deleteKeyframe = useCallback(
    (keyframeId: string): void => {
      dispatch({ keyframeId, type: 'timeline.deleteKeyframe' });
    },
    [dispatch],
  );
  const moveKeyframe = useCallback(
    (keyframeId: string, nextTimeSeconds: number): string | null => {
      const targetKeyframe = findTimelineKeyframe(keyframeGroups, keyframeId);

      if (!targetKeyframe) {
        return null;
      }

      const nextSelectedKeyframeId = getToolcraftTimelineKeyframeId(
        targetKeyframe.controlId,
        nextTimeSeconds,
      );

      dispatch({
        keyframeId,
        timeSeconds: nextTimeSeconds,
        type: 'timeline.moveKeyframe',
      });

      return nextSelectedKeyframeId;
    },
    [dispatch, keyframeGroups],
  );

  useTimelineClock({
    durationSeconds,
    getCurrentTimeSeconds,
    isHoverPaused,
    isLooping,
    isPlaying: displayedIsPlaying,
    isScrubbing: scrubber.isScrubbing,
    setCurrentTimeSeconds,
    setIsPlaying,
  });

  useEffect(() => {
    if (!selectedKeyframeId || typeof document === 'undefined') {
      return;
    }

    const handleDocumentKeyDown = (event: KeyboardEvent): void => {
      if (
        event.defaultPrevented ||
        (event.key !== 'Delete' && event.key !== 'Backspace' && event.key !== 'Escape') ||
        isEditableTimelineEventTarget(event.target)
      ) {
        return;
      }

      event.preventDefault();

      if (event.key === 'Escape') {
        setSelectedKeyframeId(null);
        return;
      }

      deleteKeyframe(selectedKeyframeId);
    };

    document.addEventListener('keydown', handleDocumentKeyDown);

    return () => {
      document.removeEventListener('keydown', handleDocumentKeyDown);
    };
  }, [deleteKeyframe, selectedKeyframeId]);

  useEffect(() => {
    if (!selectedKeyframeId || typeof document === 'undefined') {
      return;
    }

    const handleDocumentPointerDown = (event: PointerEvent): void => {
      const targetElement = getTimelineEventTargetElement(event.target);
      const clickedKeyframe = targetElement?.closest('[data-slot="timeline-keyframe"]');
      const clickedEasingPopover = targetElement?.closest(
        '[data-timeline-keyframe-easing-popover]',
      );
      const clickedTimelinePanel = targetElement?.closest('[data-slot="timeline-panel"]');
      const clickedTimelineInteractiveElement =
        clickedTimelinePanel && isTimelineInteractiveElement(event.target);

      if (!clickedKeyframe && !clickedEasingPopover && !clickedTimelineInteractiveElement) {
        setSelectedKeyframeId(null);
      }
    };

    document.addEventListener('pointerdown', handleDocumentPointerDown, { capture: true });

    return () => {
      document.removeEventListener('pointerdown', handleDocumentPointerDown, { capture: true });
    };
  }, [selectedKeyframeId]);

  const commitDurationValue = (nextValue: string): void => {
    const nextDuration = clampToolcraftTimelineDurationSeconds(Number.parseFloat(nextValue));

    dispatch({ durationSeconds: nextDuration, type: 'timeline.setDuration' });
  };
  const deleteControlKeyframes = (controlId: string): void => {
    dispatch({ controlId, type: 'timeline.deleteControlKeyframes' });
  };
  const changeKeyframeEasing = (
    keyframeId: string,
    nextEasing: ToolcraftTimelineKeyframeEasing,
  ): void => {
    dispatch({ easing: nextEasing, keyframeId, type: 'timeline.changeKeyframeEasing' });
  };
  const resolvedPanelPlacement = panelPlacement ?? (framed ? 'frame' : 'surface');
  const shouldConstrainToContainer = resolvedPanelPlacement === 'surface';
  const { panelRef: timelineSurfaceRef, responsiveLayout } = useTimelinePanelResponsiveLayout(
    isExpanded && !shouldConstrainToContainer,
  );
  const unconstrainedTimelinePanelWidth = isCompact
    ? timelinePanelCompactWidthPx
    : isExpanded
    ? expandedPanelSize.width
    : timelinePanelCollapsedWidthPx;
  const timelinePanelWidth =
    isExpanded && responsiveLayout !== null
      ? Math.min(unconstrainedTimelinePanelWidth, responsiveLayout.width)
      : unconstrainedTimelinePanelWidth;
  const timelinePanelOffsetX =
    isExpanded && responsiveLayout !== null ? responsiveLayout.offsetX : 0;
  const timelinePanelLayoutStyle: CSSProperties = {
    transform: timelinePanelOffsetX !== 0 ? `translateX(${timelinePanelOffsetX}px)` : undefined,
  };
  const timelinePanelAnimation = {
    height: isExpanded ? expandedPanelSize.height : timelinePanelCollapsedSize.height,
    ...(shouldConstrainToContainer
      ? { maxWidth: timelinePanelWidth }
      : { width: timelinePanelWidth }),
  };

  const timelineSurface = (
    <motion.div
      animate={timelinePanelAnimation}
      className={cn(
        'pointer-events-auto origin-top',
        shouldConstrainToContainer ? 'w-full' : 'max-w-full',
        !framed && className,
      )}
      data-expanded-height={isExpanded ? expandedPanelSize.height : undefined}
      data-responsive-width={
        timelinePanelWidth < unconstrainedTimelinePanelWidth ? timelinePanelWidth : undefined
      }
      data-responsive-offset-x={timelinePanelOffsetX !== 0 ? timelinePanelOffsetX : undefined}
      data-hover-paused={isHoverPaused ? 'true' : 'false'}
      data-playback-ready={playbackReady ? 'true' : 'false'}
      data-scrubbing={scrubber.isScrubbing ? 'true' : 'false'}
      data-slot="timeline-panel"
      data-timeline-panel-variant={variant}
      data-toolcraft-timeline-panel-variant={variant}
      initial={false}
      ref={timelineSurfaceRef}
      style={timelinePanelLayoutStyle}
      transition={timelinePanelTransition}
    >
      <PanelHoverSurface
        className={cn(
          'group/timeline-panel-surface relative flex h-full w-full flex-col rounded-t-lg rounded-b-lg',
          isExpanded ? 'overflow-hidden' : 'overflow-visible p-1',
          !isCompact && !isExpanded && !keyframesEnabled && 'pr-3',
        )}
        data-panel-id="timeline"
        onPointerEnter={() => setIsHoverPaused(true)}
        onPointerLeave={(event) => {
          const nextTarget = event.relatedTarget;

          if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
            return;
          }

          setIsHoverPaused(false);
        }}
      >
        {!isCompact && !isExpanded ? (
          <TimelinePanelMask
            currentTimeSeconds={currentTimeSeconds}
            durationSeconds={durationSeconds}
            isHandleVisible={isHoverPaused || scrubber.isScrubbing}
          />
        ) : null}
        <TimelinePanelHeader
          canExpand={keyframesEnabled}
          currentTimeSeconds={currentTimeSeconds}
          durationSeconds={durationSeconds}
          isExpanded={isExpanded}
          isLooping={isLooping}
          isPlaying={displayedIsPlaying}
          isScrubbing={scrubber.isScrubbing}
          playbackReady={playbackReady}
          onDurationCommit={commitDurationValue}
          onScrubKeyDown={scrubber.handleScrubKeyDown}
          onScrubLostPointerCapture={scrubber.handleScrubLostPointerCapture}
          onScrubPointerDown={scrubber.handleScrubPointerDown}
          onScrubPointerMove={scrubber.handleScrubPointerMove}
          onScrubPointerUp={scrubber.handleScrubPointerUp}
          onToggleExpanded={() => {
            setDefaultExpandedPending(false);
            dispatch({ expanded: !isExpanded, type: 'timeline.setExpanded' });
          }}
          onToggleLoop={() => dispatch({ type: 'timeline.toggleLoop' })}
          onTogglePlayback={() => {
            setIsHoverPaused(false);
            if (displayedIsPlaying) {
              setIsPlaying(false);
              return;
            }

            dispatch({ type: 'timeline.togglePlayback' });
          }}
          stripRef={scrubber.stripRef}
          variant={variant}
        />
        {isExpanded && keyframesEnabled ? (
          <TimelineExpandedContent
            currentTimeSeconds={currentTimeSeconds}
            durationSeconds={durationSeconds}
            isScrubbing={scrubber.isScrubbing}
            keyframeGroups={keyframeGroups}
            onChangeKeyframeEasing={changeKeyframeEasing}
            onDeleteControlKeyframes={deleteControlKeyframes}
            onDeleteKeyframe={deleteKeyframe}
            onKeyframeDragStart={() => setIsPlaying(false)}
            onKeyDown={scrubber.handleScrubKeyDown}
            onLostPointerCapture={scrubber.handleScrubLostPointerCapture}
            onMoveKeyframe={moveKeyframe}
            onPointerDown={scrubber.handleScrubPointerDown}
            onPointerMove={scrubber.handleScrubPointerMove}
            onPointerUp={scrubber.handleScrubPointerUp}
            onSelectedKeyframeChange={setSelectedKeyframeId}
            selectedKeyframeId={selectedKeyframeId}
            stripRef={scrubber.stripRef}
          />
        ) : null}
      </PanelHoverSurface>
    </motion.div>
  );

  const panel = (
    <PanelContainer
      onPanelStateChange={panelBinding.onPanelStateChange}
      panelState={resolvedPanelState}
      panelType="timeline"
      placement={resolvedPanelPlacement}
    >
      {timelineSurface}
    </PanelContainer>
  );

  return resolvedPanelState.hidden ? (
    <div data-toolcraft-timeline-panel-hidden="true" hidden>
      {panel}
    </div>
  ) : (
    panel
  );
}

export { TimelinePanel as KeyframesPanel };
