import type { CSSProperties } from 'react';

export const timelineKeyframeRowHeightPx = 36;
export const timelineTrackStartOffsetPx = 164;
export const timelineTrackEndInsetPx = 0;
export const timelineTrackColumnBorderWidthPx = 1;
export const timelineTrackStartVisualOffsetPx = -timelineTrackColumnBorderWidthPx;
export const timelineExpandedTrackStartOffsetPx =
  timelineTrackStartOffsetPx + timelineTrackStartVisualOffsetPx;
export const timelineRulerLeftInsetPx = timelineTrackStartVisualOffsetPx / 2;
export const timelineRulerRightInsetPx = timelineTrackColumnBorderWidthPx / 2;
export const timelineRowActionColumnWidthPx = 36;
export const timelineExpandedTrackEndOffsetPx =
  timelineTrackEndInsetPx + timelineRowActionColumnWidthPx + timelineTrackColumnBorderWidthPx;
export const timelineKeyframePresenceTransition = {
  duration: 0.14,
  ease: [0.22, 1, 0.36, 1],
} as const;

export function getTimelineCalcPositionStyle(
  ratio: number,
  pixelOffset: number,
): CSSProperties {
  const roundedPixelOffset = Number.parseFloat(pixelOffset.toFixed(3));
  const offsetOperator = roundedPixelOffset < 0 ? '-' : '+';

  return {
    left: `calc(${ratio * 100}% ${offsetOperator} ${Math.abs(roundedPixelOffset)}px)`,
  };
}
