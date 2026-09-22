"use client";

import * as React from "react";

/** Vector workspace decoration, anchored to the viewport's centered world origin. */
export function CanvasDotPattern({
  offset,
  scale,
  color = "var(--foreground)",
}: {
  offset: Readonly<{ x: number; y: number }>;
  scale: number;
  color?: string;
}): React.JSX.Element {
  const id = React.useId();
  const zoom = Number.isFinite(scale) && scale > 0 ? scale : 1;
  // At 100% zoom, dots have a 3px diameter and 24px center-to-center spacing.
  const gap = 24 * zoom;
  const radius = 1.5 * zoom;
  const phase = 1 + gap / 2;
  const x = (Number.isFinite(offset.x) ? offset.x % gap : 0) - phase;
  const y = (Number.isFinite(offset.y) ? offset.y % gap : 0) - phase;

  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 size-full"
      data-slot="canvas-dot-pattern"
      focusable="false"
    >
      <defs>
        <pattern
          height={gap}
          id={id}
          patternTransform={`translate(${x}, ${y})`}
          patternUnits="userSpaceOnUse"
          width={gap}
          x="50%"
          y="50%"
        >
          <circle cx={radius} cy={radius} fill={color} fillOpacity={0.1} r={radius} />
        </pattern>
      </defs>
      <rect fill={`url(#${id})`} height="100%" width="100%" />
    </svg>
  );
}
