import {
  validateToolcraftDeliveryCatalog,
} from "./toolcraft-delivery-catalog-validation.mjs";
import {
  captureToolcraftProofProcess,
  getToolcraftBinaryPath,
} from "./toolcraft-proof-process.mjs";

export function parseToolcraftDeliveryCatalogOutput(output) {
  const lines = String(output)
    .split(/\r?\n/u)
    .filter((line) => line.length > 0);
  if (lines.length !== 1) {
    throw new Error(
      "Toolcraft delivery catalog reporter must emit exactly one JSON line.",
    );
  }
  let value;
  try {
    value = JSON.parse(lines[0]);
  } catch {
    throw new Error("Toolcraft delivery catalog reporter emitted malformed JSON.");
  }
  const validation = validateToolcraftDeliveryCatalog(value);
  if (validation.errors.length > 0) {
    throw new Error(
      `Toolcraft delivery catalog is invalid:\n${validation.errors.join("\n")}`,
    );
  }
  return validation.catalog;
}

export async function collectToolcraftDeliveryCatalog(rootDir) {
  const playwrightBin = getToolcraftBinaryPath(rootDir, "playwright");
  const output = await captureToolcraftProofProcess(
    playwrightBin,
    [
      "test",
      "--list",
      "--reporter=./e2e/toolcraft-delivery-catalog-reporter.ts",
    ],
    { cwd: rootDir },
  );
  return parseToolcraftDeliveryCatalogOutput(output);
}
