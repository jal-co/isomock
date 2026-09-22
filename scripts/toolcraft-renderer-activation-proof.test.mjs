import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { assertInstalledActivationTuple } from "./toolcraft-renderer-activation-proof.mjs";
import { parseRendererProviderResolution, rendererProviderActivationChecks } from "../src/toolcraft/renderer-providers/provider-resolution.mjs";

const resolution = {
  schemaVersion: 1, resolvedAt: "2026-09-09T00:00:00.000Z",
  compatibilitySourceHash: "a".repeat(64), checks: rendererProviderActivationChecks,
  dependencies: [
    { name: "vgpu", role: "runtime", version: "9.8.7", integrity: "sha512-test-runtime" },
    { name: "@vgpu/wgsl", role: "wgsl-tooling", version: "9.8.7", integrity: "sha512-test-tooling" },
  ],
};

test("app resolution rejects incomplete proof and floating, prerelease or misaligned versions", () => {
  assert.equal(parseRendererProviderResolution(resolution).dependencies[0].version, "9.8.7");
  for (const change of [
    (value) => { value.checks = []; },
    (value) => { value.compatibilitySourceHash = "stale"; },
    (value) => { value.resolvedAt = "yesterday"; },
    (value) => { value.dependencies.pop(); },
    (value) => { value.dependencies.reverse(); },
    (value) => { value.dependencies[0].version = "latest"; },
    (value) => { value.dependencies[0].version = "^9.8.7"; },
    (value) => { value.dependencies[0].version = "10.0.0-beta.1"; },
    (value) => { value.dependencies[0].version = "9.8.8"; },
    (value) => { value.dependencies[0].integrity = "unverified"; },
    (value) => { value.approvedRelease = {}; },
  ]) {
    const candidate = structuredClone(resolution);
    change(candidate);
    assert.throws(() => parseRendererProviderResolution(candidate));
  }
});

for (const manager of ["npm", "pnpm"]) {
  test(`${manager} installed evidence rejects mismatched integrity and installed versions`, async () => {
    const appRoot = await fs.mkdtemp(path.join(os.tmpdir(), "vgpu-installed-proof-"));
    const lockPath = path.join(appRoot, manager === "npm" ? "package-lock.json" : "pnpm-lock.yaml");
    const dependencies = resolution.dependencies;
    const lock = manager === "npm"
      ? JSON.stringify({ packages: Object.fromEntries(dependencies.map((entry) => [`node_modules/${entry.name}`, entry])) })
      : `packages:\n${dependencies.map((entry) => `  '${entry.name}@${entry.version}':\n    resolution: {integrity: ${entry.integrity}}\n`).join("")}snapshots:\n${dependencies.map((entry) => `  '${entry.name}@${entry.version}':\n    dependencies: {}\n`).join("")}`;
    try {
      for (const entry of dependencies) {
        const directory = path.join(appRoot, "node_modules", entry.name);
        await fs.mkdir(directory, { recursive: true });
        await fs.writeFile(path.join(directory, "package.json"), JSON.stringify(entry));
      }
      await fs.writeFile(lockPath, lock);
      await assert.doesNotReject(assertInstalledActivationTuple(appRoot, dependencies));
      await fs.writeFile(lockPath, lock.replace("sha512-test-runtime", "sha512-different"));
      await assert.rejects(assertInstalledActivationTuple(appRoot, dependencies), /Lockfile integrity/);
      await fs.writeFile(lockPath, lock);
      await fs.writeFile(path.join(appRoot, "node_modules/vgpu/package.json"), JSON.stringify({ name: "vgpu", version: "0.0.0" }));
      await assert.rejects(assertInstalledActivationTuple(appRoot, dependencies), /Installed vgpu does not match/);
    } finally { await fs.rm(appRoot, { recursive: true, force: true }); }
  });
}
