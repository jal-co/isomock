"use client";

import * as React from "react";

import { observeBrowserResize } from "../primitives/browser-transport";

function getMeasuredWidth(element: HTMLElement): number | undefined {
  const width = Math.round(element.getBoundingClientRect().width);

  return width > 0 ? width : undefined;
}

export function useMeasuredElementWidth(
  ref: React.RefObject<HTMLElement | null>,
): number | undefined {
  const [width, setWidth] = React.useState<number | undefined>(undefined);

  React.useEffect(() => {
    const element = ref.current;

    if (!element) {
      return undefined;
    }

    const updateWidth = () => {
      setWidth(getMeasuredWidth(element));
    };

    updateWidth();

    return observeBrowserResize([element], updateWidth);
  }, [ref]);

  return width;
}
