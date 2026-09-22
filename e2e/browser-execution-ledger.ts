import { randomUUID } from "node:crypto";
import {
  mkdirSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import type { TestCase } from "@playwright/test/reporter";

import {
  getToolcraftPlaywrightContainingFile,
} from "../scripts/playwright-containing-file.mjs";

export type ToolcraftBrowserExecutionLedgerTarget = Readonly<{
  directory: string;
  nonce: string;
}>;

export type ToolcraftBrowserExecutionLedgerTest = Readonly<{
  file: string;
  fullTitle: string;
  leafTitle: string;
  status: "passed";
}>;

type ToolcraftBrowserExecutionLedgerInput = Readonly<{
  nonce: string;
  resultStatus: string;
  tests: readonly Readonly<{
    file: string;
    fullTitle: string;
    leafTitle: string;
    passed: boolean;
  }>[];
}>;

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function createToolcraftBrowserExecutionLedgerTest(
  test: TestCase,
  rootDir: string,
) {
  return {
    file: getToolcraftPlaywrightContainingFile(test, rootDir),
    fullTitle: test.titlePath().filter(Boolean).join(" › "),
    leafTitle: test.title,
    passed:
      test.outcome() === "expected" &&
      test.results.at(-1)?.status === "passed",
  };
}

export function createToolcraftBrowserExecutionLedger(
  input: ToolcraftBrowserExecutionLedgerInput,
) {
  if (
    input.resultStatus !== "passed" ||
    typeof input.nonce !== "string" ||
    input.nonce.length === 0 ||
    input.tests.length === 0 ||
    input.tests.some(
      (test) =>
        !test.passed ||
        !test.file ||
        !test.fullTitle ||
        !test.leafTitle,
    )
  ) {
    throw new Error(
      "Toolcraft browser execution ledger requires a passed asserted run.",
    );
  }
  const tests: ToolcraftBrowserExecutionLedgerTest[] = input.tests
    .map(({ file, fullTitle, leafTitle }) => ({
      file,
      fullTitle,
      leafTitle,
      status: "passed" as const,
    }))
    .sort((left, right) =>
      compareCodeUnits(left.fullTitle, right.fullTitle),
    );
  if (
    new Set(tests.map(({ fullTitle }) => fullTitle)).size !== tests.length
  ) {
    throw new Error(
      "Toolcraft browser execution ledger titles must be collision-free.",
    );
  }
  return Object.freeze({
    nonce: input.nonce,
    status: "passed" as const,
    tests: Object.freeze(tests.map(Object.freeze)),
    version: 1 as const,
  });
}

export function writeToolcraftBrowserExecutionLedgerSync(
  target: ToolcraftBrowserExecutionLedgerTarget,
  ledger: ReturnType<typeof createToolcraftBrowserExecutionLedger>,
): string {
  mkdirSync(target.directory, { recursive: true });
  const reportPath = path.join(
    target.directory,
    `${target.nonce}-${process.pid}-${randomUUID()}.json`,
  );
  const temporaryPath = `${reportPath}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(ledger, null, 2)}\n`, {
    flag: "wx",
  });
  renameSync(temporaryPath, reportPath);
  return reportPath;
}
