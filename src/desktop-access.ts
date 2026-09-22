export type DesktopAccessSignals = Readonly<{
  width: number;
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
  mobile?: boolean;
  touchOnly: boolean;
}>;

/** CSS pixels, independent of device pixel ratio / Retina resolution. */
export function supportsDesktopApp(signals: DesktopAccessSignals): boolean {
  const mobileOrTablet =
    signals.mobile === true ||
    /Android|iPhone|iPad|iPod|Mobile|Tablet|Silk|Kindle|PlayBook/i.test(signals.userAgent) ||
    (/Mac/i.test(signals.platform) && signals.maxTouchPoints > 1) ||
    signals.touchOnly;

  return signals.width >= 1024 && !mobileOrTablet;
}

/** Run before importing the router, React or any product/rendering modules. */
export function startDesktopApp(loadApp: () => Promise<unknown>): () => void {
  const touchInput = window.matchMedia("(hover: none) and (pointer: coarse)");
  const fineInput = window.matchMedia("(any-pointer: fine)");
  const notice = document.createElement("dialog");
  notice.id = "toolcraft-desktop-notice";
  notice.setAttribute("aria-label", "Desktop app required");
  notice.setAttribute("aria-describedby", "toolcraft-desktop-description");
  notice.innerHTML = `
    <div class="toolcraft-desktop-message">
      <p id="toolcraft-desktop-description" tabindex="-1" autofocus>This app is designed for desktop use. Open it on a desktop or laptop with a window at least 1024px wide.</p>
    </div>`;
  // The modal also blocks focus and interaction with portals outside #root.
  notice.addEventListener("cancel", (event) => event.preventDefault());
  document.body.append(notice);
  let started = false;
  let failed = false;
  let disposed = false;

  function blockAppShortcuts(event: KeyboardEvent) {
    if (notice.open) event.stopImmediatePropagation();
  }

  function update() {
    const browser = navigator as Navigator & { userAgentData?: { mobile: boolean } };
    const supported = supportsDesktopApp({
      width: window.innerWidth,
      userAgent: browser.userAgent,
      platform: browser.platform,
      maxTouchPoints: browser.maxTouchPoints,
      mobile: browser.userAgentData?.mobile,
      touchOnly: touchInput.matches && !fineInput.matches,
    });

    if (!supported || failed) {
      if (!notice.open) notice.showModal();
      return;
    }

    if (notice.open) notice.close();
    if (!started) {
      started = true;
      void loadApp().catch((error: unknown) => {
        if (disposed) return;
        failed = true;
        console.error("Unable to start Toolcraft app", error);
        notice.setAttribute("aria-label", "Unable to load the app");
        notice.querySelector("p")!.textContent = "Unable to load the app. Please reload this page to try again.";
        update();
      });
    }
  }

  window.addEventListener("resize", update);
  window.addEventListener("keydown", blockAppShortcuts, true);
  window.addEventListener("keyup", blockAppShortcuts, true);
  touchInput.addEventListener("change", update);
  fineInput.addEventListener("change", update);
  update();

  return () => {
    disposed = true;
    window.removeEventListener("resize", update);
    window.removeEventListener("keydown", blockAppShortcuts, true);
    window.removeEventListener("keyup", blockAppShortcuts, true);
    touchInput.removeEventListener("change", update);
    fineInput.removeEventListener("change", update);
    notice.remove();
  };
}
