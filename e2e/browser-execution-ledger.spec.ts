import {
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { expect, test } from "@playwright/test";

import {
  createToolcraftBrowserExecutionLedger,
  writeToolcraftBrowserExecutionLedgerSync,
} from "./browser-execution-ledger";

test("browser execution ledger writes exact collision-safe passed titles", () => {
  const root = mkdtempSync(
    path.join(tmpdir(), "toolcraft-browser-ledger-"),
  );
  try {
    const ledger = createToolcraftBrowserExecutionLedger({
      nonce: "ledger-nonce",
      resultStatus: "passed",
      tests: [
        {
          file: "e2e/app-controls.spec.ts",
          fullTitle:
            "e2e/app-controls.spec.ts › browser: output changes",
          leafTitle: "browser: output changes",
          passed: true,
        },
      ],
    });
    const ledgerPath = writeToolcraftBrowserExecutionLedgerSync(
      { directory: root, nonce: "ledger-nonce" },
      ledger,
    );

    expect(JSON.parse(readFileSync(ledgerPath, "utf8"))).toEqual({
      nonce: "ledger-nonce",
      status: "passed",
      tests: [
        {
          file: "e2e/app-controls.spec.ts",
          fullTitle:
            "e2e/app-controls.spec.ts › browser: output changes",
          leafTitle: "browser: output changes",
          status: "passed",
        },
      ],
      version: 1,
    });
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("browser execution ledger rejects failed and colliding outcomes", () => {
  const validTest = {
    file: "e2e/app-controls.spec.ts",
    fullTitle: "e2e/app-controls.spec.ts › browser: output changes",
    leafTitle: "browser: output changes",
    passed: true,
  };
  expect(() =>
    createToolcraftBrowserExecutionLedger({
      nonce: "ledger-nonce",
      resultStatus: "failed",
      tests: [validTest],
    }),
  ).toThrow(/passed asserted run/u);
  expect(() =>
    createToolcraftBrowserExecutionLedger({
      nonce: "ledger-nonce",
      resultStatus: "passed",
      tests: [validTest, { ...validTest }],
    }),
  ).toThrow(/collision-free/u);
});
