import { expect, test } from "@playwright/test";

import {
  activePipelineAttachments,
  evaluatePipelineEvidence,
  initialPipelineAttachments,
  noCacheActivitySnapshot,
  pipelineEvidence,
  pipelineEvidenceAttachment,
  pipelineSnapshot,
  unchangedPipelineAttachments,
} from "./performance-pipeline-evidence-test-fixtures";
import {
  activePipelinePath,
  animationPipelinePath,
  initialPipelinePath,
  unchangedPipelinePath,
} from "./performance-pipeline-evidence-test-contract";

test("runtime, profile, and decreasing-counter forgeries fail", () => {
  const [cold, warm, sustained] = activePipelineAttachments();
  const runtimeMismatch = evaluatePipelineEvidence([
    pipelineEvidenceAttachment({
      ...pipelineEvidence("cold", pipelineSnapshot(), noCacheActivitySnapshot(1)),
      after: { ...noCacheActivitySnapshot(1), runtimeId: "forged-runtime-v1" },
    }),
    warm!,
    sustained!,
  ]);
  const profileMismatch = evaluatePipelineEvidence([
    pipelineEvidenceAttachment({
      ...pipelineEvidence("cold", pipelineSnapshot(), noCacheActivitySnapshot(1)),
      profile: "batch-responsive",
    }),
    warm!,
    sustained!,
  ]);
  const decreasing = evaluatePipelineEvidence([
    pipelineEvidenceAttachment(
      pipelineEvidence(
        "cold",
        noCacheActivitySnapshot(2),
        noCacheActivitySnapshot(1),
      ),
    ),
    warm!,
    sustained!,
  ]);

  expect(runtimeMismatch.errors).toContainEqual(
    expect.stringMatching(/runtimeId.*executable/i),
  );
  expect(profileMismatch.errors).toContainEqual(
    expect.stringMatching(/profile.*canonical/i),
  );
  expect(decreasing.errors).toContainEqual(
    expect.stringMatching(/executions.*decreased/i),
  );
  expect(cold).toBeDefined();
});

test("ordinary paths require exact cross-phase continuity", () => {
  const independent = (["cold", "warm", "sustained"] as const).map((phase) =>
    pipelineEvidenceAttachment(
      pipelineEvidence(
        phase,
        pipelineSnapshot(),
        noCacheActivitySnapshot(1),
      ),
    ),
  );
  const result = evaluatePipelineEvidence(independent);

  expect(result.errors).toContainEqual(
    expect.stringMatching(/cold\.after to warm\.before/i),
  );
  expect(result.errors).toContainEqual(
    expect.stringMatching(/warm\.after to sustained\.before/i),
  );
});

test("autonomous animation permits only its invalidated passes to advance between phases", () => {
  const observation = (
    phase: "cold" | "warm" | "sustained",
    beforeExecutions: number,
    afterExecutions: number,
  ) =>
    pipelineEvidenceAttachment(
      pipelineEvidence(
        phase,
        noCacheActivitySnapshot(beforeExecutions),
        noCacheActivitySnapshot(afterExecutions),
        animationPipelinePath,
      ),
    );
  const valid = evaluatePipelineEvidence(
    [
      observation("cold", 0, 2),
      observation("warm", 5, 7),
      observation("sustained", 10, 12),
    ],
    [animationPipelinePath.id],
  );
  const decodeAdvanced = pipelineSnapshot({
    composite: {
      cacheMisses: 5,
      durationMax: 1,
      durationTotal: 5,
      executions: 5,
    },
    decode: {
      activeResources: 1,
      cacheMisses: 1,
      durationMax: 1,
      durationTotal: 1,
      executions: 1,
      resourceCreations: 1,
    },
  });
  const invalid = evaluatePipelineEvidence(
    [
      observation("cold", 0, 2),
      pipelineEvidenceAttachment(
        pipelineEvidence(
          "warm",
          decodeAdvanced,
          pipelineSnapshot({
            composite: {
              cacheMisses: 7,
              durationMax: 1,
              durationTotal: 7,
              executions: 7,
            },
            decode: {
              activeResources: 1,
              cacheMisses: 1,
              durationMax: 1,
              durationTotal: 1,
              executions: 1,
              resourceCreations: 1,
            },
          }),
          animationPipelinePath,
        ),
      ),
      observation("sustained", 10, 12),
    ],
    [animationPipelinePath.id],
  );

  expect(valid.errors).toEqual([]);
  expect(invalid.errors).toContainEqual(
    expect.stringMatching(/cold\.after to warm\.before/i),
  );
});

test("initial-render uses fresh canonical zero lifecycle samples without continuity", () => {
  const valid = evaluatePipelineEvidence(initialPipelineAttachments(), [
    initialPipelinePath.id,
  ]);
  const forgedBefore = evaluatePipelineEvidence(
    [
      pipelineEvidenceAttachment(
        pipelineEvidence(
          "cold",
          noCacheActivitySnapshot(1),
          noCacheActivitySnapshot(2),
          initialPipelinePath,
        ),
      ),
      ...initialPipelineAttachments().slice(1),
    ],
    [initialPipelinePath.id],
  );

  expect(valid.errors).toEqual([]);
  expect(forgedBefore.errors).toContainEqual(
    expect.stringMatching(/initial-render before snapshot.*canonical zero/i),
  );
});

test("report ordering is deterministic by path, phase, and pass", () => {
  const attachments = [
    ...activePipelineAttachments(),
    ...unchangedPipelineAttachments(),
  ];
  const pathIds = [unchangedPipelinePath.id, activePipelinePath.id];
  const forward = evaluatePipelineEvidence(attachments, pathIds);
  const reversed = evaluatePipelineEvidence([...attachments].reverse(), pathIds);

  expect(forward.errors).toEqual([]);
  expect(reversed.report).toEqual(forward.report);
  expect(
    forward.report?.observations.map(({ pathId, phase }) => [pathId, phase]),
  ).toEqual(
    [...pathIds]
      .sort()
      .flatMap((pathId) =>
        (["cold", "warm", "sustained"] as const).map((phase) => [
          pathId,
          phase,
        ]),
      ),
  );
  expect(
    forward.report?.observations.every(
      (observation) =>
        observation.passes.map((pass) => pass.passId).join(",") ===
        "composite,decode,simulate",
    ),
  ).toBe(true);
});
