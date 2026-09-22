'use client';

import * as React from 'react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { PrimitiveArrowIcon } from '@/toolcraft/ui';
import { Pause, Play, Repeat, Repeat1 } from 'lucide-react';

import { clampToolcraftTimelineTime } from '../../state/timeline-values';
import { TimelineIconButton } from './timeline-icon-button';

type TimelinePanelHeaderProps = {
  canExpand: boolean;
  currentTimeSeconds: number;
  durationSeconds: number;
  isExpanded: boolean;
  isLooping: boolean;
  isPlaying: boolean;
  isScrubbing: boolean;
  playbackReady: boolean;
  onDurationCommit: (value: string) => void;
  onScrubKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  onScrubLostPointerCapture: () => void;
  onScrubPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  onScrubPointerMove: (event: React.PointerEvent<HTMLDivElement>) => void;
  onScrubPointerUp: (event: React.PointerEvent<HTMLDivElement>) => void;
  onToggleExpanded: () => void;
  onToggleLoop: () => void;
  onTogglePlayback: () => void;
  stripRef: React.RefObject<HTMLDivElement | null>;
  variant: 'compact' | 'extended';
};

type TimelinePanelMaskProps = {
  currentTimeSeconds: number;
  durationSeconds: number;
  isHandleVisible: boolean;
};

function cn(...classNames: Array<string | false | null | undefined>): string {
  return classNames.filter(Boolean).join(' ');
}

function formatTimelineSeconds(value: number): string {
  return value.toFixed(2);
}

function formatTimelineDisplaySeconds(value: number): string {
  if (!Number.isFinite(value)) {
    return '0';
  }

  return String(Number.parseFloat(value.toFixed(2)));
}

function formatDurationValueLabel(value: number): string {
  return `${Number.parseFloat(value.toFixed(2))}s`;
}

function formatTimelineHeaderTimeLabel({
  currentTimeSeconds,
  durationSeconds,
}: {
  currentTimeSeconds: number;
  durationSeconds: number;
}): string {
  return `${formatTimelineSeconds(currentTimeSeconds)} / ${formatTimelineDisplaySeconds(
    durationSeconds,
  )}s`;
}

function getTimelineProgressRatio(currentTimeSeconds: number, durationSeconds: number): number {
  if (durationSeconds <= 0) {
    return 0;
  }

  return clampToolcraftTimelineTime(currentTimeSeconds, durationSeconds) / durationSeconds;
}

function getTimelineProgressPercent(currentTimeSeconds: number, durationSeconds: number): string {
  return `${getTimelineProgressRatio(currentTimeSeconds, durationSeconds) * 100}%`;
}

function getTimelineHandlePosition(currentTimeSeconds: number, durationSeconds: number): string {
  const progressPercent = getTimelineProgressPercent(currentTimeSeconds, durationSeconds);
  const progressRatio = getTimelineProgressRatio(currentTimeSeconds, durationSeconds);
  const offsetPx = Number((5 - progressRatio * 10).toFixed(4));

  if (offsetPx < 0) {
    return `calc(${progressPercent} - ${Math.abs(offsetPx)}px)`;
  }

  if (offsetPx > 0) {
    return `calc(${progressPercent} + ${offsetPx}px)`;
  }

  return progressPercent;
}

function TimelinePanelDivider(): React.JSX.Element {
  return (
    <span
      aria-hidden="true"
      className="block h-5 w-px shrink-0 rounded-full bg-[color:color-mix(in_oklab,var(--border)_8%,transparent)]"
      data-slot="timeline-panel-divider"
    />
  );
}

export function TimelinePanelMask({
  currentTimeSeconds,
  durationSeconds,
  isHandleVisible,
}: TimelinePanelMaskProps): React.JSX.Element {
  const progressRatio = getTimelineProgressRatio(currentTimeSeconds, durationSeconds);
  const progressPercent = getTimelineProgressPercent(currentTimeSeconds, durationSeconds);
  const progressMask =
    progressRatio >= 1 && isHandleVisible
      ? 'linear-gradient(to right, transparent 0%, black 5%, black 100%)'
      : 'linear-gradient(to right, transparent 0%, black 5%, black 95%, transparent 100%)';

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 inset-y-[-1px] overflow-hidden rounded-t-lg rounded-b-lg"
      data-slot="timeline-panel-mask"
    >
      <span
        className="absolute inset-x-1 bottom-0 h-px [mask-image:var(--timeline-progress-edge-fade-mask)] [-webkit-mask-image:var(--timeline-progress-edge-fade-mask)]"
        data-slot="timeline-playback-line"
        style={
          {
            '--timeline-progress-edge-fade-mask': progressMask,
          } as CSSProperties
        }
      >
        <span
          className="absolute bottom-0 left-0 h-px rounded-b-lg bg-[color:color-mix(in_oklab,var(--link)_90%,transparent)]"
          data-slot="timeline-playback-progress"
          style={{ width: progressRatio <= 0 ? '0px' : progressPercent }}
        />
      </span>
    </div>
  );
}

