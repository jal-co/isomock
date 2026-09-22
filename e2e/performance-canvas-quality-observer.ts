import type { ToolcraftCanvasBackingMetrics } from "./browser-render-scale-evidence";

export type ToolcraftPerformanceCanvasQualityObservation = Readonly<{
  kind: "attribute" | "installed" | "resize" | "visible-size";
  metrics: ToolcraftCanvasBackingMetrics;
}>;

type ToolcraftPerformanceCanvasQualityHandshake = Readonly<{
  kind: "handshake";
}>;

export type ToolcraftPerformanceCanvasQualityInstallerOptions = Readonly<{
  baselineCssSize: Readonly<{ height: number; width: number }>;
  bindingName: string;
  canvasSelector: string;
  stateKey: string;
}>;

export function isToolcraftPerformanceCanvasQualityHandshake(
  value: unknown,
): value is ToolcraftPerformanceCanvasQualityHandshake {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    (value as { kind?: unknown }).kind === "handshake"
  );
}

export function isToolcraftPerformanceCanvasQualityObservation(
  value: unknown,
): value is ToolcraftPerformanceCanvasQualityObservation {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const observation = value as Record<string, unknown>;
  const metrics = observation.metrics;
  return (
    (observation.kind === "attribute" ||
      observation.kind === "installed" ||
      observation.kind === "resize" ||
      observation.kind === "visible-size") &&
    typeof metrics === "object" &&
    metrics !== null &&
    !Array.isArray(metrics) &&
    [
      "backingHeight",
      "backingWidth",
      "cssHeight",
      "cssWidth",
      "devicePixelRatio",
    ].every((key) => Number.isFinite((metrics as Record<string, unknown>)[key]))
  );
}

