'use client';

import * as React from 'react';
import { useEffect, useRef, useState } from 'react';

import type { ToolcraftTimelineKeyframeEasing } from '../../state/types';
import {
  areEasingControlPointsEqual,
  getEasingEditorControlPoints,
  interpolateTimelineEasingControlPoints,
  type TimelineBezierControlPoints,
} from './timeline-easing-model';
import {
  easingEditorFrameHeight,
  easingEditorFrameOffsetX,
  easingEditorFrameOffsetY,
  easingEditorFrameWidth,
  easingEditorGridInset,
  easingEditorGridSize,
  getEasingEditorPoint,
  getEasingPreviewPath,
} from './timeline-easing-geometry';

type TimelineCurveEditorDragTarget = 'p1' | 'p2';

const timelineEasingCurveAnimationDurationMs = 180;

export function TimelineEasingEditor({
  easing,
  onChange,
}: {
  easing: ToolcraftTimelineKeyframeEasing;
  onChange: (easing: ToolcraftTimelineKeyframeEasing) => void;
}): React.JSX.Element {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [dragTarget, setDragTarget] = useState<TimelineCurveEditorDragTarget | null>(null);
  const targetControlPoints = getEasingEditorControlPoints(easing);
  const targetControlPointsKey = `${easing.type}:${targetControlPoints.join(',')}`;
  const [displayedControlPoints, setDisplayedControlPoints] =
    useState<TimelineBezierControlPoints>(targetControlPoints);
  const displayedControlPointsRef =
    useRef<TimelineBezierControlPoints>(displayedControlPoints);
  const animationFrameRef = useRef<number | null>(null);
  const [isCurveAnimating, setIsCurveAnimating] = useState(false);
  const isStep = easing.type === 'step';
  const renderedControlPoints = dragTarget ? targetControlPoints : displayedControlPoints;
  const [startX, startY] = getEasingEditorPoint(0, 0);
  const [endX, endY] = getEasingEditorPoint(1, 1);
  const [firstX, firstY] = getEasingEditorPoint(renderedControlPoints[0], renderedControlPoints[1]);
  const [secondX, secondY] = getEasingEditorPoint(
    renderedControlPoints[2],
    renderedControlPoints[3],
  );
  const setAnimatedControlPoints = (
    nextControlPoints: TimelineBezierControlPoints,
  ): void => {
    displayedControlPointsRef.current = nextControlPoints;
    setDisplayedControlPoints(nextControlPoints);
  };
  const getEditorPointFromClient = (
    clientX: number,
    clientY: number,
  ): { x: number; y: number } | null => {
    if (!svgRef.current) {
      return null;
    }
    const rect = svgRef.current.getBoundingClientRect();

    if (!(rect.width > 0 && rect.height > 0)) {
      return null;
    }

    const scale = Math.min(
      rect.width / easingEditorFrameWidth,
      rect.height / easingEditorFrameHeight,
    );

    if (!(scale > 0)) {
      return null;
    }

    const viewBoxLeft = rect.left + (rect.width - easingEditorFrameWidth * scale) / 2;
    const viewBoxTop = rect.top + (rect.height - easingEditorFrameHeight * scale) / 2;
    const pointerX = (clientX - viewBoxLeft) / scale - easingEditorFrameOffsetX;
    const pointerY = (clientY - viewBoxTop) / scale - easingEditorFrameOffsetY;

    return {
      x: Math.max(0, Math.min(1, (pointerX - easingEditorGridInset) / easingEditorGridSize)),
      y: Math.max(-1, Math.min(2, 1 - (pointerY - easingEditorGridInset) / easingEditorGridSize)),
    };
  };
  const updateControlPoint = (
    target: TimelineCurveEditorDragTarget,
    nextPoint: { x: number; y: number },
  ): void => {
    const nextControlPoints = [...targetControlPoints] as TimelineBezierControlPoints;

    if (target === 'p1') {
      nextControlPoints[0] = nextPoint.x;
      nextControlPoints[1] = nextPoint.y;
    } else {
      nextControlPoints[2] = nextPoint.x;
      nextControlPoints[3] = nextPoint.y;
    }

    onChange({ controlPoints: nextControlPoints, type: 'bezier' });
  };
  const handleDragMove = (event: PointerEvent): void => {
    if (!dragTarget) {
      return;
    }

    const nextPoint = getEditorPointFromClient(event.clientX, event.clientY);

    if (!nextPoint) {
      return;
    }

    updateControlPoint(dragTarget, nextPoint);
  };

  useEffect(() => {
    const nextControlPoints = [...targetControlPoints] as TimelineBezierControlPoints;

    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (
      dragTarget ||
      typeof window === 'undefined' ||
      !window.requestAnimationFrame ||
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ) {
      setIsCurveAnimating(false);
      setAnimatedControlPoints(nextControlPoints);
      return undefined;
    }

    const startControlPoints = displayedControlPointsRef.current;

    if (areEasingControlPointsEqual(startControlPoints, nextControlPoints)) {
      setIsCurveAnimating(false);
      setAnimatedControlPoints(nextControlPoints);
      return undefined;
    }

    let animationStartTime: number | null = null;

    setIsCurveAnimating(true);

    const tick = (timestamp: number): void => {
      animationStartTime ??= timestamp;

      const progress = Math.min(
        1,
        (timestamp - animationStartTime) / timelineEasingCurveAnimationDurationMs,
      );

      setAnimatedControlPoints(
        interpolateTimelineEasingControlPoints(startControlPoints, nextControlPoints, progress),
      );

      if (progress < 1) {
        animationFrameRef.current = window.requestAnimationFrame(tick);
        return;
      }

      animationFrameRef.current = null;
      setIsCurveAnimating(false);
      setAnimatedControlPoints(nextControlPoints);
    };

    animationFrameRef.current = window.requestAnimationFrame(tick);

    return () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [dragTarget, targetControlPointsKey]);

  useEffect(() => {
    if (!dragTarget) {
      return;
    }

    const handlePointerUp = (): void => {
      setDragTarget(null);
    };
    const previousCursor = document.body.style.cursor;

    document.body.style.cursor = 'grabbing';
    window.addEventListener('pointermove', handleDragMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    return () => {
      document.body.style.cursor = previousCursor;
      window.removeEventListener('pointermove', handleDragMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [targetControlPoints, dragTarget, handleDragMove]);

  const startControlPointDrag =
    (target: TimelineCurveEditorDragTarget) => (event: React.PointerEvent<SVGElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setDragTarget(target);
    };
  const startCurveDrag = (event: React.PointerEvent<SVGPathElement>): void => {
    event.preventDefault();
    event.stopPropagation();

    const point = getEditorPointFromClient(event.clientX, event.clientY);

    if (!point) {
      return;
    }

    setDragTarget(point.x <= 0.5 ? 'p1' : 'p2');
  };

  return (
    <svg
      aria-label="Easing curve editor"
      className="w-[240px] shrink-0 select-none"
      data-animating={isCurveAnimating ? 'true' : undefined}
      data-curve-animation-duration={timelineEasingCurveAnimationDurationMs}
      data-slot="timeline-easing-editor"
      height={easingEditorFrameHeight}
      ref={svgRef}
      role="img"
      style={{ touchAction: 'none' }}
      viewBox={`0 0 ${easingEditorFrameWidth} ${easingEditorFrameHeight}`}
      width={easingEditorFrameWidth}
    >
      <g transform={`translate(${easingEditorFrameOffsetX} ${easingEditorFrameOffsetY})`}>
        <rect
          fill="none"
          height={easingEditorGridSize}
          rx={2}
          stroke="color-mix(in oklab, var(--border) 10%, transparent)"
          strokeWidth={1}
          width={easingEditorGridSize}
          x={easingEditorGridInset}
          y={easingEditorGridInset}
        />
        {[0.25, 0.5, 0.75].map((point) => {
          const [gridX] = getEasingEditorPoint(point, 0);
          const [, gridY] = getEasingEditorPoint(0, point);

          return (
            <g key={point}>
              <line
                stroke="color-mix(in oklab, var(--border) 6%, transparent)"
                strokeWidth={1}
                x1={gridX}
                x2={gridX}
                y1={easingEditorGridInset}
                y2={easingEditorGridInset + easingEditorGridSize}
              />
              <line
                stroke="color-mix(in oklab, var(--border) 6%, transparent)"
                strokeWidth={1}
                x1={easingEditorGridInset}
                x2={easingEditorGridInset + easingEditorGridSize}
                y1={gridY}
                y2={gridY}
              />
            </g>
          );
        })}
        <line
          stroke="color-mix(in oklab, var(--foreground) 12%, transparent)"
          strokeDasharray="3 3"
          strokeWidth={1}
          x1={startX}
          x2={endX}
          y1={startY}
          y2={endY}
        />
        {isStep ? (
          <>
            <line
              data-slot="timeline-easing-step-horizontal"
              stroke="color-mix(in oklab, var(--foreground) 85%, transparent)"
              strokeLinecap="round"
              strokeWidth={2}
              x1={startX}
              x2={endX}
              y1={startY}
              y2={startY}
            />
            <line
              data-slot="timeline-easing-step-vertical"
              stroke="color-mix(in oklab, var(--foreground) 85%, transparent)"
              strokeLinecap="round"
              strokeWidth={1.5}
              x1={endX}
              x2={endX}
              y1={startY}
              y2={endY}
            />
          </>
        ) : (
          <>
            <line
              stroke="color-mix(in oklab, var(--foreground) 25%, transparent)"
              strokeWidth={1}
              x1={startX}
              x2={firstX}
              y1={startY}
              y2={firstY}
            />
            <line
              stroke="color-mix(in oklab, var(--foreground) 25%, transparent)"
              strokeWidth={1}
              x1={endX}
              x2={secondX}
              y1={endY}
              y2={secondY}
            />
            <line
              className="cursor-grab active:cursor-grabbing"
              data-slot="timeline-easing-control-line-hit-area"
              onPointerDown={startControlPointDrag('p1')}
              pointerEvents="stroke"
              stroke="transparent"
              strokeLinecap="round"
              strokeWidth={18}
              x1={startX}
              x2={firstX}
              y1={startY}
              y2={firstY}
            />
            <line
              className="cursor-grab active:cursor-grabbing"
              data-slot="timeline-easing-control-line-hit-area"
              onPointerDown={startControlPointDrag('p2')}
              pointerEvents="stroke"
              stroke="transparent"
              strokeLinecap="round"
              strokeWidth={18}
              x1={endX}
              x2={secondX}
              y1={endY}
              y2={secondY}
            />
            <path
              d={getEasingPreviewPath(renderedControlPoints)}
              data-slot="timeline-easing-curve"
              fill="none"
              stroke="color-mix(in oklab, var(--foreground) 85%, transparent)"
              strokeLinecap="round"
              strokeWidth={2}
            />
            <path
              className="cursor-grab active:cursor-grabbing"
              d={getEasingPreviewPath(renderedControlPoints)}
              data-slot="timeline-easing-curve-hit-area"
              fill="none"
              onPointerDown={startCurveDrag}
              pointerEvents="stroke"
              stroke="transparent"
              strokeLinecap="round"
              strokeWidth={18}
            />
            <circle
              cx={startX}
              cy={startY}
              fill="color-mix(in oklab, var(--foreground) 50%, transparent)"
              r={3}
            />
            <circle
              cx={endX}
              cy={endY}
              fill="color-mix(in oklab, var(--foreground) 50%, transparent)"
              r={3}
            />
            <circle
              className="cursor-grab active:cursor-grabbing"
              cx={firstX}
              cy={firstY}
              fill="var(--foreground)"
              onPointerDown={startControlPointDrag('p1')}
              r={5}
              stroke="color-mix(in oklab, var(--background) 70%, transparent)"
              strokeWidth={1}
            />
            <circle
              className="cursor-grab active:cursor-grabbing"
              cx={secondX}
              cy={secondY}
              fill="var(--foreground)"
              onPointerDown={startControlPointDrag('p2')}
              r={5}
              stroke="color-mix(in oklab, var(--background) 70%, transparent)"
              strokeWidth={1}
            />
          </>
        )}
      </g>
    </svg>
  );
}
