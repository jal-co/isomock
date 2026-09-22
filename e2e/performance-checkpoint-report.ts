import { createHash } from "node:crypto";
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  TOOLCRAFT_PERFORMANCE_PROFILE_CATALOG_VERSION,
  type ToolcraftPerformancePath,
} from "@/toolcraft/runtime";

import type { ToolcraftPerformanceMeasurementEvidence } from "../src/app/test-evidence/browser-performance-measurement-contract";
import type { ToolcraftBrowserPerformanceReport } from "./browser-performance-report";
import type { ToolcraftPerformanceEnvironmentEvidence } from "./performance-environment-evidence";

export const TOOLCRAFT_PERFORMANCE_CHECKPOINT_REPORT_VERSION = 1 as const;

export type ToolcraftPerformanceCheckpointReport = Readonly<{
  environment: ToolcraftPerformanceEnvironmentEvidence;
  generatedAt: string;
  matrixHash: string;
  measurements: readonly ToolcraftPerformanceMeasurementEvidence[];
  nonce: string;
  paths: readonly ToolcraftPerformancePath[];
  pipelineSummaries: ToolcraftBrowserPerformanceReport["observations"];
  profileCatalogVersion: typeof TOOLCRAFT_PERFORMANCE_PROFILE_CATALOG_VERSION;
  sourceHash: string;
  status: "passed";
  version: typeof TOOLCRAFT_PERFORMANCE_CHECKPOINT_REPORT_VERSION;
}>;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, entry]) => [key, canonicalize(entry)]),
  );
}

export function createToolcraftCanonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function createToolcraftPerformanceHash(value: unknown): string {
  return createHash("sha256")
    .update(createToolcraftCanonicalJson(value))
    .digest("hex");
}

export function createToolcraftPerformanceMatrixHash(
  paths: readonly ToolcraftPerformancePath[],
): string {
  return createToolcraftPerformanceHash(paths);
}

export function createToolcraftPerformanceCheckpointReport(options: {
  environment: ToolcraftPerformanceEnvironmentEvidence;
  measurements: readonly ToolcraftPerformanceMeasurementEvidence[];
  nonce: string;
  paths: readonly ToolcraftPerformancePath[];
  pipelineSummaries: ToolcraftBrowserPerformanceReport["observations"];
  sourceHash: string;
}): ToolcraftPerformanceCheckpointReport {
  const paths = Object.freeze([...options.paths]);
  return Object.freeze({
    environment: options.environment,
    generatedAt: new Date().toISOString(),
    matrixHash: createToolcraftPerformanceMatrixHash(paths),
    measurements: Object.freeze([...options.measurements]),
    nonce: options.nonce,
    paths,
    pipelineSummaries: Object.freeze([...options.pipelineSummaries]),
    profileCatalogVersion: TOOLCRAFT_PERFORMANCE_PROFILE_CATALOG_VERSION,
    sourceHash: options.sourceHash,
    status: "passed",
    version: TOOLCRAFT_PERFORMANCE_CHECKPOINT_REPORT_VERSION,
  });
}

export function writeToolcraftPerformanceCheckpointReport(
  reportPath: string,
  report: ToolcraftPerformanceCheckpointReport,
): void {
  const resolvedPath = path.resolve(reportPath);
  const temporaryPath = `${resolvedPath}.${process.pid}.tmp`;
  mkdirSync(path.dirname(resolvedPath), { recursive: true });
  writeFileSync(temporaryPath, `${JSON.stringify(report, null, 2)}\n`);
  renameSync(temporaryPath, resolvedPath);
}