function TimelinePlaybackStrip({
  currentTimeSeconds,
  durationSeconds,
  isScrubbing,
  onKeyDown,
  onLostPointerCapture,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  stripRef,
}: {
  currentTimeSeconds: number;
  durationSeconds: number;
  isScrubbing: boolean;
  onKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  onLostPointerCapture: () => void;
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: React.PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: React.PointerEvent<HTMLDivElement>) => void;
  stripRef: React.RefObject<HTMLDivElement | null>;
}): React.JSX.Element {
  const handlePosition = getTimelineHandlePosition(currentTimeSeconds, durationSeconds);

  return (
    <div
      aria-label="Playback position"
      aria-valuemax={Number(formatTimelineSeconds(durationSeconds))}
      aria-valuemin={0}
      aria-valuenow={Number(formatTimelineSeconds(currentTimeSeconds))}
      className={cn(
        'group/timeline-strip absolute right-[-11px] bottom-[-5px] left-[-5px] z-0 h-2 cursor-ew-resize touch-none outline-none',
        isScrubbing && 'cursor-grabbing',
      )}
      data-dragging={isScrubbing ? 'true' : undefined}
      onLostPointerCapture={onLostPointerCapture}
      onKeyDown={onKeyDown}
      onPointerCancel={onPointerUp}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      ref={stripRef}
      role="slider"
      tabIndex={0}
    >
      <span
        aria-hidden="true"
        className={cn(
          'absolute bottom-px size-2 -translate-x-1/2 translate-y-1/2 rounded-full bg-[color:var(--link)] opacity-0 shadow-[0_2px_2px_color-mix(in_oklab,var(--background)_70%,transparent)] transition-[opacity,transform] duration-[120ms] ease-out before:absolute before:inset-[-4px] before:content-[""] group-hover/timeline-panel-surface:opacity-100 group-hover/timeline-strip:opacity-100 group-focus-visible/timeline-strip:opacity-100',
          isScrubbing && 'scale-110 opacity-100',
        )}
        data-slot="timeline-playback-handle"
        style={{ left: handlePosition }}
      />
    </div>
  );
}

function selectTimelineEditableText(node: HTMLElement): void {
  const selection = window.getSelection();

  if (!selection) {
    return;
  }

  const range = document.createRange();
  range.selectNodeContents(node);
  selection.removeAllRanges();
  selection.addRange(range);
}

function TimelineDurationValue({
  durationSeconds,
  onCommit,
}: {
  durationSeconds: number;
  onCommit: (value: string) => void;
}): React.JSX.Element {
  const [isEditing, setIsEditing] = useState(false);
  const editorRef = useRef<HTMLSpanElement>(null);
  const valueLabel = formatDurationValueLabel(durationSeconds);

  useEffect(() => {
    if (!isEditing) {
      return;
    }

    const editor = editorRef.current;

    if (!editor) {
      return;
    }

    editor.textContent = valueLabel;
    editor.focus();
    selectTimelineEditableText(editor);
  }, [isEditing, valueLabel]);

  function commitDraft(): void {
    onCommit(editorRef.current?.textContent ?? valueLabel);
    setIsEditing(false);
  }

  if (isEditing) {
    return (
      <span
        aria-label="timeline duration"
        className="block h-5 min-w-[3ch] !cursor-text overflow-hidden whitespace-nowrap rounded bg-[color:color-mix(in_oklab,var(--foreground)_8%,transparent)] px-1 font-sans text-xs leading-5 text-[color:var(--foreground)] outline-none tabular-nums"
        contentEditable
        data-slot="timeline-duration-editor"
        key="duration-editor"
        onBlur={commitDraft}
        onFocus={(event) => selectTimelineEditableText(event.currentTarget)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            commitDraft();
          }

          if (event.key === 'Escape') {
            event.preventDefault();
            setIsEditing(false);
          }
        }}
        onPointerDown={(event) => event.stopPropagation()}
        ref={editorRef}
        role="textbox"
        suppressContentEditableWarning
        tabIndex={0}
      />
    );
  }

  return (
    <button
      aria-label="Edit timeline duration"
      className="block h-5 min-w-[3ch] shrink-0 !cursor-text overflow-hidden rounded px-1 font-sans text-xs leading-5 text-[color:var(--muted-foreground)] tabular-nums transition-colors duration-150 ease-out group-hover/timeline-panel-header:bg-[color:color-mix(in_oklab,var(--foreground)_8%,transparent)] focus-visible:bg-[color:color-mix(in_oklab,var(--foreground)_8%,transparent)] focus-visible:outline-none"
      data-slot="timeline-duration-display"
      key="duration-display"
      onClick={(event) => {
        event.stopPropagation();
        setIsEditing(true);
      }}
      onPointerDown={(event) => event.stopPropagation()}
      type="button"
    >
      {valueLabel}
    </button>
  );
}

