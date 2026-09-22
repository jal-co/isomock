import { expect, test, type TestInfo } from "@playwright/test";

import {
  TOOLCRAFT_BROWSER_RUNTIME_EVIDENCE_ATTACHMENT_NAME,
  TOOLCRAFT_BROWSER_RUNTIME_EVIDENCE_CONTENT_TYPE,
  parseToolcraftBrowserRuntimeEvidence,
  serializeToolcraftBrowserRuntimeEvidence,
} from "../src/app/test-evidence/browser-runtime-contract";
import {
  TOOLCRAFT_BROWSER_PERFORMANCE_EVIDENCE_ATTACHMENT_NAME,
  TOOLCRAFT_BROWSER_PERFORMANCE_EVIDENCE_CONTENT_TYPE,
  parseToolcraftBrowserPerformanceEvidence,
  serializeToolcraftBrowserPerformanceEvidence,
  type ToolcraftPerformancePipelineEvidence,
} from "../src/app/test-evidence/browser-performance-contract";
import { measureToolcraftInteraction } from "./performance-probe-helpers";

const pipelinePassCounters = () => ({
  activeResources: 0,
  cacheHits: 0,
  cacheMisses: 0,
  durationMax: 0,
  durationTotal: 0,
  executions: 0,
  resourceCreations: 0,
  resourceDisposals: 0,
  transfers: 0,
});

function pipelineEvidenceInput() {
  return {
    after: {
      disposed: false,
      passes: [{ passId: "composite", ...pipelinePassCounters() }],
      runtimeId: "performance-contract-test-v1",
    },
    before: {
      disposed: false,
      passes: [{ passId: "composite", ...pipelinePassCounters() }],
      runtimeId: "performance-contract-test-v1",
    },
    evidenceType: "performance-pipeline",
    pathId: "performance-path:test",
    phase: "cold",
    profile: "interactive-continuous",
  } satisfies Omit<ToolcraftPerformancePipelineEvidence, "version">;
}

function performanceAttachment(body: string) {
  return {
    body,
    contentType: TOOLCRAFT_BROWSER_PERFORMANCE_EVIDENCE_CONTENT_TYPE,
    name: TOOLCRAFT_BROWSER_PERFORMANCE_EVIDENCE_ATTACHMENT_NAME,
  };
}

function evidenceTypesSince(testInfo: TestInfo, attachmentCount: number) {
  return testInfo.attachments
    .slice(attachmentCount)
    .filter(
      (attachment) =>
        attachment.name === TOOLCRAFT_BROWSER_RUNTIME_EVIDENCE_ATTACHMENT_NAME,
    )
    .map((attachment) => parseToolcraftBrowserRuntimeEvidence(attachment)?.evidenceType);
}

test("performance interaction evidence requires a persistent changed outcome", async ({
  page,
}, testInfo) => {
  await page.setContent('<div id="outcome">before</div>');
  const attachmentCount = testInfo.attachments.length;

  await expect(
    measureToolcraftInteraction(page, async () => undefined, {
      observeOutcome: () => page.locator("#outcome").textContent(),
      outcomeTimeoutMs: 100,
      pathId: "no-op-outcome",
    }),
  ).rejects.toThrow(/performance outcome/i);
  expect(evidenceTypesSince(testInfo, attachmentCount)).toEqual([]);

  const result = await measureToolcraftInteraction(
    page,
    () => page.locator("#outcome").evaluate((node) => {
      node.textContent = "after";
    }),
    {
      observeOutcome: () => page.locator("#outcome").textContent(),
      pathId: "changed-outcome",
      stabilityIntervalMs: 10,
    },
  );

  expect(Object.isFrozen(result)).toBe(true);
  expect(evidenceTypesSince(testInfo, attachmentCount)).toEqual([
    "performance-product-outcome",
    "performance-measurement",
  ]);

  const mutableOutcome = { value: "before" };
  const mutableAttachmentCount = testInfo.attachments.length;
  await measureToolcraftInteraction(
    page,
    async () => {
      mutableOutcome.value = "after";
    },
    {
      observeOutcome: async () => mutableOutcome,
      pathId: "mutable-outcome",
      stabilityIntervalMs: 0,
    },
  );
  expect(evidenceTypesSince(testInfo, mutableAttachmentCount)).toEqual([
    "performance-product-outcome",
    "performance-measurement",
  ]);
});

test("performance interaction rejects autonomous deltas and times an expected semantic outcome", async ({
  page,
}, testInfo) => {
  await page.setContent(`
    <div id="animated-output">0</div>
    <div id="semantic-outcome">idle</div>
    <script>
      let frame = 0;
      setInterval(() => {
        frame += 1;
        document.querySelector("#animated-output").textContent = String(frame);
      }, 8);
    </script>
  `);
  const attachmentCount = testInfo.attachments.length;

  await expect(
    measureToolcraftInteraction(page, async () => undefined, {
      baselineStabilityIntervalMs: 12,
      baselineStabilitySamples: 3,
      observeOutcome: () => page.locator("#animated-output").textContent(),
      outcomeTimeoutMs: 150,
      pathId: "autonomous-no-op",
    }),
  ).rejects.toThrow(/baseline must remain stable/u);
  expect(evidenceTypesSince(testInfo, attachmentCount)).toEqual([]);

  const result = await measureToolcraftInteraction(
    page,
    async () => {
      await page.waitForTimeout(40);
      await page.locator("#semantic-outcome").evaluate((node) => {
        node.textContent = "applied";
      });
    },
    {
      expectedOutcome: "applied",
      observeOutcome: () => page.locator("#semantic-outcome").textContent(),
      pathId: "expected-semantic-outcome",
      stabilityIntervalMs: 10,
    },
  );

  expect(result.durationMs).toBeGreaterThanOrEqual(30);
  expect(evidenceTypesSince(testInfo, attachmentCount)).toEqual([
    "performance-product-outcome",
    "performance-measurement",
  ]);
});

