import { expect, test } from "@playwright/test";

import {
  TOOLCRAFT_BROWSER_PERFORMANCE_EVIDENCE_ATTACHMENT_NAME,
  TOOLCRAFT_BROWSER_PERFORMANCE_EVIDENCE_CONTENT_TYPE,
} from "../src/app/test-evidence/browser-performance-contract";
import {
  activePipelineAttachments,
  cachedActivitySnapshot,
  cachedPipelineAttachments,
  evaluatePipelineEvidence,
  noCacheActivitySnapshot,
  pipelineEvidence,
  pipelineEvidenceAttachment,
  pipelineSnapshot,
  stableCachedPipelineAttachments,
  unchangedPipelineAttachments,
  zeroPipelinePassCounters,
} from "./performance-pipeline-evidence-test-fixtures";
import {
  activePipelinePath,
  cachedPipelinePath,
  stableCachedPipelinePath,
  unchangedPipelinePath,
} from "./performance-pipeline-evidence-test-contract";

test("forged passed cannot authorize pipeline evidence", () => {
  const forged = {
    ...pipelineEvidence("cold"),
    passed: true,
    version: 1,
  };
  const result = evaluatePipelineEvidence([
    {
      body: JSON.stringify(forged),
      contentType: TOOLCRAFT_BROWSER_PERFORMANCE_EVIDENCE_CONTENT_TYPE,
      name: TOOLCRAFT_BROWSER_PERFORMANCE_EVIDENCE_ATTACHMENT_NAME,
    },
    ...activePipelineAttachments().slice(1),
  ]);

  expect(result.report).toBeUndefined();
  expect(result.errors).toContainEqual(expect.stringMatching(/malformed|unknown/i));
});

test("passes outside canonical invalidates cannot change", () => {
  const result = evaluatePipelineEvidence([
    pipelineEvidenceAttachment(
      pipelineEvidence(
        "cold",
        pipelineSnapshot(),
        pipelineSnapshot({
          composite: { cacheMisses: 1, executions: 1 },
          decode: { cacheMisses: 1, executions: 1 },
        }),
      ),
    ),
    ...activePipelineAttachments().slice(1),
  ]);

  expect(result.errors).toContainEqual(
    expect.stringMatching(/decode.*executions.*outside/i),
  );
});

test("all-zero active paths fail while empty-invalidates paths prove no change", () => {
  const noOp = evaluatePipelineEvidence(
    (["cold", "warm", "sustained"] as const).map((phase) =>
      pipelineEvidenceAttachment(pipelineEvidence(phase)),
    ),
  );
  const unchanged = evaluatePipelineEvidence(
    unchangedPipelineAttachments(),
    [unchangedPipelinePath.id],
  );

  expect(noOp.errors).toContainEqual(
    expect.stringMatching(/composite.*execution.*phase activity/i),
  );
  expect(unchanged.errors).toEqual([]);
});

test("runtime accounting requires one cache miss per execution for every lifecycle", () => {
  const validNoCache = evaluatePipelineEvidence(activePipelineAttachments());
  const invalidNoCache = evaluatePipelineEvidence([
    pipelineEvidenceAttachment(
      pipelineEvidence(
        "cold",
        pipelineSnapshot(),
        pipelineSnapshot({ composite: { executions: 1 } }),
      ),
    ),
    ...activePipelineAttachments().slice(1),
  ]);
  const validCached = evaluatePipelineEvidence(cachedPipelineAttachments(), [
    cachedPipelinePath.id,
  ]);
  const offsetSnapshots = [0, 1, 2, 3].map((executions) =>
    pipelineSnapshot({
      composite: {
        cacheMisses: executions + 1,
        durationMax: executions === 0 ? 0 : 1,
        durationTotal: executions,
        executions,
      },
    }),
  );
  const cumulativeOffset = evaluatePipelineEvidence(
    (["cold", "warm", "sustained"] as const).map((phase, index) =>
      pipelineEvidenceAttachment(
        pipelineEvidence(
          phase,
          offsetSnapshots[index],
          offsetSnapshots[index + 1],
        ),
      ),
    ),
  );

  expect(validNoCache.errors).toEqual([]);
  expect(validCached.errors).toEqual([]);
  expect(invalidNoCache.errors).toContainEqual(
    expect.stringMatching(/one cache miss per execution/i),
  );
  expect(cumulativeOffset.errors).toContainEqual(
    expect.stringMatching(/one cache miss per execution/i),
  );
});

