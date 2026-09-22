"use client";

import * as React from "react";
import { ScrollFade } from "@/toolcraft/ui";
import { PanelHoverSurface } from "@/toolcraft/ui/components/panel/internal-panel-hover";

import {
  controlsPanelLeftPaddingPx,
  getNavigationLayout,
  getSectionElementById,
  hiddenNavigationLayout,
  navigationLayoutsEqual,
  pointerIsInsideNavigationRegion,
  type ControlsPanelSectionNavigationItem,
  type NavigationLayout,
} from "./controls-panel-section-navigation-layout";

export type { ControlsPanelSectionNavigationItem } from "./controls-panel-section-navigation-layout";

type ControlsPanelSectionNavigationProps = {
  items: readonly ControlsPanelSectionNavigationItem[];
  rootElement: HTMLDivElement | null;
};

const controlsPanelContentSelector = '[data-slot="toolcraft-panel-content"]';
const controlsPanelSelector = '[data-panel-id="properties"]';
const controlsPanelSectionAnchorSelector =
  "[data-toolcraft-controls-section-anchor]";
const controlsPanelHoverIntentDelayMs = 300;
const controlsPanelLeaveGraceMs = 50;
const navigationSurfacePaddingPx = 16;
const navigationSurfaceTransitionDurationMs = 120;

