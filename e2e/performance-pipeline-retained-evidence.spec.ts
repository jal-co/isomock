import { expect, test } from "@playwright/test";
import { createToolcraftRendererPipelineRuntime } from "@/toolcraft/runtime";

import { createToolcraftPerformancePipelineSnapshot } from "../src/app/test-evidence/browser-performance-contract";
import {
  evaluatePipelineEvidence,
  pipelineEvidence,
  pipelineEvidenceAttachment,
  preparationPipelineAttachments,
  retainedAccessPipelineAttachments,
} from "./performance-pipeline-evidence-test-fixtures";
import {
  fieldDisablePipelinePath,
  pipelineEvidenceRegistration,
  retainedAccessPipelinePath,
} from "./performance-pipeline-evidence-test-contract";

test("retained upstream access permits cache hits only", () => {
  expect(evaluatePipelineEvidence(retainedAccessPipelineAttachments(), [
    retainedAccessPipelinePath.id]).errors).toEqual([]);
  for (const forbidden of [
    { cacheMisses: 2, durationTotal: 2, executions: 2 },
    { activeResources: 2, resourceCreations: 2 },
    { resourceDisposals: 1, activeResources: 0 }, { transfers: 1 },
  ]) {
    const attachments = retainedAccessPipelineAttachments();
    const cold = attachments[0]!;
    const parsed = JSON.parse(String(cold.body)) as {
      after: { passes: Array<Record<string, unknown>> };
    };
    Object.assign(parsed.after.passes.find(({ passId }) => passId === "decode")!, forbidden);
    const result = evaluatePipelineEvidence(
      [{ ...cold, body: JSON.stringify(parsed) }, ...attachments.slice(1)],
      [retainedAccessPipelinePath.id]);
    expect(result.errors).toContainEqual(expect.stringMatching(/retained access.*cache hit only/i));
  }
});

test("registered retained pass retirement is valid only as bounded disposal activity", async () => {
  let now = 0;
  const runtime = createToolcraftRendererPipelineRuntime(pipelineEvidenceRegistration,
    { now: () => ++now });
  const decode = pipelineEvidenceRegistration.getPass("decode");
  const simulate = pipelineEvidenceRegistration.getPass("simulate");
  const composite = pipelineEvidenceRegistration.getPass("composite");
  const attachments = [];
  try {
    for (const phase of ["cold", "warm", "sustained"] as const) {
      await runtime.runPass(decode, { "source.id": "field" }, async ({ getOrCreateResource }) => {
        await getOrCreateResource(["field"], () => ({ id: "field" }), () => undefined);
      });
      await runtime.runPass(simulate, undefined, () => undefined);
      const before = createToolcraftPerformancePipelineSnapshot(runtime.getSnapshot());
      await runtime.runPass(composite, undefined, () => undefined);
      await runtime.invalidatePass(decode).cleanup;
      const after = createToolcraftPerformancePipelineSnapshot(runtime.getSnapshot());
      attachments.push(pipelineEvidenceAttachment(
        pipelineEvidence(phase, before, after, fieldDisablePipelinePath)));
    }
  } finally {
    await runtime.dispose();
  }
  expect(attachments.map(({ body }) => {
    const parsed = JSON.parse(String(body)) as {
      after: { passes: Array<Record<string, number | string>> };
      before: { passes: Array<Record<string, number | string>> };
    };
    const before = parsed.before.passes.find(({ passId }) => passId === "decode")!;
    const after = parsed.after.passes.find(({ passId }) => passId === "decode")!;
    return { activeResources: [before.activeResources, after.activeResources],
      executions: [before.executions, after.executions],
      resourceDisposals: [before.resourceDisposals, after.resourceDisposals] };
  })).toEqual([
    { activeResources: [1, 0], executions: [1, 1], resourceDisposals: [0, 1] },
    { activeResources: [1, 0], executions: [2, 2], resourceDisposals: [1, 2] },
    { activeResources: [1, 0], executions: [3, 3], resourceDisposals: [2, 3] },
  ]);
  expect(evaluatePipelineEvidence(attachments, [fieldDisablePipelinePath.id]).errors).toEqual([]);
});

test("retirement-only invalidation rejects cache, allocation, mutation, and unbounded disposal", () => {
  for (const corrupt of [{ cacheHits: 1 }, { cacheMisses: 2, executions: 2 },
    { transfers: 1 }, { activeResources: 1, resourceDisposals: 1 },
    { activeResources: 0, resourceDisposals: 2 }]) {
    const attachments = preparationPipelineAttachments();
    const parsed = JSON.parse(String(attachments[0]!.body)) as {
      after: { passes: Array<Record<string, unknown>> };
    };
    Object.assign(parsed.after.passes.find(({ passId }) => passId === "decode"), corrupt);
    const result = evaluatePipelineEvidence([
      { ...attachments[0]!, body: JSON.stringify(parsed) }, ...attachments.slice(1),
    ], [fieldDisablePipelinePath.id]);
    expect(result.errors).toContainEqual(
      expect.stringMatching(/retirement-only invalidation requires/iu));
  }
});

test("preparation-only passes may change before baselines but not during measured actions", () => {
  expect(evaluatePipelineEvidence(preparationPipelineAttachments(), [
    fieldDisablePipelinePath.id]).errors).toEqual([]);
  const measuredMutation = evaluatePipelineEvidence(preparationPipelineAttachments(true), [
    fieldDisablePipelinePath.id]);
  expect(measuredMutation.errors).toContainEqual(
    expect.stringMatching(/simulate.*outside canonical path\.invalidates/i));
});
