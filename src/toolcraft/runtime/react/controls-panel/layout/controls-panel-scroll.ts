const SCROLL_COMMIT_DELAY_MS = 120;
const scrollKeys = new Set([
  "ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " ",
]);
const inputEvents = ["wheel", "touchstart", "pointerdown", "keydown"] as const;

/** Workspace UI preference, independent of product history and settings. */
export function createControlsPanelScrollController({
  viewport,
  initialScrollTop,
  onScrollTopChange,
}: {
  viewport: HTMLDivElement;
  initialScrollTop: number;
  onScrollTopChange: (scrollTop: number) => void;
}): { dispose: () => void; flush: () => void } {
  const view = viewport.ownerDocument.defaultView!;
  let saved = Number.isFinite(initialScrollTop) ? Math.max(0, initialScrollTop) : 0;
  let restoreTarget: number | null = saved;
  let restoredTop: number | null = null;
  let pending: number | undefined;
  let timer: number | undefined;
  let frame: number | undefined;
  let disposed = false;
  const resizeObserver =
    typeof ResizeObserver === "undefined"
      ? undefined
      : new ResizeObserver(scheduleRestore);
  const mutationObserver = new MutationObserver(() => {
    observeContent();
    scheduleRestore();
  });

  function stopRestoring(): void {
    restoreTarget = null;
    resizeObserver?.disconnect();
    mutationObserver.disconnect();
    if (frame !== undefined) view.cancelAnimationFrame(frame);
    frame = undefined;
  }

  function restore(): void {
    frame = undefined;
    if (restoreTarget === null || disposed) return;
    const max = Math.max(0, viewport.scrollHeight - viewport.clientHeight);
    restoredTop = Math.min(restoreTarget, max);
    viewport.scrollTop = restoredTop;
    // Keep the desired offset until late content can accommodate it. Never save
    // a temporary clamp (especially zero during initial layout) over that offset.
    if (max >= restoreTarget) stopRestoring();
  }

  function scheduleRestore(): void {
    if (restoreTarget !== null && frame === undefined && !disposed) {
      frame = view.requestAnimationFrame(restore);
    }
  }

  function observeContent(): void {
    if (restoreTarget === null) return;
    resizeObserver?.disconnect();
    resizeObserver?.observe(viewport);
    for (const child of viewport.children) resizeObserver?.observe(child);
  }

  function commitPending(): void {
    view.clearTimeout(timer);
    timer = undefined;
    if (pending === undefined) return;
    const next = pending;
    pending = undefined;
    if (next === saved) return;
    saved = next;
    onScrollTopChange(next);
  }

  function onScroll(): void {
    const top = Math.max(0, viewport.scrollTop);
    if (top === restoredTop) return;
    stopRestoring();
    restoredTop = null;
    pending = top;
    view.clearTimeout(timer);
    timer = view.setTimeout(commitPending, SCROLL_COMMIT_DELAY_MS);
  }

  function onUserInput(event: Event): void {
    if (event instanceof KeyboardEvent && !scrollKeys.has(event.key)) return;
    stopRestoring();
    restoredTop = null;
  }

  function flush(): void {
    // Called by persistence before serializing, never by a competing pagehide
    // listener. Navigation can happen before the browser's queued scroll event.
    if (restoreTarget === null) pending = Math.max(0, viewport.scrollTop);
    commitPending();
  }

  viewport.addEventListener("scroll", onScroll, { passive: true });
  for (const type of inputEvents) {
    viewport.addEventListener(type, onUserInput, { passive: true });
  }
  observeContent();
  mutationObserver.observe(viewport, { childList: true, subtree: true });
  restore();

  return {
    flush,
    dispose() {
      if (disposed) return;
      disposed = true;
      stopRestoring();
      viewport.removeEventListener("scroll", onScroll);
      for (const type of inputEvents) {
        viewport.removeEventListener(type, onUserInput);
      }
      // Detached viewport geometry may already be zero; flush observed state.
      commitPending();
    },
  };
}
