import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";

import { expect, test } from "@playwright/test";
import { assessToolcraftRenderPlan } from "@/toolcraft/runtime";

import { writeToolcraftKernelBenchmarkReport } from "../scripts/toolcraft-kernel-benchmark-receipt.mjs";
import { appPerformance } from "../src/app/app-performance";
import { appSchema } from "../src/app/app-schema";
import { appKernelBenchmarks } from "./app-kernel-benchmarks";

const reportPath = process.env.TOOLCRAFT_KERNEL_BENCHMARK_REPORT_PATH;
const reportNonce = process.env.TOOLCRAFT_KERNEL_BENCHMARK_REPORT_NONCE;
const sourceHash = process.env.TOOLCRAFT_KERNEL_BENCHMARK_SOURCE_HASH;

function hash(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

test("toolcraft kernel: protected benchmark", async ({ page }) => {
  expect(reportPath, "Protected kernel report path is required.").toBeTruthy();
  expect(reportNonce, "Protected kernel report nonce is required.").toBeTruthy();
  expect(sourceHash, "Protected kernel source hash is required.").toMatch(
    /^[a-f0-9]{64}$/u,
  );

  const decisions = appPerformance.kernelBenchmarkDecisions ?? [];
  const rawAssessment = assessToolcraftRenderPlan(appSchema, {
    ...appPerformance,
    kernelBenchmarkDecisions: undefined,
  });
  const requirements = rawAssessment.requiredBenchmarks;
  expect(rawAssessment.errors).toEqual([]);
  expect(requirements).toHaveLength(decisions.length);

  const normalizedRequirements = decisions
    .map((decision) => {
      const requirement = requirements.find(({ passId }) => passId === decision.id);
      expect(requirement, `Missing requirement for ${decision.id}.`).toBeTruthy();
      return {
        candidates: [...decision.candidates].sort(),
        passId: decision.id,
        selected: decision.selected,
        workload: Object.fromEntries(
          Object.entries(requirement!.workload).sort(([left], [right]) =>
            left < right ? -1 : left > right ? 1 : 0,
          ),
        ),
      };
    })
    .sort((left, right) =>
      left.passId < right.passId ? -1 : left.passId > right.passId ? 1 : 0,
    );
  const benchmarks = [];

  for (const requirement of normalizedRequirements) {
    const harnesses = appKernelBenchmarks[requirement.passId];
    expect(harnesses, `Missing kernel harness for ${requirement.passId}.`).toBeTruthy();
    expect(Object.keys(harnesses!).sort()).toEqual(requirement.candidates);
    const measurements = [];
    for (const candidate of requirement.candidates) {
      const harness = harnesses![candidate];
      expect(harness, `Missing ${candidate} kernel harness.`).toBeTruthy();
      expect(Number.isSafeInteger(harness!.iterations)).toBe(true);
      expect(harness!.iterations).toBeGreaterThan(0);
      const implementationHash = hash(String(harness!.run));
      let outputHash: string | undefined;
      const startedAt = performance.now();
      for (let index = 0; index < harness!.iterations; index += 1) {
        const output = await harness!.run({ page, workload: requirement.workload });
        expect(typeof output === "string" || output instanceof Uint8Array).toBe(true);
        const currentOutputHash = hash(output);
        outputHash ??= currentOutputHash;
        expect(currentOutputHash).toBe(outputHash);
      }
      const durationMs = performance.now() - startedAt;
      expect(durationMs).toBeGreaterThan(0);
      measurements.push({
        candidate,
        durationMs,
        implementationHash,
        iterations: harness!.iterations,
        outputHash: outputHash!,
      });
    }
    expect(new Set(measurements.map(({ outputHash }) => outputHash)).size).toBe(1);
    benchmarks.push({
      measurements,
      passId: requirement.passId,
      selected: requirement.selected,
      workloadHash: hash(JSON.stringify(requirement.workload)),
    });
  }

  await writeToolcraftKernelBenchmarkReport(reportPath!, {
    benchmarks,
    completedAt: new Date().toISOString(),
    kind: "kernel-benchmark",
    nonce: reportNonce!,
    requirementHash: hash(JSON.stringify(normalizedRequirements)),
    requirements: normalizedRequirements,
    runner: "protected-playwright",
    sourceHash: sourceHash!,
    status: "passed",
    version: 1,
  });
});
