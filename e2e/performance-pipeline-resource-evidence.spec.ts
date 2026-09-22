import { expect, test } from "@playwright/test";

import {
  cachedActivitySnapshot,
  evaluatePipelineEvidence,
  pipelineEvidence,
  pipelineEvidenceAttachment,
} from "./performance-pipeline-evidence-test-fixtures";
import {
  cachedPipelinePath,
  stableCachedPipelinePath,
} from "./performance-pipeline-evidence-test-contract";

function withResourceCounts(
  snapshot: ReturnType<typeof cachedActivitySnapshot>,
  counts: {
    activeResources: number;
    resourceCreations: number;
    resourceDisposals: number;
  },
) {
  return {
    ...snapshot,
    passes: snapshot.passes.map((pass) =>
      pass.passId === "decode" ? { ...pass, ...counts } : pass,
    ),
  };
}

test("key-stable passes may retain multiple bounded resources without phase growth", () => {
  const coldBefore = cachedActivitySnapshot({ hits: 0, misses: 0 });
  const coldAfter = {
    ...cachedActivitySnapshot({ hits: 0, misses: 1 }),
    passes: cachedActivitySnapshot({ hits: 0, misses: 1 }).passes.map((pass) =>
      pass.passId === "decode"
        ? { ...pass, activeResources: 2, resourceCreations: 2 }
        : pass,
    ),
  };
  const warmAfter = {
    ...coldAfter,
    passes: coldAfter.passes.map((pass) =>
      pass.passId === "decode" ? { ...pass, cacheHits: 1 } : pass,
    ),
  };
  const sustainedAfter = {
    ...warmAfter,
    passes: warmAfter.passes.map((pass) =>
      pass.passId === "decode" ? { ...pass, cacheHits: 2 } : pass,
    ),
  };
  const result = evaluatePipelineEvidence(
    [
      pipelineEvidenceAttachment(
        pipelineEvidence(
          "cold",
          coldBefore,
          coldAfter,
          stableCachedPipelinePath,
        ),
      ),
      pipelineEvidenceAttachment(
        pipelineEvidence(
          "warm",
          coldAfter,
          warmAfter,
          stableCachedPipelinePath,
        ),
      ),
      pipelineEvidenceAttachment(
        pipelineEvidence(
          "sustained",
          warmAfter,
          sustainedAfter,
          stableCachedPipelinePath,
        ),
      ),
    ],
    [stableCachedPipelinePath.id],
  );

  expect(result.errors).toEqual([]);
});

test("key-changing passes may change bounded resource cardinality before sustained use", () => {
  const coldBefore = cachedActivitySnapshot({ hits: 0, misses: 0 });
  const coldAfter = withResourceCounts(
    cachedActivitySnapshot({ hits: 0, misses: 1 }),
    { activeResources: 2, resourceCreations: 2, resourceDisposals: 0 },
  );
  const warmAfter = withResourceCounts(
    cachedActivitySnapshot({ hits: 0, misses: 2 }),
    { activeResources: 3, resourceCreations: 5, resourceDisposals: 2 },
  );
  const sustainedAfter = withResourceCounts(
    cachedActivitySnapshot({ hits: 0, misses: 3 }),
    { activeResources: 3, resourceCreations: 7, resourceDisposals: 4 },
  );

  const result = evaluatePipelineEvidence(
    [
      pipelineEvidenceAttachment(
        pipelineEvidence("cold", coldBefore, coldAfter, cachedPipelinePath),
      ),
      pipelineEvidenceAttachment(
        pipelineEvidence("warm", coldAfter, warmAfter, cachedPipelinePath),
      ),
      pipelineEvidenceAttachment(
        pipelineEvidence(
          "sustained",
          warmAfter,
          sustainedAfter,
          cachedPipelinePath,
        ),
      ),
    ],
    [cachedPipelinePath.id],
  );

  expect(result.errors).toEqual([]);
});
