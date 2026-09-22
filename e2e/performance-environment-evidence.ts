import { test, type Page } from "@playwright/test";

import type { ToolcraftBrowserPerformanceAttachment } from "../src/app/test-evidence/browser-performance-contract";

export const TOOLCRAFT_PERFORMANCE_ENVIRONMENT_EVIDENCE_VERSION = 1 as const;
export const TOOLCRAFT_PERFORMANCE_ENVIRONMENT_ATTACHMENT_NAME =
  "toolcraft.performance-environment";
export const TOOLCRAFT_PERFORMANCE_ENVIRONMENT_CONTENT_TYPE =
  "application/vnd.toolcraft.performance-environment+json";

export type ToolcraftPerformanceEnvironmentEvidence = Readonly<{
  browser: Readonly<{ name: string; version: string }>;
  calibration: Readonly<{ durationMs: number; iterations: number }>;
  cpuThrottling: Readonly<{ mode: "cdp" | "none"; rate: number }>;
  evidenceType: "performance-environment";
  hardwareConcurrency: number;
  version: typeof TOOLCRAFT_PERFORMANCE_ENVIRONMENT_EVIDENCE_VERSION;
  viewport: Readonly<{ height: number; width: number }>;
}>;

type DecodeResult =
  | Readonly<{ evidence: ToolcraftPerformanceEnvironmentEvidence; ok: true }>
  | Readonly<{ error: string; ok: false }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function readEnvironment(value: unknown): DecodeResult {
  if (!isRecord(value)) {
    return { error: "Performance environment must be an object.", ok: false };
  }
  const expectedKeys = [
    "browser",
    "calibration",
    "cpuThrottling",
    "evidenceType",
    "hardwareConcurrency",
    "version",
    "viewport",
  ];
  if (
    Object.keys(value).length !== expectedKeys.length ||
    expectedKeys.some((key) => !Object.prototype.hasOwnProperty.call(value, key))
  ) {
    return {
      error: "Performance environment fields do not match the protected contract.",
      ok: false,
    };
  }
  if (
    value.evidenceType !== "performance-environment" ||
    value.version !== TOOLCRAFT_PERFORMANCE_ENVIRONMENT_EVIDENCE_VERSION
  ) {
    return { error: "Performance environment identity is invalid.", ok: false };
  }
  if (
    !isRecord(value.browser) ||
    typeof value.browser.name !== "string" ||
    !value.browser.name ||
    typeof value.browser.version !== "string" ||
    !value.browser.version
  ) {
    return { error: "Performance environment browser is invalid.", ok: false };
  }
  if (
    !isRecord(value.viewport) ||
    !Number.isSafeInteger(value.viewport.width) ||
    (value.viewport.width as number) <= 0 ||
    !Number.isSafeInteger(value.viewport.height) ||
    (value.viewport.height as number) <= 0
  ) {
    return { error: "Performance environment viewport is invalid.", ok: false };
  }
  if (
    !Number.isSafeInteger(value.hardwareConcurrency) ||
    (value.hardwareConcurrency as number) <= 0
  ) {
    return {
      error: "Performance environment hardwareConcurrency is invalid.",
      ok: false,
    };
  }
  if (
    !isRecord(value.cpuThrottling) ||
    (value.cpuThrottling.mode !== "none" && value.cpuThrottling.mode !== "cdp") ||
    !isFiniteNonNegative(value.cpuThrottling.rate) ||
    (value.cpuThrottling.rate as number) < 1
  ) {
    return { error: "Performance environment CPU throttling is invalid.", ok: false };
  }
  if (
    !isRecord(value.calibration) ||
    !isFiniteNonNegative(value.calibration.durationMs) ||
    !Number.isSafeInteger(value.calibration.iterations) ||
    (value.calibration.iterations as number) <= 0
  ) {
    return { error: "Performance environment calibration is invalid.", ok: false };
  }

  return {
    evidence: Object.freeze({
      browser: Object.freeze({
        name: value.browser.name,
        version: value.browser.version,
      }),
      calibration: Object.freeze({
        durationMs: value.calibration.durationMs as number,
        iterations: value.calibration.iterations as number,
      }),
      cpuThrottling: Object.freeze({
        mode: value.cpuThrottling.mode,
        rate: value.cpuThrottling.rate as number,
      }),
      evidenceType: "performance-environment",
      hardwareConcurrency: value.hardwareConcurrency as number,
      version: TOOLCRAFT_PERFORMANCE_ENVIRONMENT_EVIDENCE_VERSION,
      viewport: Object.freeze({
        height: value.viewport.height as number,
        width: value.viewport.width as number,
      }),
    }),
    ok: true,
  };
}

function decodeBody(body: string | Uint8Array | undefined): string | undefined {
  if (typeof body === "string") return body;
  return body ? new TextDecoder().decode(body) : undefined;
}

export function decodeToolcraftPerformanceEnvironment(
  body: string | Uint8Array | undefined,
): DecodeResult {
  const decoded = decodeBody(body);
  if (!decoded) return { error: "Performance environment body is missing.", ok: false };
  try {
    return readEnvironment(JSON.parse(decoded) as unknown);
  } catch {
    return { error: "Performance environment body is not valid JSON.", ok: false };
  }
}

export function parseToolcraftPerformanceEnvironment(
  attachment: ToolcraftBrowserPerformanceAttachment | undefined,
): ToolcraftPerformanceEnvironmentEvidence | undefined {
  if (
    !attachment ||
    attachment.name !== TOOLCRAFT_PERFORMANCE_ENVIRONMENT_ATTACHMENT_NAME ||
    attachment.contentType !== TOOLCRAFT_PERFORMANCE_ENVIRONMENT_CONTENT_TYPE
  ) {
    return undefined;
  }
  const decoded = decodeToolcraftPerformanceEnvironment(attachment.body);
  return decoded.ok ? decoded.evidence : undefined;
}

export async function attachToolcraftPerformanceEnvironmentEvidence(
  page: Page,
): Promise<void> {
  const viewport = page.viewportSize();
  const browser = page.context().browser();
  if (!viewport || !browser) {
    throw new Error("Toolcraft performance environment requires a browser and fixed viewport.");
  }
  const browserValues = await page.evaluate(() => {
    const iterations = 250_000;
    const startedAt = performance.now();
    let accumulator = 0;
    for (let index = 0; index < iterations; index += 1) {
      accumulator = (accumulator + Math.imul(index, 31)) | 0;
    }
    const durationMs = performance.now() - startedAt;
    return {
      accumulator,
      durationMs,
      hardwareConcurrency: navigator.hardwareConcurrency,
      iterations,
    };
  });
  if (!Number.isFinite(browserValues.accumulator)) {
    throw new Error("Toolcraft performance calibration did not complete.");
  }
  const evidence = readEnvironment({
    browser: { name: browser.browserType().name(), version: browser.version() },
    calibration: {
      durationMs: browserValues.durationMs,
      iterations: browserValues.iterations,
    },
    cpuThrottling: { mode: "none", rate: 1 },
    evidenceType: "performance-environment",
    hardwareConcurrency: browserValues.hardwareConcurrency,
    version: TOOLCRAFT_PERFORMANCE_ENVIRONMENT_EVIDENCE_VERSION,
    viewport,
  });
  if (!evidence.ok) throw new Error(evidence.error);
  await test.info().attach(TOOLCRAFT_PERFORMANCE_ENVIRONMENT_ATTACHMENT_NAME, {
    body: JSON.stringify(evidence.evidence),
    contentType: TOOLCRAFT_PERFORMANCE_ENVIRONMENT_CONTENT_TYPE,
  });
}