test("cached phase semantics distinguish key-stable reuse from key-changing misses", () => {
  const stableReuse = evaluatePipelineEvidence(
    stableCachedPipelineAttachments(),
    [stableCachedPipelinePath.id],
  );
  const keyChangingMisses = evaluatePipelineEvidence(
    cachedPipelineAttachments(),
    [cachedPipelinePath.id],
  );

  const stableColdAfter = cachedActivitySnapshot({ hits: 0, misses: 1 });
  const stableMisses = evaluatePipelineEvidence(
    [
      pipelineEvidenceAttachment(
        pipelineEvidence(
          "cold",
          cachedActivitySnapshot({ hits: 0, misses: 0 }),
          stableColdAfter,
          stableCachedPipelinePath,
        ),
      ),
      pipelineEvidenceAttachment(
        pipelineEvidence(
          "warm",
          stableColdAfter,
          cachedActivitySnapshot({ hits: 0, misses: 2 }),
          stableCachedPipelinePath,
        ),
      ),
      pipelineEvidenceAttachment(
        pipelineEvidence(
          "sustained",
          cachedActivitySnapshot({ hits: 0, misses: 2 }),
          cachedActivitySnapshot({ hits: 0, misses: 3 }),
          stableCachedPipelinePath,
        ),
      ),
    ],
    [stableCachedPipelinePath.id],
  );

  const keyChangingColdAfter = cachedActivitySnapshot({ hits: 0, misses: 1 });
  const keyChangingHits = evaluatePipelineEvidence(
    [
      pipelineEvidenceAttachment(
        pipelineEvidence(
          "cold",
          cachedActivitySnapshot({ hits: 0, misses: 0 }),
          keyChangingColdAfter,
          cachedPipelinePath,
        ),
      ),
      pipelineEvidenceAttachment(
        pipelineEvidence(
          "warm",
          keyChangingColdAfter,
          cachedActivitySnapshot({ hits: 1, misses: 1 }),
          cachedPipelinePath,
        ),
      ),
      pipelineEvidenceAttachment(
        pipelineEvidence(
          "sustained",
          cachedActivitySnapshot({ hits: 1, misses: 1 }),
          cachedActivitySnapshot({ hits: 2, misses: 1 }),
          cachedPipelinePath,
        ),
      ),
    ],
    [cachedPipelinePath.id],
  );

  expect(stableReuse.errors).toEqual([]);
  expect(keyChangingMisses.errors).toEqual([]);
  expect(stableMisses.errors).toContainEqual(
    expect.stringMatching(/warm cache reuse with a hit/i),
  );
  expect(keyChangingHits.errors).toContainEqual(
    expect.stringMatching(/fresh lifecycle with a miss and execution/i),
  );

  const leakingWarmAfter = cachedActivitySnapshot({ hits: 0, misses: 2 });
  const leakingPasses = leakingWarmAfter.passes.map((pass) =>
    pass.passId === "decode"
      ? {
          ...pass,
          activeResources: 2,
          resourceCreations: 3,
          resourceDisposals: 1,
        }
      : pass,
  );
  const leakingSustainedAfter = cachedActivitySnapshot({ hits: 0, misses: 3 });
  const leakingSustainedPasses = leakingSustainedAfter.passes.map((pass) =>
    pass.passId === "decode"
      ? {
          ...pass,
          activeResources: 3,
          resourceCreations: 5,
          resourceDisposals: 2,
        }
      : pass,
  );
  const leakingResources = evaluatePipelineEvidence(
    [
      cachedPipelineAttachments()[0]!,
      pipelineEvidenceAttachment(
        pipelineEvidence(
          "warm",
          cachedActivitySnapshot({ hits: 0, misses: 1 }),
          { ...leakingWarmAfter, passes: leakingPasses },
          cachedPipelinePath,
        ),
      ),
      pipelineEvidenceAttachment(
        pipelineEvidence(
          "sustained",
          { ...leakingWarmAfter, passes: leakingPasses },
          {
            ...leakingSustainedAfter,
            passes: leakingSustainedPasses,
          },
          cachedPipelinePath,
        ),
      ),
    ],
    [cachedPipelinePath.id],
  );
  expect(leakingResources.errors).toContainEqual(
    expect.stringMatching(/cannot grow activeResources.*sustained phase/i),
  );
});

