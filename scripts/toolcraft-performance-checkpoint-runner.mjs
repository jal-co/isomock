import { randomUUID } from "node:crypto";
import { access, rm } from "node:fs/promises";
import path from "node:path";

import { readAndValidateToolcraftPerformanceReport } from "./toolcraft-performance-report.mjs";
import {
  ensureToolcraftChromium,
  getToolcraftBinaryPath,
  runToolcraftProofProcess,
} from "./toolcraft-proof-process.mjs";
import {
  assertToolcraftVerificationInputsUnchanged,
  collectToolcraftVerificationInputs,
} from "./toolcraft-verification-inventory.mjs";

export async function measureToolcraftPerformanceCheckpoint({
  baselineInventory,
  projectDir,
}) {
  const resolvedProjectDir = path.resolve(projectDir);
  const currentInventory =
    await collectToolcraftVerificationInputs(resolvedProjectDir);
  assertToolcraftVerificationInputsUnchanged({
    baseline: baselineInventory,
    current: currentInventory,
    phase: "before the protected performance checkpoint",
  });

  const playwrightBin = getToolcraftBinaryPath(
    resolvedProjectDir,
    "playwright",
  );
  await access(playwrightBin);
  await ensureToolcraftChromium({
    playwright: await import("@playwright/test"),
    projectDir: resolvedProjectDir,
  });
  const checkpointStartedAtMs = Date.now();
  const performanceReportNonce = randomUUID();
  const performanceReportPath = path.join(
    resolvedProjectDir,
    ".toolcraft",
    "verification",
    `performance-report-${performanceReportNonce}.json`,
  );
  await rm(performanceReportPath, { force: true });

  try {
    await runToolcraftProofProcess(
      playwrightBin,
      ["test", "--grep", "browser perf:", "--workers=1"],
      {
        cwd: resolvedProjectDir,
        env: {
          ...process.env,
          TOOLCRAFT_BROWSER_SERVER_MODE: "preview",
          TOOLCRAFT_PERFORMANCE_FIXTURE_RESOLUTION_MODE:
            "full-certification",
          TOOLCRAFT_PERFORMANCE_FIXTURE_SELECTOR: "maximum",
          TOOLCRAFT_PERFORMANCE_REPORT_NONCE: performanceReportNonce,
          TOOLCRAFT_PERFORMANCE_REPORT_PATH: performanceReportPath,
          TOOLCRAFT_PERFORMANCE_REPORT_SOURCE_HASH:
            baselineInventory.sourceHash,
        },
      },
    );
    const verifiedInventory =
      await collectToolcraftVerificationInputs(resolvedProjectDir);
    assertToolcraftVerificationInputsUnchanged({
      baseline: baselineInventory,
      current: verifiedInventory,
      phase: "during Playwright",
    });
    const validatedReport = await readAndValidateToolcraftPerformanceReport({
      nonce: performanceReportNonce,
      notBeforeMs: checkpointStartedAtMs,
      reportPath: performanceReportPath,
      sourceHash: verifiedInventory.sourceHash,
    });
    return {
      evidence: validatedReport.evidence,
      inventory: verifiedInventory,
    };
  } finally {
    await rm(performanceReportPath, { force: true });
  }
}
