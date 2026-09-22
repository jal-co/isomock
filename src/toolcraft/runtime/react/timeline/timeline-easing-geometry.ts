'use client';

import type { TimelineBezierControlPoints } from './timeline-easing-model';

export const easingEditorViewBoxSize = 180;
export const easingEditorGridInset = 24;
export const easingEditorGridSize = 132;
export const easingEditorFrameWidth = 220;
export const easingEditorFrameHeight = 240;
export const easingEditorFrameOffsetX = (easingEditorFrameWidth - easingEditorViewBoxSize) / 2;
export const easingEditorFrameOffsetY = (easingEditorFrameHeight - easingEditorViewBoxSize) / 2;
export const timelineEasingPresetIconSize = 20;
export const timelineEasingPresetIconViewBoxSize = 28;
export const timelineEasingPresetIconLineColor = 'color-mix(in oklab, var(--border) 60%, transparent)';

export function getEasingEditorPoint(x: number, y: number): [number, number] {
  return [
    easingEditorGridInset + easingEditorGridSize * x,
    easingEditorGridInset + (1 - y) * easingEditorGridSize,
  ];
}

export function getEasingIconPath(
  controlPoints: TimelineBezierControlPoints,
  size: number,
): string {
  const pointX = (point: number): number => 3 + point * (size - 6);
  const pointY = (point: number): number => size - 3 - point * (size - 6);

  return `M ${pointX(0)} ${pointY(0)} C ${pointX(controlPoints[0])} ${pointY(
    controlPoints[1],
  )}, ${pointX(controlPoints[2])} ${pointY(controlPoints[3])}, ${pointX(1)} ${pointY(1)}`;
}

export function getEasingPreviewPath(controlPoints: TimelineBezierControlPoints): string {
  const [startX, startY] = getEasingEditorPoint(0, 0);
  const [firstX, firstY] = getEasingEditorPoint(controlPoints[0], controlPoints[1]);
  const [secondX, secondY] = getEasingEditorPoint(controlPoints[2], controlPoints[3]);
  const [endX, endY] = getEasingEditorPoint(1, 1);

  return `M ${startX} ${startY} C ${firstX} ${firstY}, ${secondX} ${secondY}, ${endX} ${endY}`;
}