test("performance-pipeline serialization contains raw facts only and deep-copies snapshots", () => {
  const mutable = pipelineEvidenceInput();
  mutable.after.passes[0].executions = 1;
  const serialized = serializeToolcraftBrowserPerformanceEvidence(mutable);

  mutable.after.passes[0].executions = 99;
  mutable.after.runtimeId = "mutated-runtime";
  const parsed = parseToolcraftBrowserPerformanceEvidence(
    performanceAttachment(serialized),
  );
  const raw = JSON.parse(serialized) as Record<string, unknown>;

  expect(Object.keys(raw).sort()).toEqual([
    "after",
    "before",
    "evidenceType",
    "pathId",
    "phase",
    "profile",
    "version",
  ]);
  expect(serialized).not.toMatch(/passed|expected|delta/i);
  expect(parsed?.after.runtimeId).toBe("performance-contract-test-v1");
  expect(parsed?.after.passes[0]?.executions).toBe(1);
  expect(Object.isFrozen(parsed)).toBe(true);
  expect(Object.isFrozen(parsed?.after)).toBe(true);
  expect(Object.isFrozen(parsed?.after.passes)).toBe(true);
  expect(Object.isFrozen(parsed?.after.passes[0])).toBe(true);
});

test("performance-pipeline contract rejects unknown fields and malformed pass arrays", () => {
  const candidates = [
    { ...pipelineEvidenceInput(), passed: true },
    { ...pipelineEvidenceInput(), profile: "custom-profile" },
    {
      ...pipelineEvidenceInput(),
      before: { ...pipelineEvidenceInput().before, forged: true },
    },
    {
      ...pipelineEvidenceInput(),
      after: {
        ...pipelineEvidenceInput().after,
        passes: [
          {
            ...pipelineEvidenceInput().after.passes[0],
            expectedExecutions: 0,
          },
        ],
      },
    },
    {
      ...pipelineEvidenceInput(),
      after: { ...pipelineEvidenceInput().after, passes: {} },
    },
    {
      ...pipelineEvidenceInput(),
      after: {
        ...pipelineEvidenceInput().after,
        passes: [
          pipelineEvidenceInput().after.passes[0],
          pipelineEvidenceInput().after.passes[0],
        ],
      },
    },
  ];

  for (const candidate of candidates) {
    expect(
      () => serializeToolcraftBrowserPerformanceEvidence(candidate as never),
      JSON.stringify(candidate),
    ).toThrow();
  }
});

test("performance-pipeline contract rejects non-finite, negative, and noninteger metrics", () => {
  const candidates = [
    ["durationTotal", Number.NaN],
    ["durationMax", Number.POSITIVE_INFINITY],
    ["executions", -1],
    ["cacheHits", 1.5],
    ["cacheMisses", Number.MAX_SAFE_INTEGER + 1],
    ["resourceCreations", -0.5],
    ["resourceDisposals", Number.NEGATIVE_INFINITY],
    ["activeResources", 0.5],
    ["transfers", 0.25],
  ] as const;

  for (const [key, value] of candidates) {
    const candidate = pipelineEvidenceInput();
    const [pass] = candidate.after.passes;
    if (!pass) throw new Error("Pipeline contract fixture requires one pass.");
    pass[key] = value;
    expect(
      () => serializeToolcraftBrowserPerformanceEvidence(candidate),
      `${key}: ${String(value)}`,
    ).toThrow();
  }
});

test("runtime registration evidence remains independent from rich performance metrics", () => {
  const runtimeAttachment = {
    body: serializeToolcraftBrowserRuntimeEvidence({
      evidenceType: "performance-budget",
      requirementId: "registered-performance-path",
    }),
    contentType: TOOLCRAFT_BROWSER_RUNTIME_EVIDENCE_CONTENT_TYPE,
    name: TOOLCRAFT_BROWSER_RUNTIME_EVIDENCE_ATTACHMENT_NAME,
  };
  const richAttachment = performanceAttachment(
    serializeToolcraftBrowserPerformanceEvidence(pipelineEvidenceInput()),
  );

  expect(parseToolcraftBrowserRuntimeEvidence(runtimeAttachment)).toEqual({
    evidenceType: "performance-budget",
    requirementId: "registered-performance-path",
    version: 2,
  });
  expect(parseToolcraftBrowserRuntimeEvidence(richAttachment)).toBeUndefined();
  expect(parseToolcraftBrowserPerformanceEvidence(runtimeAttachment)).toBeUndefined();
  expect(parseToolcraftBrowserPerformanceEvidence(richAttachment)?.evidenceType).toBe(
    "performance-pipeline",
  );
});
