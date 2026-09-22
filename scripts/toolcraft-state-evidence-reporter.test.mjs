import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import ts from "typescript";

const contractPath = path.resolve(
  import.meta.dirname,
  "../src/app/test-evidence/browser-runtime-contract.ts",
);

async function loadRuntimeEvidenceContract(context) {
  const outputDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "toolcraft-state-reporter-"),
  );
  context.after(() => fs.rm(outputDir, { force: true, recursive: true }));
  const outputPath = path.join(outputDir, "browser-runtime-contract.mjs");
  const { outputText } = ts.transpileModule(
    await fs.readFile(contractPath, "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
      fileName: contractPath,
    },
  );
  await fs.writeFile(outputPath, outputText);
  return import(`${pathToFileURL(outputPath).href}?test=${Date.now()}`);
}

function evaluate(contract, includeEvidence) {
  const testName = "browser: restores workspace";
  const attachments = includeEvidence
    ? [
        {
          body: contract.serializeToolcraftBrowserRuntimeEvidence({
            evidenceType: "persistence-state",
            requirementId: "workspace.persistence",
            target: "workspace.persistence",
          }),
          contentType:
            contract.TOOLCRAFT_BROWSER_RUNTIME_EVIDENCE_CONTENT_TYPE,
          name: contract.TOOLCRAFT_BROWSER_RUNTIME_EVIDENCE_ATTACHMENT_NAME,
        },
      ]
    : [];

  return contract.evaluateToolcraftBrowserRuntimeEvidence({
    requirements: [
      {
        evidenceType: "persistence-state",
        requirementId: "workspace.persistence",
        target: "workspace.persistence",
        testName,
      },
    ],
    tests: [
      {
        expectedStatus: "passed",
        results: [{ attachments, retry: 0, status: "passed" }],
        title: testName,
      },
    ],
  });
}

test("runtime reporter accepts persistence evidence only when it was attached", async (context) => {
  const contract = await loadRuntimeEvidenceContract(context);

  assert.deepEqual(evaluate(contract, true), []);
  const errors = evaluate(contract, false);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /type "persistence-state"/u);
});
