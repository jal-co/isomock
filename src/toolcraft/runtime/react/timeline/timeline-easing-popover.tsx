'use client';

import * as React from 'react';
import { Button, Popover, PopoverContent, PopoverTrigger } from '@/toolcraft/ui';

import type { ToolcraftTimelineKeyframeEasing } from '../../state/types';
import { getToolcraftTimelineKeyframeEasing } from './timeline-easing-model';
import { TimelineEasingCurveIcon } from './timeline-easing-icons';
import { TimelineEasingPopoverContent } from './timeline-easing-popover-content';
import {
  getTimelineEasingPopoverAnchor,
  stopTimelineEasingEvent,
} from './timeline-easing-popover-layout';

export function TimelineKeyframeEasingPopover({
  easing,
  label,
  onChange,
}: {
  easing?: ToolcraftTimelineKeyframeEasing;
  label: string;
  onChange?: (easing: ToolcraftTimelineKeyframeEasing) => void;
}): React.JSX.Element {
  const resolvedEasing = getToolcraftTimelineKeyframeEasing(easing);

  return (
    <Popover modal={false}>
      <PopoverTrigger
        render={
          <Button
            aria-label={`Edit ${label} keyframe curve`}
            className="text-[color:color-mix(in_oklab,var(--foreground)_75%,transparent)] hover:text-[color:var(--foreground)] data-popup-open:text-[color:var(--foreground)]"
            onClick={stopTimelineEasingEvent}
            onPointerDown={stopTimelineEasingEvent}
            size="icon-sm"
            type="button"
            variant="ghost"
          />
        }
      >
        <TimelineEasingCurveIcon easing={resolvedEasing} size={16} />
      </PopoverTrigger>
      <PopoverContent
        align="center"
        anchor={getTimelineEasingPopoverAnchor}
        className="toolcraft-panel-surface isolate w-auto gap-0 overflow-hidden rounded-lg border p-0 supports-backdrop-filter:backdrop-blur-2xl supports-backdrop-filter:backdrop-saturate-150"
        data-timeline-keyframe-easing-popover=""
        onClick={stopTimelineEasingEvent}
        onPointerDown={stopTimelineEasingEvent}
        side="bottom"
        sideOffset={6}
      >
        <TimelineEasingPopoverContent
          easing={resolvedEasing}
          onChange={(nextEasing) => onChange?.(nextEasing)}
        />
      </PopoverContent>
    </Popover>
  );
}
