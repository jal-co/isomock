type BrowserFrameHandle = number | null;
type BrowserTimeoutHandle = number | null;

const noCleanup = () => undefined;

function escapeSelectorValue(value: string) {
  return typeof CSS !== "undefined" && typeof CSS.escape === "function"
    ? CSS.escape(value)
    : value.replace(/["\\]/g, "\\$&");
}

export function blurActiveBrowserElement(
  element: HTMLElement | null | undefined,
): void {
  if (element && document.activeElement === element) element.blur();
}

export function writeBrowserCookie(cookie: string): void {
  document.cookie = cookie;
}

export function readBrowserCssCustomProperty(name: string): string {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return "";
  }
  return window.getComputedStyle(document.documentElement).getPropertyValue(name);
}

export async function loadBrowserFontStylesheet(href: string): Promise<boolean> {
  if (typeof document === "undefined") return false;

  const existing = document.head.querySelector<HTMLLinkElement>(
    `link[data-toolcraft-font-href="${escapeSelectorValue(href)}"]`,
  );
  if (existing?.dataset.loaded === "true") return true;

  const link = existing ?? document.createElement("link");
  if (!existing) {
    link.rel = "stylesheet";
    link.href = href;
    link.crossOrigin = "anonymous";
    link.dataset.toolcraftFontHref = href;
  }

  const loaded = new Promise<boolean>((resolve) => {
    link.addEventListener(
      "load",
      () => {
        link.dataset.loaded = "true";
        resolve(true);
      },
      { once: true },
    );
    link.addEventListener("error", () => resolve(false), { once: true });
  });
  if (!existing) document.head.appendChild(link);
  return loaded;
}

export function isBrowserFontFaceLoaded(descriptor: string): boolean {
  if (typeof document === "undefined" || !("fonts" in document)) return true;
  const fontFaceSet = document.fonts;
  if (typeof fontFaceSet.check === "function") {
    return fontFaceSet.check(descriptor);
  }
  return typeof fontFaceSet.load !== "function";
}

export async function loadBrowserFontFace(descriptor: string): Promise<boolean> {
  if (typeof document === "undefined" || !("fonts" in document)) return false;
  const fontFaceSet = document.fonts;
  if (typeof fontFaceSet.load !== "function") return false;
  await fontFaceSet.load(descriptor);
  return true;
}

export function requestBrowserAnimationFrame(
  callback: FrameRequestCallback,
): BrowserFrameHandle {
  if (
    typeof window === "undefined" ||
    typeof window.requestAnimationFrame !== "function"
  ) return null;
  return window.requestAnimationFrame(callback);
}

export function cancelBrowserAnimationFrame(handle: BrowserFrameHandle): void {
  if (
    handle !== null &&
    typeof window !== "undefined" &&
    typeof window.cancelAnimationFrame === "function"
  ) window.cancelAnimationFrame(handle);
}

export function scheduleBrowserAnimationFrames(
  callback: () => void,
  frameCount = 1,
): () => void {
  if (typeof window === "undefined") return noCleanup;
  if (typeof window.requestAnimationFrame !== "function") {
    const timeout = window.setTimeout(callback, 0);
    return () => window.clearTimeout(timeout);
  }
  let handle = 0;
  let remaining = Math.max(1, frameCount);
  const advance = () => {
    remaining -= 1;
    if (remaining === 0) callback();
    else handle = window.requestAnimationFrame(advance);
  };
  handle = window.requestAnimationFrame(advance);
  return () => window.cancelAnimationFrame(handle);
}

export function setBrowserTimeout(
  callback: () => void,
  delay: number,
): BrowserTimeoutHandle {
  return typeof window === "undefined" ? null : window.setTimeout(callback, delay);
}

export function clearBrowserTimeout(handle: BrowserTimeoutHandle): void {
  if (handle !== null && typeof window !== "undefined") {
    window.clearTimeout(handle);
  }
}

export function subscribeBrowserWindowEvent<K extends keyof WindowEventMap>(
  type: K,
  listener: (event: WindowEventMap[K]) => void,
  options?: AddEventListenerOptions | boolean,
): () => void {
  if (typeof window === "undefined") return noCleanup;
  const eventListener = listener as EventListener;
  window.addEventListener(type, eventListener, options);
  return () => window.removeEventListener(type, eventListener, options);
}

export function subscribeBrowserElementEvent<K extends keyof HTMLElementEventMap>(
  element: HTMLElement,
  type: K,
  listener: (event: HTMLElementEventMap[K]) => void,
  options?: AddEventListenerOptions | boolean,
): () => void {
  const eventListener = listener as EventListener;
  element.addEventListener(type, eventListener, options);
  return () => element.removeEventListener(type, eventListener, options);
}

export function observeBrowserResize(
  elements: readonly Element[],
  listener: () => void,
): () => void {
  if (typeof ResizeObserver === "undefined") return noCleanup;
  const observer = new ResizeObserver(listener);
  for (const element of elements) observer.observe(element);
  return () => observer.disconnect();
}

export function browserMediaQueryMatches(query: string): boolean {
  return typeof window !== "undefined" && window.matchMedia(query).matches;
}

export function subscribeBrowserMediaQuery(
  query: string,
  listener: () => void,
): () => void {
  if (typeof window === "undefined") return noCleanup;
  const mediaQueryList = window.matchMedia(query);
  mediaQueryList.addEventListener("change", listener);
  return () => mediaQueryList.removeEventListener("change", listener);
}

export function readBrowserViewportWidth(): number | null {
  return typeof window === "undefined" ? null : window.innerWidth;
}

export function configureBrowserDirectoryInput(input: HTMLInputElement): void {
  input.setAttribute("webkitdirectory", "");
  input.setAttribute("directory", "");
}

export function selectBrowserElementContents(element: HTMLElement): void {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(element);
  selection.removeAllRanges();
  selection.addRange(range);
}

export type { BrowserFrameHandle, BrowserTimeoutHandle };
