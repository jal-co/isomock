import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fetchLatestRendererProviderRelease } from "./renderer-provider-registry-client.mjs";
import { parseRendererProviderExactVersion } from "./renderer-provider-release-codec.mjs";
import { inspectRendererProvider } from "../src/toolcraft/renderer-providers/provider-config.mjs";
import { parseRendererProviderResolution, rendererProviderActivationChecks } from "../src/toolcraft/renderer-providers/provider-resolution.mjs";
import { assertInstalledActivationTuple, readActivationSourceHash, runActivationProcess, verifyActivationCandidate } from "./toolcraft-renderer-activation-proof.mjs";

const json = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
async function optionalRead(file) {
  try { return await fs.readFile(file); } catch (error) { if (error.code === "ENOENT") return null; throw error; }
}
async function packageManager(appRoot, packageJson) {
  const pnpmLock = await optionalRead(path.join(appRoot, "pnpm-lock.yaml"));
  const npmLock = await optionalRead(path.join(appRoot, "package-lock.json"));
  if (pnpmLock && npmLock) throw new Error("Multiple package-manager lockfiles found. Keep the app's authoritative lockfile and retry VGPU activation.");
  if (pnpmLock) return "pnpm";
  if (npmLock) return "npm";
  const declared = packageJson.packageManager?.split("@", 1)[0];
  if (declared === "pnpm" || declared === "npm") return declared;
  return process.env.npm_config_user_agent?.startsWith("pnpm/") ? "pnpm" : "npm";
}
async function replaceFile(file, bytes) {
  const temporary = `${file}.vgpu-${randomUUID()}`;
  try {
    const mode = await fs.stat(file).then((stat) => stat.mode, (error) => {
      if (error.code === "ENOENT") return 0o644;
      throw error;
    });
    await fs.writeFile(temporary, bytes, { flag: "wx", mode });
    await fs.rename(temporary, file);
  } finally { await fs.rm(temporary, { force: true }); }
}
async function restoreIfOwned(file, ownedBytes, previousBytes) {
  const current = await optionalRead(file);
  if (!current?.equals(ownedBytes)) return;
  if (previousBytes) await replaceFile(file, previousBytes);
  else await fs.rm(file);
}

export async function activateLatestRendererProvider({
  appRoot, catalog, discover = fetchLatestRendererProviderRelease,
  verify = verifyActivationCandidate, execute = runActivationProcess,
  sourceHash = readActivationSourceHash, inspectInstalled = assertInstalledActivationTuple,
}) {
  const lockRoot = path.join(appRoot, ".toolcraft");
  await fs.mkdir(lockRoot, { recursive: true });
  const activationLock = path.join(lockRoot, "vgpu-activation.lock");
  const owner = await fs.open(activationLock, "wx");
  let temporaryRoot;
  try {
    await owner.writeFile(JSON.stringify({ pid: process.pid }));
    const packagePath = path.join(appRoot, "package.json");
    const original = await fs.readFile(packagePath);
    const packageJson = JSON.parse(original);
    const inspection = inspectRendererProvider({ catalog, packageJson, providerId: "vgpu" });
    const currentHash = await sourceHash(appRoot);
    const manager = await packageManager(appRoot, packageJson);
    const lockName = manager === "pnpm" ? "pnpm-lock.yaml" : "package-lock.json";
    const lockPath = path.join(appRoot, lockName);
    const originalLock = await optionalRead(lockPath);
    if (inspection.status === "drifted") throw new Error(inspection.errors.join("\n"));
    if (inspection.status === "exact") {
      const saved = parseRendererProviderResolution(packageJson.toolcraft.rendererProviders.vgpu);
      if (saved.compatibilitySourceHash !== currentHash) throw new Error("VGPU adapter source changed after activation. Regenerate from the corrected Toolcraft source and verify the same app version; do not silently upgrade.");
      await execute({ cwd: appRoot, command: manager, args: manager === "pnpm" ? ["install", "--frozen-lockfile"] : ["ci", "--no-audit", "--no-fund"], label: "restore-exact-install" });
      await inspectInstalled(appRoot, saved.dependencies);
      return { changed: false, version: saved.dependencies[0].version, installCommand: null };
    }
    const latest = await discover({ packageName: "vgpu" });
    const version = latest.providerDependencies[0].version;
    if (parseRendererProviderExactVersion(version).prerelease.length) throw new Error("npm latest is a prerelease; stable VGPU activation is unavailable.");
    const resolution = parseRendererProviderResolution({ schemaVersion: 1, resolvedAt: new Date().toISOString(), compatibilitySourceHash: currentHash, dependencies: latest.providerDependencies, checks: rendererProviderActivationChecks });
    const candidate = { ...packageJson,
      dependencies: { ...packageJson.dependencies, ...Object.fromEntries(resolution.dependencies.map(({ name, version }) => [name, version])) },
      toolcraft: { ...packageJson.toolcraft, rendererProviders: { ...packageJson.toolcraft?.rendererProviders, vgpu: resolution } },
    };
    temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "toolcraft-vgpu-activation-"));
    const stage = path.join(temporaryRoot, "app");
    const excluded = new Set(["node_modules", ".git", ".toolcraft", "dist", "test-results", "playwright-report"]);
    await fs.cp(appRoot, stage, { recursive: true, filter: (file) => file === appRoot || !path.relative(appRoot, file).split(path.sep).some((part) => excluded.has(part)) });
    await fs.writeFile(path.join(stage, "package.json"), json(candidate));
    await execute({ cwd: stage, command: manager, args: manager === "pnpm" ? ["install", "--frozen-lockfile=false"] : ["install", "--no-audit", "--no-fund"], label: `install-candidate ${version}` });
    await inspectInstalled(stage, resolution.dependencies);
    await verify({ appRoot: stage, manager, execute });
    if (await sourceHash(appRoot) !== currentHash || !(await fs.readFile(packagePath)).equals(original)) {
      throw new Error("App or adapter changed during VGPU compatibility checks; retry activation.");
    }
    const currentLock = await optionalRead(lockPath);
    if (currentLock?.toString() !== originalLock?.toString()) throw new Error("Lockfile changed during VGPU checks; retry activation.");
    const testedLock = await fs.readFile(path.join(stage, lockName));
    const candidateBytes = json(candidate);
    await replaceFile(packagePath, candidateBytes);
    try {
      await replaceFile(lockPath, testedLock);
      await execute({ cwd: appRoot, command: manager, args: manager === "pnpm" ? ["install", "--frozen-lockfile"] : ["ci", "--no-audit", "--no-fund"], label: "install-verified" });
      await inspectInstalled(appRoot, resolution.dependencies);
      if (await sourceHash(appRoot) !== currentHash || !(await fs.readFile(packagePath)).equals(candidateBytes) ||
          !(await fs.readFile(lockPath)).equals(testedLock)) {
        throw new Error("App changed during verified installation; retry activation with its current state.");
      }
    } catch (error) {
      await restoreIfOwned(packagePath, candidateBytes, original);
      await restoreIfOwned(lockPath, testedLock, originalLock);
      throw error;
    }
    return { changed: true, version, installCommand: null };
  } finally {
    try { if (temporaryRoot) await fs.rm(temporaryRoot, { recursive: true, force: true }); }
    finally { await owner.close(); await fs.rm(activationLock); }
  }
}
