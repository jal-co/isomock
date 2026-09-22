'use client';

import type * as React from 'react';
import { useEffect, useState } from 'react';

const timelineEasingPopoverWidthPx = 688;

export function stopTimelineEasingEvent(
  event: React.MouseEvent<HTMLElement> | React.PointerEvent<HTMLElement>,
): void {
  event.stopPropagation();
}

export function getTimelineEasingPopoverAnchor(): HTMLElement | null {
  if (typeof document === 'undefined') {
    return null;
  }

  return (
    document.querySelector<HTMLElement>('[data-slot="timeline-panel"][data-expanded-height]') ??
    document.querySelector<HTMLElement>('[data-slot="timeline-panel"]')
  );
}

function getTimelineEasingPopoverWidthElement(): HTMLElement | null {
  const panel = getTimelineEasingPopoverAnchor();

  return panel?.querySelector<HTMLElement>('[data-slot="timeline-panel-header"]') ?? panel;
}

export function useTimelineEasingPopoverWidth(): number {
  const [popoverWidth, setPopoverWidth] = useState(timelineEasingPopoverWidthPx);

  useEffect(() => {
    const widthElement = getTimelineEasingPopoverWidthElement();

    if (!widthElement) {
      return;
    }

    const updatePopoverWidth = (): void => {
      const nextWidth = widthElement.getBoundingClientRect().width;

      if (nextWidth > 0) {
        setPopoverWidth(nextWidth);
      }
    };

    updatePopoverWidth();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updatePopoverWidth);

      return () => {
        window.removeEventListener('resize', updatePopoverWidth);
      };
    }

    const observer = new ResizeObserver(updatePopoverWidth);

    observer.observe(widthElement);

    return () => {
      observer.disconnect();
    };
  }, []);

  return popoverWidth;
}