export function TimelinePanelHeader({
  canExpand,
  currentTimeSeconds,
  durationSeconds,
  isExpanded,
  isLooping,
  isPlaying,
  isScrubbing,
  playbackReady,
  onDurationCommit,
  onScrubKeyDown,
  onScrubLostPointerCapture,
  onScrubPointerDown,
  onScrubPointerMove,
  onScrubPointerUp,
  onToggleExpanded,
  onToggleLoop,
  onTogglePlayback,
  stripRef,
  variant,
}: TimelinePanelHeaderProps): React.JSX.Element {
  if (variant === 'compact') {
    return (
      <div
        className="relative flex h-full min-w-0 shrink-0 items-center justify-center"
        data-slot="timeline-panel-header"
        data-timeline-panel-variant="compact"
      >
        <div
          className="relative z-10 inline-flex shrink-0 items-center"
          data-slot="timeline-transport-controls"
        >
          <TimelineIconButton
            disabled={!playbackReady}
            label={isPlaying ? 'Pause playback' : 'Play playback'}
            onClick={onTogglePlayback}
          >
            {isPlaying ? <Pause /> : <Play />}
          </TimelineIconButton>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'group/timeline-panel-header relative flex min-w-0 shrink-0 items-center gap-1',
        isExpanded
          ? 'h-9 border-b border-[color:color-mix(in_oklab,var(--border)_8%,transparent)] p-1'
          : 'h-full',
      )}
      data-slot="timeline-panel-header"
    >
      <div
        className="relative z-10 inline-flex shrink-0 items-center gap-1"
        data-slot="timeline-transport-controls"
      >
        <TimelineIconButton
          disabled={!playbackReady}
          label={isPlaying ? 'Pause playback' : 'Play playback'}
          onClick={onTogglePlayback}
        >
          {isPlaying ? <Pause /> : <Play />}
        </TimelineIconButton>
        <TimelineIconButton
          label={isLooping ? 'Disable loop' : 'Enable loop'}
          onClick={onToggleLoop}
        >
          {isLooping ? <Repeat data-icon="loop-enabled" /> : <Repeat1 data-icon="loop-disabled" />}
        </TimelineIconButton>
      </div>
      <TimelinePanelDivider />
      <div className="ml-2 inline-flex shrink-0 items-center gap-1 text-xs leading-5 text-[color:color-mix(in_oklab,var(--foreground)_90%,transparent)]">
        <span>{isExpanded ? 'Duration:' : 'Dur:'}</span>
        <TimelineDurationValue
          durationSeconds={durationSeconds}
          onCommit={onDurationCommit}
        />
      </div>
      <span
        className={cn(
          'flex-1 cursor-default overflow-hidden text-right font-sans text-[11px] leading-5 whitespace-nowrap text-[color:var(--muted-foreground)] tabular-nums [contain:paint] select-none',
          isExpanded ? 'min-w-[5.5rem]' : 'min-w-0',
        )}
      >
        {formatTimelineHeaderTimeLabel({ currentTimeSeconds, durationSeconds })}
      </span>
      {canExpand ? (
        <span className="relative z-10 flex shrink-0" data-slot="timeline-panel-expand-toggle">
          <TimelineIconButton
            label={isExpanded ? 'Collapse timeline panel' : 'Expand timeline panel'}
            onClick={onToggleExpanded}
            tooltipSide="top"
          >
            <PrimitiveArrowIcon direction={isExpanded ? 'up' : 'down'} />
          </TimelineIconButton>
        </span>
      ) : null}
      {isExpanded ? null : (
        <TimelinePlaybackStrip
          currentTimeSeconds={currentTimeSeconds}
          durationSeconds={durationSeconds}
          isScrubbing={isScrubbing}
          onKeyDown={onScrubKeyDown}
          onLostPointerCapture={onScrubLostPointerCapture}
          onPointerDown={onScrubPointerDown}
          onPointerMove={onScrubPointerMove}
          onPointerUp={onScrubPointerUp}
          stripRef={stripRef}
        />
      )}
    </div>
  );
}
