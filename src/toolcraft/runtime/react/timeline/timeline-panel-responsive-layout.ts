'use client';

import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from 'react';

export const timelinePanelExpandedWidthPx = 688;

const timelinePanelMinResponsiveWidthPx = 320;
const timelinePanelSideCollisionMarginPx = 10;

type TimelinePanelResponsiveLayout = {
  offsetX: number;
  width: number;
};

function doRectsOverlapVertically(first: DOMRect, second: DOMRect): boolean {
  return first.top < second.bottom && first.bottom > second.top;
}

function getTimelinePanelBoundsElement(panel: HTMLElement): HTMLElement | null {
  return panel.closest<HTMLElement>(
    '[data-slot="toolcraft-runtime-app"], [data-toolcraft-panel-stage]',
  );
}

function getTimelinePanelAnchorRect(panel: HTMLElement): DOMRect {
  const panelHost = panel.closest<HTMLElement>(
    '[data-slot="toolcraft-runtime-panel-host"][data-panel-type="timeline"]',
  );
  const panelHostRect = panelHost?.getBoundingClientRect();

  if (panelHostRect && panelHostRect.width > 0 && panelHostRect.height > 0) {
    return panelHostRect;
  }

  return panel.getBoundingClientRect();
}

function getTimelinePanelResponsiveLayout(panel: HTMLElement): TimelinePanelResponsiveLayout | null {
  const boundsElement = getTimelinePanelBoundsElement(panel);
  const boundsRect = boundsElement?.getBoundingClientRect();
  const anchorRect = getTimelinePanelAnchorRect(panel);
  const panelRect = panel.getBoundingClientRect();

  if (!boundsElement || !boundsRect || boundsRect.width <= 0 || anchorRect.width <= 0) {
    return null;
  }

  const boundsLeft = boundsRect.left + timelinePanelSideCollisionMarginPx;
  const boundsRight = boundsRect.right - timelinePanelSideCollisionMarginPx;
  const panelCenterX = anchorRect.left + anchorRect.width / 2;
  let leftLimit = boundsLeft;
  let rightLimit = boundsRight;

  for (const sidePanel of boundsElement.querySelectorAll<HTMLElement>(
    '[data-panel-type="layers"], [data-panel-type="controls"]',
  )) {
    const sidePanelRect = sidePanel.getBoundingClientRect();

    if (sidePanelRect.width <= 0 || !doRectsOverlapVertically(panelRect, sidePanelRect)) {
      continue;
    }

    if (sidePanelRect.right <= panelCenterX) {
      leftLimit = Math.max(leftLimit, sidePanelRect.right + timelinePanelSideCollisionMarginPx);
      continue;
    }

    if (sidePanelRect.left >= panelCenterX) {
      rightLimit = Math.min(rightLimit, sidePanelRect.left - timelinePanelSideCollisionMarginPx);
    }
  }

  const availableWidth = Math.floor(Math.max(0, rightLimit - leftLimit));
  const width =
    availableWidth >= timelinePanelExpandedWidthPx
      ? timelinePanelExpandedWidthPx
      : Math.max(timelinePanelMinResponsiveWidthPx, availableWidth);
  const halfWidth = width / 2;
  const minCenterX = leftLimit + halfWidth;
  const maxCenterX = rightLimit - halfWidth;
  const nextCenterX =
    minCenterX <= maxCenterX
      ? Math.max(minCenterX, Math.min(maxCenterX, panelCenterX))
      : leftLimit + Math.max(0, rightLimit - leftLimit) / 2;
  const offsetX = Math.round(nextCenterX - panelCenterX);

  return {
    offsetX: Object.is(offsetX, -0) ? 0 : offsetX,
    width,
  };
}

function areTimelinePanelResponsiveLayoutsEqual(
  first: TimelinePanelResponsiveLayout | null,
  second: TimelinePanelResponsiveLayout | null,
): boolean {
  return first?.offsetX === second?.offsetX && first?.width === second?.width;
}

export function useTimelinePanelResponsiveLayout(enabled: boolean): {
  panelRef: RefObject<HTMLDivElement | null>;
  responsiveLayout: TimelinePanelResponsiveLayout | null;
} {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const [responsiveLayout, setResponsiveLayout] =
    useState<TimelinePanelResponsiveLayout | null>(null);

  const measureResponsiveLayout = useCallback((): void => {
    const panel = panelRef.current;
    const nextLayout = enabled && panel ? getTimelinePanelResponsiveLayout(panel) : null;

    setResponsiveLayout((currentLayout) =>
      areTimelinePanelResponsiveLayoutsEqual(currentLayout, nextLayout)
        ? currentLayout
        : nextLayout,
    );
  }, [enabled]);

  const scheduleMeasure = useCallback((): void => {
    if (frameRef.current !== null) {
      return;
    }

    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      measureResponsiveLayout();
    });
  }, [measureResponsiveLayout]);

  const measureImmediately = useCallback((): void => {
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }

    measureResponsiveLayout();
  }, [measureResponsiveLayout]);

  useLayoutEffect(() => {
    measureImmediately();

    if (!enabled) {
      return undefined;
    }

    window.addEventListener('resize', measureImmediately);
    document.addEventListener('pointermove', scheduleMeasure, { capture: true });
    document.addEventListener('pointerup', measureImmediately, { capture: true });

    const resizeObserver =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measureImmediately);
    const panel = panelRef.current;
    const boundsElement = panel ? getTimelinePanelBoundsElement(panel) : null;

    if (resizeObserver) {
      if (boundsElement) {
        resizeObserver.observe(boundsElement);

        for (const sidePanel of boundsElement.querySelectorAll<HTMLElement>(
          '[data-panel-type="layers"], [data-panel-type="controls"]',
        )) {
          resizeObserver.observe(sidePanel);
        }
      }
    }

    return () => {
      window.removeEventListener('resize', measureImmediately);
      document.removeEventListener('pointermove', scheduleMeasure, { capture: true });
      document.removeEventListener('pointerup', measureImmediately, { capture: true });
      resizeObserver?.disconnect();

      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [enabled, measureImmediately, scheduleMeasure]);

  return { panelRef, responsiveLayout };
}
