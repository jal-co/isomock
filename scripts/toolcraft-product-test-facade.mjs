import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { hasValidToolcraftIntegrityManifestSignature } from "./toolcraft-integrity-manifest.mjs";

export async function getVerifiedProductTestFacade(projectDir, graph) {
  try {
    const manifest = JSON.parse(await fs.readFile(path.join(projectDir, "src/toolcraft/.toolcraft-manifest.json"), "utf8"));
    const expected = manifest.protectedFiles?.["e2e/toolcraft-product-test.ts"];
    if (!hasValidToolcraftIntegrityManifestSignature(manifest) || typeof expected !== "string") return undefined;
    const facadePath = path.join(projectDir, "e2e/toolcraft-product-test.ts");
    const fileStat = await fs.lstat(facadePath);
    if (!fileStat.isFile() || fileStat.isSymbolicLink()) return undefined;
    const pinnedSource = graph?.sourceRecords.get("e2e/toolcraft-product-test.ts")?.rawSource;
    if (typeof pinnedSource !== "string") return undefined;
    const actual = crypto.createHash("sha256").update(pinnedSource).digest("hex");
    return actual === expected ? Object.freeze({ digest: expected, facadePath }) : undefined;
  } catch {
    return undefined;
  }
}
export async function hasVerifiedProductTestFacade(projectDir, graph) {
  return Boolean(await getVerifiedProductTestFacade(projectDir, graph));
}
export async function revalidateToolcraftProductTestFacade(receipt) {
  if (!receipt) return;
  const fileStat = await fs.lstat(receipt.facadePath);
  if (!fileStat.isFile() || fileStat.isSymbolicLink()) throw new Error("Protected product-test facade changed after authority validation.");
  const actual = crypto.createHash("sha256").update(await fs.readFile(receipt.facadePath)).digest("hex");
  if (actual !== receipt.digest) throw new Error("Protected product-test facade changed after authority validation.");
}