export function ControlsPanelSectionNavigation({
  items,
  rootElement,
}: ControlsPanelSectionNavigationProps): React.JSX.Element | null {
  const [layout, setLayout] = React.useState<NavigationLayout>(
    hiddenNavigationLayout,
  );
  const [navigationMounted, setNavigationMounted] = React.useState(false);
  const [navigationOpen, setNavigationOpen] = React.useState(false);
  const exitTimerRef = React.useRef<number | null>(null);
  const hideTimerRef = React.useRef<number | null>(null);
  const pointerInHotZoneRef = React.useRef(false);
  const revealTimerRef = React.useRef<number | null>(null);
  const navigationButtonRefs = React.useRef(
    new Map<string, HTMLButtonElement>(),
  );
  const navigationSurfaceRef = React.useRef<HTMLDivElement | null>(null);
  const viewportRef = React.useRef<HTMLElement | null>(null);
  const sectionElementsRef = React.useRef<readonly HTMLElement[]>([]);

  const clearHideTimer = React.useCallback((): void => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);
  const clearExitTimer = React.useCallback((): void => {
    if (exitTimerRef.current !== null) {
      window.clearTimeout(exitTimerRef.current);
      exitTimerRef.current = null;
    }
  }, []);
  const clearRevealTimer = React.useCallback((): void => {
    if (revealTimerRef.current !== null) {
      window.clearTimeout(revealTimerRef.current);
      revealTimerRef.current = null;
    }
  }, []);
  const showNavigation = React.useCallback((): void => {
    clearExitTimer();
    setNavigationMounted(true);
    setNavigationOpen(true);
  }, [clearExitTimer]);
  const startNavigationExit = React.useCallback((): void => {
    clearExitTimer();
    setNavigationOpen(false);
    exitTimerRef.current = window.setTimeout(() => {
      exitTimerRef.current = null;
      setNavigationMounted(false);
    }, navigationSurfaceTransitionDurationMs);
  }, [clearExitTimer]);
  const scheduleHide = React.useCallback((): void => {
    clearHideTimer();
    hideTimerRef.current = window.setTimeout(() => {
      hideTimerRef.current = null;
      startNavigationExit();
    }, controlsPanelLeaveGraceMs);
  }, [clearHideTimer, startNavigationExit]);

  React.useLayoutEffect(() => {
    if (!rootElement || items.length === 0) {
      viewportRef.current = null;
      sectionElementsRef.current = [];
      setLayout(hiddenNavigationLayout);
      return undefined;
    }

    let animationFrame = 0;
    let viewport: HTMLElement | null = null;
    let sectionElements: readonly HTMLElement[] = [];

    const updateLayout = (): void => {
      animationFrame = 0;
      const nextLayout = getNavigationLayout({
        items,
        rootElement,
        sectionElements,
        viewport,
      });

      if (!nextLayout.available) {
        clearHideTimer();
        clearExitTimer();
        clearRevealTimer();
        pointerInHotZoneRef.current = false;
        setNavigationMounted(false);
        setNavigationOpen(false);
      }
      setLayout((current) =>
        navigationLayoutsEqual(current, nextLayout) ? current : nextLayout,
      );
    };
    const scheduleLayoutUpdate = (): void => {
      if (animationFrame !== 0) {
        return;
      }

      animationFrame = window.requestAnimationFrame(updateLayout);
    };
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(scheduleLayoutUpdate);
    const refreshObservedElements = (): void => {
      const nextViewport =
        rootElement.querySelector<HTMLElement>(controlsPanelContentSelector);

      if (viewport !== nextViewport) {
        viewport?.removeEventListener("scroll", scheduleLayoutUpdate);
        nextViewport?.addEventListener("scroll", scheduleLayoutUpdate, {
          passive: true,
        });
        viewport = nextViewport;
        viewportRef.current = nextViewport;
      }

      sectionElements = Array.from(
        rootElement.querySelectorAll<HTMLElement>(
          controlsPanelSectionAnchorSelector,
        ),
      );
      sectionElementsRef.current = sectionElements;

      resizeObserver?.disconnect();
      resizeObserver?.observe(rootElement);
      if (viewport) {
        resizeObserver?.observe(viewport);
      }
      sectionElements.forEach((sectionElement) => {
        resizeObserver?.observe(sectionElement);
      });
      scheduleLayoutUpdate();
    };
    const mutationObserver =
      typeof MutationObserver === "undefined"
        ? null
        : new MutationObserver(refreshObservedElements);

    refreshObservedElements();
    mutationObserver?.observe(rootElement, { childList: true, subtree: true });
    window.addEventListener("resize", scheduleLayoutUpdate);

    return () => {
      if (animationFrame !== 0) {
        window.cancelAnimationFrame(animationFrame);
      }
      viewport?.removeEventListener("scroll", scheduleLayoutUpdate);
      window.removeEventListener("resize", scheduleLayoutUpdate);
      mutationObserver?.disconnect();
      resizeObserver?.disconnect();
      viewportRef.current = null;
      sectionElementsRef.current = [];
    };
  }, [clearExitTimer, clearHideTimer, clearRevealTimer, items, rootElement]);

  React.useEffect(() => {
    if (!rootElement || items.length === 0) {
      clearHideTimer();
      clearExitTimer();
      clearRevealTimer();
      pointerInHotZoneRef.current = false;
      setNavigationMounted(false);
      setNavigationOpen(false);
      return undefined;
    }

    const panelElement =
      rootElement.querySelector<HTMLElement>(controlsPanelSelector);

    if (!panelElement) {
      clearExitTimer();
      setNavigationMounted(false);
      setNavigationOpen(false);
      return undefined;
    }

    const startRevealIntent = (): void => {
      clearRevealTimer();
      revealTimerRef.current = window.setTimeout(() => {
        revealTimerRef.current = null;
        if (pointerInHotZoneRef.current) {
          showNavigation();
        }
      }, controlsPanelHoverIntentDelayMs);
    };
    const handlePanelPointerPosition = (event: PointerEvent): void => {
      const panelRect = panelElement.getBoundingClientRect();
      const withinPanelHeight =
        event.clientY >= panelRect.top && event.clientY <= panelRect.bottom;
      const withinHotZone =
        withinPanelHeight &&
        event.clientX >= panelRect.left &&
        event.clientX <=
          Math.min(panelRect.right, panelRect.left + controlsPanelLeftPaddingPx);

      if (withinHotZone === pointerInHotZoneRef.current) {
        return;
      }

      pointerInHotZoneRef.current = withinHotZone;
      if (withinHotZone) {
        clearHideTimer();
        startRevealIntent();
        return;
      }

      clearRevealTimer();
      scheduleHide();
    };
    const handlePanelPointerLeave = (): void => {
      pointerInHotZoneRef.current = false;
      clearRevealTimer();
      scheduleHide();
    };

    panelElement.addEventListener("pointerenter", handlePanelPointerPosition);
    panelElement.addEventListener("pointermove", handlePanelPointerPosition);
    panelElement.addEventListener("pointerleave", handlePanelPointerLeave);

    return () => {
      panelElement.removeEventListener(
        "pointerenter",
        handlePanelPointerPosition,
      );
      panelElement.removeEventListener("pointermove", handlePanelPointerPosition);
      panelElement.removeEventListener("pointerleave", handlePanelPointerLeave);
      clearHideTimer();
      clearExitTimer();
      clearRevealTimer();
      pointerInHotZoneRef.current = false;
    };
  }, [
    clearHideTimer,
    clearExitTimer,
    clearRevealTimer,
    items.length,
    rootElement,
    scheduleHide,
    showNavigation,
  ]);

  React.useEffect(() => {
    if (!navigationMounted || !navigationOpen || !rootElement) {
      return undefined;
    }

    const panelElement =
      rootElement.querySelector<HTMLElement>(controlsPanelSelector);

    if (!panelElement) {
      return undefined;
    }

    const handleDocumentPointerMove = (event: PointerEvent): void => {
      const surfaceElement = navigationSurfaceRef.current;

      if (
        surfaceElement &&
        pointerIsInsideNavigationRegion({
          clientX: event.clientX,
          clientY: event.clientY,
          panelRect: panelElement.getBoundingClientRect(),
          surfaceRect: surfaceElement.getBoundingClientRect(),
        })
      ) {
        clearHideTimer();
        return;
      }

      scheduleHide();
    };

    document.addEventListener("pointermove", handleDocumentPointerMove, {
      passive: true,
    });

    return () => {
      document.removeEventListener("pointermove", handleDocumentPointerMove);
    };
  }, [
    clearHideTimer,
    navigationMounted,
    navigationOpen,
    rootElement,
    scheduleHide,
  ]);

  const handleNavigationPointerEnter = React.useCallback((): void => {
    clearHideTimer();
  }, [clearHideTimer]);
  const handleNavigationPointerLeave = React.useCallback((): void => {
    clearRevealTimer();
    pointerInHotZoneRef.current = false;
    scheduleHide();
  }, [clearRevealTimer, scheduleHide]);

  const navigateToSection = React.useCallback((id: string): void => {
    const viewport = viewportRef.current;
    const sectionElement = getSectionElementById(
      sectionElementsRef.current,
      id,
    );

    if (!viewport || !sectionElement) {
      return;
    }

    const top =
      viewport.scrollTop +
      sectionElement.getBoundingClientRect().top -
      viewport.getBoundingClientRect().top;

    setLayout((current) => ({ ...current, activeId: id }));
    viewport.scrollTo({
      behavior: "auto",
      top,
    });
  }, []);

  const handleNavigationKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, itemIndex: number): void => {
      if (
        !navigationOpen ||
        (event.key !== "ArrowDown" && event.key !== "ArrowUp")
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const direction = event.key === "ArrowDown" ? 1 : -1;
      const nextIndex = (itemIndex + direction + items.length) % items.length;
      const nextItem = items[nextIndex];

      if (!nextItem) {
        return;
      }

      navigateToSection(nextItem.id);
      navigationButtonRefs.current.get(nextItem.id)?.focus();
    },
    [items, navigateToSection, navigationOpen],
  );

  if (!layout.available || !navigationMounted) {
    return null;
  }

  return (
    <div
      className="absolute z-50"
      style={{
        right: "calc(100% + 8px)",
        top: layout.centerY,
        transform: "translateY(-50%)",
      }}
    >
      <PanelHoverSurface
        aria-hidden={navigationOpen ? undefined : true}
        className={`${navigationOpen ? "pointer-events-auto" : "pointer-events-none"} max-w-[240px] overflow-hidden rounded-lg py-2 duration-[120ms] ease-out data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-right-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-right-[2px] motion-reduce:animate-none`}
        data-state={navigationOpen ? "open" : "closed"}
        data-toolcraft-controls-section-navigation-surface=""
        onPointerEnter={handleNavigationPointerEnter}
        onPointerLeave={handleNavigationPointerLeave}
        ref={navigationSurfaceRef}
        style={{
          maxHeight: layout.maxHeight,
        }}
      >
        <ScrollFade
          className="min-h-0"
          containerClassName="min-h-0"
          data-toolcraft-controls-section-navigation-scroll-viewport=""
          preset="compact"
          showOppositeSide
          side="bottom"
          style={{
            maxHeight: Math.max(
              0,
              layout.maxHeight - navigationSurfacePaddingPx,
            ),
          }}
          visibilityMode="overflow"
        >
          <nav aria-label="Panel sections">
            <div
              className="flex flex-col gap-2 px-3"
              data-toolcraft-controls-section-navigation-list=""
            >
              {items.map((item, itemIndex) => {
                const current = item.id === layout.activeId;

                return (
                  <button
                    aria-current={current ? "location" : undefined}
                    className="relative min-w-0 w-full whitespace-nowrap px-0 py-0.5 text-left text-[13px] leading-4 text-[color:color-mix(in_oklab,var(--foreground)_50%,transparent)] outline-none transition-colors hover:text-[color:color-mix(in_oklab,var(--foreground)_80%,transparent)] focus-visible:ring-2 focus-visible:ring-[color:var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--popover)] data-[current=true]:text-[color:var(--foreground)] data-[current=true]:hover:text-[color:var(--foreground)]"
                    data-current={current ? "true" : undefined}
                    key={item.id}
                    onClick={() => navigateToSection(item.id)}
                    onKeyDown={(event) =>
                      handleNavigationKeyDown(event, itemIndex)
                    }
                    ref={(buttonElement) => {
                      if (buttonElement) {
                        navigationButtonRefs.current.set(
                          item.id,
                          buttonElement,
                        );
                      } else {
                        navigationButtonRefs.current.delete(item.id);
                      }
                    }}
                    title={item.title}
                    type="button"
                  >
                    <ScrollFade
                      className="min-w-0 overflow-x-hidden overflow-y-hidden"
                      containerClassName="min-w-0 max-w-full"
                      preset="compact"
                      scrollBoundaryBehavior="chain"
                      side="right"
                      watch={[item.title]}
                    >
                      <span className="block min-w-max whitespace-nowrap">
                        {item.title}
                      </span>
                    </ScrollFade>
                  </button>
                );
              })}
            </div>
          </nav>
        </ScrollFade>
      </PanelHoverSurface>
    </div>
  );
}