export async function installToolcraftPerformanceCanvasQualityObserver({
  baselineCssSize,
  bindingName,
  canvasSelector,
  stateKey,
}: ToolcraftPerformanceCanvasQualityInstallerOptions): Promise<void> {
  type BrowserBinding = (
    message:
      | ToolcraftPerformanceCanvasQualityHandshake
      | ToolcraftPerformanceCanvasQualityObservation,
  ) => Promise<boolean>;
  type BrowserState = Readonly<{
    begin: () => void;
    dispose: () => void;
    flush: () => Promise<void>;
  }>;

  if (window !== window.top || Reflect.get(globalThis, stateKey)) return;
  const binding = Reflect.get(globalThis, bindingName) as
    | BrowserBinding
    | undefined;
  if (typeof binding !== "function") {
    throw new Error("Toolcraft canvas quality guard binding is unavailable.");
  }

  const earlyObservations: ToolcraftPerformanceCanvasQualityObservation[] = [];
  let earlyLastMetrics: ToolcraftCanvasBackingMetrics | undefined;
  const readVisibleMetrics = (
    canvas: HTMLCanvasElement,
  ): ToolcraftCanvasBackingMetrics | undefined => {
    const rect = canvas.getBoundingClientRect();
    if (
      !canvas.isConnected ||
      rect.width <= 0 ||
      rect.height <= 0 ||
      getComputedStyle(canvas).visibility === "hidden"
    ) {
      return undefined;
    }
    return {
      backingHeight: canvas.height,
      backingWidth: canvas.width,
      cssHeight: rect.height,
      cssWidth: rect.width,
      devicePixelRatio: window.devicePixelRatio || 1,
    };
  };
  const restorePreMutationBackingMetrics = (
    record: MutationRecord,
    basis: ToolcraftCanvasBackingMetrics,
  ): ToolcraftCanvasBackingMetrics => ({
    ...basis,
    ...(record.attributeName === "width"
      ? {
          backingWidth:
            record.oldValue === null ? 300 : Number(record.oldValue),
        }
      : {
          backingHeight:
            record.oldValue === null ? 150 : Number(record.oldValue),
        }),
  });
  const captureEarlyVisibleCanvas = () => {
    const candidate = document.querySelector(canvasSelector);
    if (!(candidate instanceof HTMLCanvasElement)) return;
    const metrics = readVisibleMetrics(candidate);
    if (!metrics) return;
    earlyLastMetrics = metrics;
    earlyObservations.push({ kind: "installed", metrics });
  };
  const captureEarlyRecords = (records: readonly MutationRecord[]) => {
    const previousMetrics = earlyLastMetrics;
    captureEarlyVisibleCanvas();
    for (const record of records) {
      const target = record.target;
      if (
        !(target instanceof HTMLCanvasElement) ||
        !target.matches(canvasSelector) ||
        (record.attributeName !== "width" &&
          record.attributeName !== "height")
      ) {
        continue;
      }
      const basis = readVisibleMetrics(target) ?? {
        backingHeight: target.height,
        backingWidth: target.width,
        cssHeight: baselineCssSize.height,
        cssWidth: baselineCssSize.width,
        devicePixelRatio: window.devicePixelRatio || 1,
      };
      earlyObservations.push({ kind: "attribute", metrics: basis });
      earlyObservations.push({
        kind: "attribute",
        metrics: restorePreMutationBackingMetrics(
          record,
          previousMetrics ?? basis,
        ),
      });
    }
  };
  const authorityObserver = new MutationObserver(captureEarlyRecords);
  authorityObserver.observe(document, {
    attributeFilter: ["class", "height", "style", "width"],
    attributeOldValue: true,
    attributes: true,
    childList: true,
    subtree: true,
  });
  captureEarlyVisibleCanvas();
  let sessionActive = false;
  try {
    sessionActive = await binding({ kind: "handshake" });
  } finally {
    captureEarlyRecords(authorityObserver.takeRecords());
    authorityObserver.disconnect();
  }
  if (!sessionActive || Reflect.get(globalThis, stateKey)) return;

  const bufferedObservations = [...earlyObservations];
  let attributeObserver: MutationObserver | undefined;
  let discoveryObserver: MutationObserver | undefined;
  let replacementObserver: MutationObserver | undefined;
  let resizeObserver: ResizeObserver | undefined;
  let visibleSizeObserver: MutationObserver | undefined;
  let lastConnectedMetrics: ToolcraftCanvasBackingMetrics | undefined;
  let observedCanvas: HTMLCanvasElement | undefined;

  const deliver = (
    kind: ToolcraftPerformanceCanvasQualityObservation["kind"],
    metrics: ToolcraftCanvasBackingMetrics,
  ) => {
    bufferedObservations.push({ kind, metrics });
  };

  const sendCanvas = (
    kind: ToolcraftPerformanceCanvasQualityObservation["kind"],
    canvas: HTMLCanvasElement,
  ) => {
    const metrics = readVisibleMetrics(canvas);
    if (!metrics) return;
    lastConnectedMetrics = metrics;
    deliver(kind, metrics);
  };

  const sendUsingLastVisibleSize = (
    kind: ToolcraftPerformanceCanvasQualityObservation["kind"],
    canvas: HTMLCanvasElement,
  ) => {
    const connected = readVisibleMetrics(canvas);
    if (connected) lastConnectedMetrics = connected;
    const basis = connected ?? lastConnectedMetrics;
    if (!basis) return;
    deliver(kind, {
      ...basis,
      backingHeight: canvas.height,
      backingWidth: canvas.width,
    });
  };

  const processAttributeRecords = (
    canvas: HTMLCanvasElement,
    records: readonly MutationRecord[],
  ) => {
    if (records.length === 0) return;
    const previousMetrics = lastConnectedMetrics;
    for (const record of records) {
      if (record.attributeName !== "width" && record.attributeName !== "height")
        continue;
      const currentMetrics = readVisibleMetrics(canvas) ?? lastConnectedMetrics;
      if (!currentMetrics) continue;
      deliver(
        "attribute",
        restorePreMutationBackingMetrics(
          record,
          previousMetrics ?? currentMetrics,
        ),
      );
    }
    sendUsingLastVisibleSize("attribute", canvas);
  };

  const disconnectCanvasObservers = () => {
    if (attributeObserver && observedCanvas) {
      processAttributeRecords(observedCanvas, attributeObserver.takeRecords());
    }
    attributeObserver?.disconnect();
    replacementObserver?.disconnect();
    resizeObserver?.disconnect();
    visibleSizeObserver?.disconnect();
    attributeObserver = undefined;
    replacementObserver = undefined;
    resizeObserver = undefined;
    visibleSizeObserver = undefined;
    lastConnectedMetrics = undefined;
    observedCanvas = undefined;
  };

  const findVisibleCanvas = (): HTMLCanvasElement | undefined => {
    const candidate = document.querySelector(canvasSelector);
    if (!(candidate instanceof HTMLCanvasElement)) return undefined;
    const rect = candidate.getBoundingClientRect();
    return candidate.isConnected && rect.width > 0 && rect.height > 0
      ? candidate
      : undefined;
  };

  const observeCanvas = (canvas: HTMLCanvasElement) => {
    if (observedCanvas === canvas) return;
    disconnectCanvasObservers();
    observedCanvas = canvas;
    discoveryObserver?.disconnect();
    discoveryObserver = undefined;

    attributeObserver = new MutationObserver((records) =>
      processAttributeRecords(canvas, records),
    );
    attributeObserver.observe(canvas, {
      attributeFilter: ["height", "width"],
      attributeOldValue: true,
      attributes: true,
    });

    resizeObserver = new ResizeObserver(() => sendCanvas("resize", canvas));
    resizeObserver.observe(canvas);

    visibleSizeObserver = new MutationObserver(() =>
      sendCanvas("visible-size", canvas),
    );
    const visibleSizeTargets = new Set<Element>([canvas]);
    let ancestor = canvas.parentElement;
    while (ancestor) {
      visibleSizeTargets.add(ancestor);
      if (ancestor === document.documentElement) break;
      ancestor = ancestor.parentElement;
    }
    for (const target of visibleSizeTargets) {
      visibleSizeObserver.observe(target, {
        attributeFilter: ["class", "style"],
        attributes: true,
      });
    }

    const parent = canvas.parentNode;
    if (parent) {
      replacementObserver = new MutationObserver(() => {
        const replacement = findVisibleCanvas();
        if (replacement && replacement !== observedCanvas) {
          observeCanvas(replacement);
        }
      });
      replacementObserver.observe(parent, { childList: true });
    }
    sendCanvas("installed", canvas);
  };

  const discoverCanvas = () => {
    const canvas = findVisibleCanvas();
    if (canvas) {
      observeCanvas(canvas);
      return;
    }
    if (discoveryObserver) return;
    discoveryObserver = new MutationObserver(() => {
      const discovered = findVisibleCanvas();
      if (discovered) observeCanvas(discovered);
    });
    discoveryObserver.observe(document, {
      attributes: true,
      childList: true,
      subtree: true,
    });
  };

  const state: BrowserState = {
    begin: () => {
      bufferedObservations.length = 0;
    },
    dispose: () => {
      bufferedObservations.length = 0;
      discoveryObserver?.disconnect();
      discoveryObserver = undefined;
      disconnectCanvasObservers();
    },
    flush: async () => {
      while (bufferedObservations.length > 0) {
        const batch = bufferedObservations.splice(
          0,
          bufferedObservations.length,
        );
        await Promise.all(batch.map((observation) => binding(observation)));
      }
    },
  };
  Reflect.set(globalThis, stateKey, state);
  discoverCanvas();
}
