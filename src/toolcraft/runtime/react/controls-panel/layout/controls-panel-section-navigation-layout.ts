export type ControlsPanelSectionNavigationItem = {
  id: string;
  title: string;
};

export type NavigationLayout = {
  activeId: string | null;
  available: boolean;
  centerY: number;
  maxHeight: number;
};

export const controlsPanelLeftPaddingPx = 12;
export const hiddenNavigationLayout: NavigationLayout = {
  activeId: null,
  available: false,
  centerY: 0,
  maxHeight: 0,
};

const controlsPanelScrollTolerancePx = 1;

export function navigationLayoutsEqual(
  previous: NavigationLayout,
  next: NavigationLayout,
): boolean {
  return (
    previous.activeId === next.activeId &&
    previous.available === next.available &&
    previous.centerY === next.centerY &&
    previous.maxHeight === next.maxHeight
  );
}

export function getSectionElementById(
  sectionElements: readonly HTMLElement[],
  id: string,
): HTMLElement | undefined {
  return sectionElements.find(
    (sectionElement) =>
      sectionElement.dataset.toolcraftControlsSectionAnchor === id,
  );
}

function getActiveSectionId({
  items,
  sectionElements,
  viewport,
}: {
  items: readonly ControlsPanelSectionNavigationItem[];
  sectionElements: readonly HTMLElement[];
  viewport: HTMLElement;
}): string | null {
  const reachableItems = items.filter((item) =>
    getSectionElementById(sectionElements, item.id),
  );

  if (reachableItems.length === 0) {
    return null;
  }

  const atScrollEnd =
    viewport.scrollTop + viewport.clientHeight >=
    viewport.scrollHeight - controlsPanelScrollTolerancePx;

  if (atScrollEnd) {
    return reachableItems.at(-1)?.id ?? null;
  }

  const readingLine =
    viewport.getBoundingClientRect().top + controlsPanelScrollTolerancePx;
  let activeId = reachableItems[0]?.id ?? null;

  for (const item of reachableItems) {
    const sectionElement = getSectionElementById(sectionElements, item.id);

    if (
      sectionElement &&
      sectionElement.getBoundingClientRect().top <= readingLine
    ) {
      activeId = item.id;
    }
  }

  return activeId;
}

export function getNavigationLayout({
  items,
  rootElement,
  sectionElements,
  viewport,
}: {
  items: readonly ControlsPanelSectionNavigationItem[];
  rootElement: HTMLElement;
  sectionElements: readonly HTMLElement[];
  viewport: HTMLElement | null;
}): NavigationLayout {
  if (!viewport || !rootElement.contains(viewport)) {
    return hiddenNavigationLayout;
  }

  const viewportRect = viewport.getBoundingClientRect();
  const rootRect = rootElement.getBoundingClientRect();
  const hasOverflow =
    viewport.scrollHeight >
    viewport.clientHeight + controlsPanelScrollTolerancePx;
  const available = items.length > 0 && hasOverflow;

  return {
    activeId: available
      ? getActiveSectionId({ items, sectionElements, viewport })
      : null,
    available,
    centerY: viewportRect.top - rootRect.top + viewportRect.height / 2,
    maxHeight: viewportRect.height,
  };
}

function pointIsInsideRect({
  clientX,
  clientY,
  rect,
}: {
  clientX: number;
  clientY: number;
  rect: DOMRect;
}): boolean {
  return (
    clientX >= rect.left &&
    clientX <= rect.right &&
    clientY >= rect.top &&
    clientY <= rect.bottom
  );
}

export function pointerIsInsideNavigationRegion({
  clientX,
  clientY,
  panelRect,
  surfaceRect,
}: {
  clientX: number;
  clientY: number;
  panelRect: DOMRect;
  surfaceRect: DOMRect;
}): boolean {
  const panelHotZoneRect = {
    bottom: panelRect.bottom,
    left: panelRect.left,
    right: Math.min(
      panelRect.right,
      panelRect.left + controlsPanelLeftPaddingPx,
    ),
    top: panelRect.top,
  } as DOMRect;
  const transferCorridorRect = {
    bottom: surfaceRect.bottom,
    left: Math.min(surfaceRect.right, panelRect.left),
    right: Math.max(surfaceRect.right, panelRect.left),
    top: surfaceRect.top,
  } as DOMRect;

  return (
    pointIsInsideRect({ clientX, clientY, rect: panelHotZoneRect }) ||
    pointIsInsideRect({ clientX, clientY, rect: surfaceRect }) ||
    pointIsInsideRect({ clientX, clientY, rect: transferCorridorRect })
  );
}
