"use client";

import * as React from "react";
import { observeBrowserResize } from "./browser-transport";

const OVERFLOW_TITLE_TOLERANCE_PX = 1;

type OverflowMeasurement = Pick<HTMLElement, "clientWidth" | "scrollWidth">;

export function getOverflowTitle(
  viewport: OverflowMeasurement | null,
  textTitle: string | undefined,
): string | undefined {
  if (!viewport || !textTitle) {
    return undefined;
  }

  return viewport.scrollWidth >
    viewport.clientWidth + OVERFLOW_TITLE_TOLERANCE_PX
    ? textTitle
    : undefined;
}

export function useOverflowTitle(
  viewportRef: React.RefObject<HTMLElement | null>,
  textTitle: string | undefined,
): string | undefined {
  const [overflowTitle, setOverflowTitle] = React.useState<string>();

  React.useLayoutEffect(() => {
    const viewport = viewportRef.current;

    if (!viewport || !textTitle) {
      setOverflowTitle((current) =>
        current === undefined ? current : undefined,
      );
      return undefined;
    }

    const updateOverflowTitle = (): void => {
      const nextTitle = getOverflowTitle(viewport, textTitle);
      setOverflowTitle((current) =>
        current === nextTitle ? current : nextTitle,
      );
    };

    updateOverflowTitle();

    return observeBrowserResize(
      [
        viewport,
        ...(viewport.firstElementChild ? [viewport.firstElementChild] : []),
      ],
      updateOverflowTitle,
    );
  }, [textTitle, viewportRef]);

  return overflowTitle;
}
