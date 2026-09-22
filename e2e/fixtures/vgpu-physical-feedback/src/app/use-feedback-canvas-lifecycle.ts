import * as React from "react";

import {
  clearPhysicalFeedbackCanvas,
  createPhysicalFeedbackLifecycleEpoch,
  physicalFeedbackDisabledRuntimeAttributes,
  physicalFeedbackDisabledBackingMatches,
  type PhysicalFeedbackCanvasRuntime,
  type PhysicalFeedbackDisabledSurface,
  type PhysicalFeedbackLifecycleEpoch,
} from "./feedback-canvas-lifecycle";

type PhysicalFeedbackCanvasLifecycleInput = Readonly<{
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  enabled: boolean;
  presentDisabledSurface: (commit: () => void) => Promise<void>;
  retireResources: () => Promise<void>;
  setRuntime: React.Dispatch<
    React.SetStateAction<PhysicalFeedbackCanvasRuntime>
  >;
  surface: PhysicalFeedbackDisabledSurface;
}>;

type PhysicalFeedbackCanvasLifecycle = Readonly<{
  lifecycle: PhysicalFeedbackLifecycleEpoch;
  mountedRef: React.RefObject<boolean>;
}>;

export function usePhysicalFeedbackCanvasLifecycle({
  canvasRef,
  enabled,
  presentDisabledSurface,
  retireResources,
  setRuntime,
  surface,
}: PhysicalFeedbackCanvasLifecycleInput): PhysicalFeedbackCanvasLifecycle {
  const { backingHeight, backingWidth, cssHeight, cssWidth, renderedTime } = surface;
  const [lifecycle] = React.useState(() =>
    createPhysicalFeedbackLifecycleEpoch(enabled),
  );
  const mountedRef = React.useRef(true);
  const previousEnabledRef = React.useRef(enabled);
  const surfaceRef = React.useRef(surface);
  surfaceRef.current = surface;
  const committedDisabledRef = React.useRef<
    Readonly<{ epoch: number; surface: PhysicalFeedbackDisabledSurface }> | undefined
  >(undefined);

  React.useLayoutEffect(() => {
    lifecycle.transition(enabled);
  }, [enabled, lifecycle]);

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      lifecycle.retire();
    };
  }, [lifecycle]);

  const presentCommittedDisabledSurface = React.useCallback(
    (epoch: number) => {
      const committed = committedDisabledRef.current;
      if (
        committed?.epoch === epoch &&
        physicalFeedbackDisabledBackingMatches(
          committed.surface,
          surfaceRef.current,
        )
      ) {
        lifecycle.commitDisabled(epoch, () => {
          if (mountedRef.current) {
            setRuntime((current) => ({
              ...current,
              renderedTime: surfaceRef.current.renderedTime,
            }));
          }
        });
        return Promise.resolve();
      }
      return presentDisabledSurface(() => {
        lifecycle.commitDisabled(epoch, () => {
          if (!clearPhysicalFeedbackCanvas(canvasRef.current, surfaceRef.current)) {
            return;
          }
          committedDisabledRef.current = {
            epoch,
            surface: { ...surfaceRef.current },
          };
          if (mountedRef.current) {
            setRuntime((current) => ({
              ...current,
              attributes: physicalFeedbackDisabledRuntimeAttributes,
              renderedTime: surfaceRef.current.renderedTime,
            }));
          }
        });
      });
    },
    [canvasRef, lifecycle, presentDisabledSurface, setRuntime],
  );

  React.useEffect(() => {
    const wasEnabled = previousEnabledRef.current;
    previousEnabledRef.current = enabled;
    if (!wasEnabled || enabled) return;
    const disabledEpoch = lifecycle.captureDisabled();
    if (disabledEpoch === null) return;
    void retireResources().catch((error: unknown) => globalThis.reportError(error));
  }, [enabled, lifecycle, retireResources]);

  React.useEffect(() => {
    const disabledEpoch = lifecycle.captureDisabled();
    if (disabledEpoch !== null) {
      void presentCommittedDisabledSurface(disabledEpoch).catch(
        (error: unknown) => globalThis.reportError(error),
      );
    }
  }, [
    backingHeight,
    backingWidth,
    presentCommittedDisabledSurface,
    cssHeight,
    cssWidth,
    enabled,
    lifecycle,
    renderedTime,
  ]);

  return { lifecycle, mountedRef };
}
