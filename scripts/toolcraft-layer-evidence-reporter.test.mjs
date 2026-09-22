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
    path.join(os.tmpdir(), "toolcraft-layer-reporter-"),
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

function createAttachment(contract, evidenceType) {
  return {
    body: contract.serializeToolcraftBrowserRuntimeEvidence({
      evidenceType,
      requirementId: "layers.selection",
      target: "layers.selection",
    }),
    contentType: contract.TOOLCRAFT_BROWSER_RUNTIME_EVIDENCE_CONTENT_TYPE,
    name: contract.TOOLCRAFT_BROWSER_RUNTIME_EVIDENCE_ATTACHMENT_NAME,
  };
}

function evaluate(contract, evidenceTypes) {
  const testName = "browser: selected layer changes output";
  return contract.evaluateToolcraftBrowserRuntimeEvidence({
    requirements: [
      {
        evidenceType: "product-observable-change",
        requirementId: "layers.selection",
        target: "layers.selection",
        testName,
      },
      {
        evidenceType: "layer-selection",
        requirementId: "layers.selection",
        target: "layers.selection",
        testName,
      },
    ],
    tests: [
      {
        expectedStatus: "passed",
        results: [
          {
            attachments: evidenceTypes.map((evidenceType) =>
              createAttachment(contract, evidenceType),
            ),
            retry: 0,
            status: "passed",
          },
        ],
        title: testName,
      },
    ],
  });
}

test("runtime reporter rejects selection-only evidence for a product-output row", async (context) => {
  const contract = await loadRuntimeEvidenceContract(context);
  const errors = evaluate(contract, ["layer-selection"]);

  assert.equal(errors.length, 1);
  assert.match(errors[0], /type "product-observable-change"/u);
});

test("runtime reporter accepts exact independent output plus specialized selection evidence", async (context) => {
  const contract = await loadRuntimeEvidenceContract(context);

  assert.deepEqual(
    evaluate(contract, ["product-observable-change", "layer-selection"]),
    [],
  );
});

test("runtime reporter rejects missing evidence when either assertion fails", async (context) => {
  const contract = await loadRuntimeEvidenceContract(context);
  const errors = evaluate(contract, []);

  assert.equal(errors.length, 2);
  assert.match(errors[0], /type "product-observable-change"/u);
  assert.match(errors[1], /type "layer-selection"/u);
});
