import * as React from "react";
import { clearBrowserTimeout, setBrowserTimeout } from "../../primitives/browser-transport";

const hoverIntentDwellMs = 160;

export function useHoverIntent<T>({
  dwellMs = hoverIntentDwellMs,
  onIntent,
}: {
  dwellMs?: number;
  onIntent: (value: T) => void;
}): {
  cancelIntent: () => void;
  scheduleIntent: (value: T) => void;
} {
  const timeoutRef = React.useRef<number | null>(null);
  const pendingValueRef = React.useRef<T | undefined>(undefined);

  const cancelIntent = React.useCallback(() => {
    if (timeoutRef.current !== null) {
      clearBrowserTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    pendingValueRef.current = undefined;
  }, []);

  const scheduleIntent = React.useCallback(
    (value: T) => {
      cancelIntent();
      pendingValueRef.current = value;
      timeoutRef.current = setBrowserTimeout(() => {
        timeoutRef.current = null;
        const pendingValue = pendingValueRef.current;
        pendingValueRef.current = undefined;
        if (pendingValue !== undefined) {
          onIntent(pendingValue);
        }
      }, dwellMs);
    },
    [cancelIntent, dwellMs, onIntent],
  );

  React.useEffect(() => cancelIntent, [cancelIntent]);

  return { cancelIntent, scheduleIntent };
}