test("cache, resource, transfer, and disposal violations fail independently", () => {
  const noCacheAfter = noCacheActivitySnapshot(1);
  const candidates = [
    {
      expected: /no-cache pass "composite" cannot record cache hits/i,
      observation: pipelineEvidence(
        "cold",
        pipelineSnapshot(),
        {
          ...noCacheAfter,
          passes: noCacheAfter.passes.map((pass) =>
            pass.passId === "composite" ? { ...pass, cacheHits: 1 } : pass,
          ),
        },
      ),
    },
    {
      expected: /cumulative cacheHits must remain zero/i,
      observation: pipelineEvidence(
        "cold",
        pipelineSnapshot({ composite: { cacheHits: 1 } }),
        pipelineSnapshot({
          composite: {
            cacheHits: 1,
            cacheMisses: 1,
            durationMax: 1,
            durationTotal: 1,
            executions: 1,
          },
        }),
      ),
    },
    {
      expected: /one cache miss per execution/i,
      observation: pipelineEvidence(
        "cold",
        pipelineSnapshot(),
        pipelineSnapshot({ decode: { executions: 1 } }),
        cachedPipelinePath,
      ),
      pathId: cachedPipelinePath.id,
      tail: cachedPipelineAttachments().slice(1),
    },
    {
      expected: /without retained-resource lifecycle/i,
      observation: pipelineEvidence(
        "cold",
        pipelineSnapshot(),
        pipelineSnapshot({
          composite: {
            cacheMisses: 1,
            executions: 1,
            resourceCreations: 1,
          },
        }),
      ),
    },
    {
      expected: /decode.*transfers.*outside/i,
      observation: pipelineEvidence(
        "cold",
        pipelineSnapshot(),
        pipelineSnapshot({
          composite: { cacheMisses: 1, executions: 1 },
          decode: { transfers: 1 },
        }),
      ),
    },
    {
      expected: /decode.*resourceDisposals.*outside/i,
      observation: pipelineEvidence(
        "cold",
        pipelineSnapshot({ decode: { resourceCreations: 1 } }),
        pipelineSnapshot({
          composite: { cacheMisses: 1, executions: 1 },
          decode: { resourceCreations: 1, resourceDisposals: 1 },
        }),
      ),
    },
  ];

  for (const candidate of candidates) {
    const result = evaluatePipelineEvidence(
      [
        pipelineEvidenceAttachment(candidate.observation),
        ...(candidate.tail ?? activePipelineAttachments().slice(1)),
      ],
      [candidate.pathId ?? activePipelinePath.id],
    );
    expect(result.errors, candidate.expected.source).toContainEqual(
      expect.stringMatching(candidate.expected),
    );
  }

  const phantomResourceSnapshots = [0, 1, 2, 3].map((executions) => {
    const snapshot = noCacheActivitySnapshot(executions);
    return {
      ...snapshot,
      passes: snapshot.passes.map((pass) =>
        pass.passId === "composite"
          ? { ...pass, resourceCreations: 1, resourceDisposals: 1 }
          : pass,
      ),
    };
  });
  const phantomResources = evaluatePipelineEvidence(
    (["cold", "warm", "sustained"] as const).map((phase, index) =>
      pipelineEvidenceAttachment(
        pipelineEvidence(
          phase,
          phantomResourceSnapshots[index],
          phantomResourceSnapshots[index + 1],
        ),
      ),
    ),
  );
  expect(phantomResources.errors).toContainEqual(
    expect.stringMatching(/without retained-resource lifecycle/i),
  );
});

test("duplicate and missing phases fail", () => {
  const [cold, warm, sustained] = activePipelineAttachments();
  const duplicate = evaluatePipelineEvidence([cold!, cold!, warm!, sustained!]);
  const missing = evaluatePipelineEvidence([cold!, warm!]);

  expect(duplicate.errors).toContainEqual(expect.stringMatching(/duplicate phase "cold"/i));
  expect(missing.errors).toContainEqual(expect.stringMatching(/missing.*"sustained"/i));
});

test("unknown, extra, and missing paths fail", () => {
  const unknown = evaluatePipelineEvidence([
    pipelineEvidenceAttachment({
      ...pipelineEvidence("cold"),
      pathId: "performance-path:forged",
    }),
    ...activePipelineAttachments().slice(1),
  ]);
  const extra = evaluatePipelineEvidence([
    ...activePipelineAttachments(),
    unchangedPipelineAttachments()[0]!,
  ]);
  const missing = evaluatePipelineEvidence(activePipelineAttachments(), [
    activePipelinePath.id,
    unchangedPipelinePath.id,
  ]);

  expect(unknown.errors).toContainEqual(expect.stringMatching(/unknown path/i));
  expect(extra.errors).toContainEqual(expect.stringMatching(/extra path/i));
  expect(missing.errors).toContainEqual(
    expect.stringMatching(/missing.*performance-path/i),
  );
});

test("snapshots require exactly the executable registration pass ids", () => {
  const base = pipelineSnapshot();
  const candidates = [
    [
      { ...base, passes: base.passes.slice(1) },
      /missing canonical pass/i,
    ],
    [
      {
        ...base,
        passes: [
          ...base.passes,
          { ...zeroPipelinePassCounters(), passId: "forged-pass" },
        ],
      },
      /unknown pass "forged-pass"/i,
    ],
  ] as const;

  for (const [after, expected] of candidates) {
    const result = evaluatePipelineEvidence([
      pipelineEvidenceAttachment(pipelineEvidence("cold", base, after)),
      ...activePipelineAttachments().slice(1),
    ]);
    expect(result.errors).toContainEqual(expect.stringMatching(expected));
  }
});
