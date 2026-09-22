import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { activateLatestRendererProvider } from "./toolcraft-renderer-activation.mjs";
import { inspectRendererProvider, parseRendererProviderCatalog } from "../src/toolcraft/renderer-providers/provider-config.mjs";
import { parseRendererProviderResolution } from "../src/toolcraft/renderer-providers/provider-resolution.mjs";
const catalog = JSON.parse(await fs.readFile(new URL("../src/toolcraft/renderer-providers/catalog.json", import.meta.url), "utf8"));
const tuple = (version) => [
  { name: "vgpu", role: "runtime", version, integrity: "sha512-runtime" },
  { name: "@vgpu/wgsl", role: "wgsl-tooling", version, integrity: "sha512-tooling" },
];
async function fixture(run) {
  const appRoot = await fs.mkdtemp(path.join(os.tmpdir(), "vgpu-activation-test-"));
  const packagePath = path.join(appRoot, "package.json");
  const original = '{"name":"test-app","private":true,"packageManager":"npm@10.0.0","dependencies":{"keep":"1.0.0"}}\n';
  await fs.writeFile(packagePath, original);
  const events = [];
  const options = { appRoot, catalog,
    discover: async () => { events.push("discover"); return { providerDependencies: tuple("9.8.7") }; },
    sourceHash: async () => "a".repeat(64),
    verify: async () => { events.push("verify"); assert.equal(await fs.readFile(packagePath, "utf8"), original); },
    execute: async ({ cwd, label }) => { events.push(label); if (label.startsWith("install-candidate")) await fs.writeFile(path.join(cwd, "package-lock.json"), "tested-lock"); },
    inspectInstalled: async () => {},
  };
  try { await run({ options, events, packagePath, original }); }
  finally { await fs.rm(appRoot, { recursive: true, force: true }); }
}
test("new catalog carries policy and no release selection", () => {
  assert.equal(catalog.schemaVersion, 3);
  assert.equal(parseRendererProviderCatalog(catalog).providers.vgpu.resolutionPolicy, "latest-stable");
  assert.doesNotMatch(JSON.stringify(catalog), /approvedRelease|"version"|integrity|testedAt/);
});
test("latest is verified before committing exact app-local pins and installing", () => fixture(async ({ options, events, packagePath }) => {
  const result = await activateLatestRendererProvider(options);
  const pkg = JSON.parse(await fs.readFile(packagePath, "utf8"));
  assert.equal(result.version, "9.8.7");
  assert.equal(result.installCommand, null);
  assert.deepEqual(pkg.dependencies, { keep: "1.0.0", vgpu: "9.8.7", "@vgpu/wgsl": "9.8.7" });
  assert.deepEqual(parseRendererProviderResolution(pkg.toolcraft.rendererProviders.vgpu).dependencies, tuple("9.8.7"));
  assert.deepEqual(events, ["discover", "install-candidate 9.8.7", "verify", "install-verified"]);
  assert.equal(inspectRendererProvider({ catalog, packageJson: pkg, providerId: "vgpu" }).status, "exact");
}));
test("repeat activation restores exact install without registry access or upgrade", () => fixture(async ({ options, events }) => {
  await activateLatestRendererProvider(options);
  events.length = 0;
  const result = await activateLatestRendererProvider({ ...options, discover: () => { throw new Error("must not discover"); } });
  assert.equal(result.changed, false);
  assert.deepEqual(events, ["restore-exact-install"]);
}));
for (const failure of ["network", "prerelease", "unaligned", "verification", "install"]) {
  test(`${failure} failure preserves original package and releases activation ownership`, () => fixture(async ({ options, packagePath, original }) => {
    const modified = { ...options };
    if (failure === "network") modified.discover = async () => { throw new Error("offline"); };
    if (failure === "prerelease") modified.discover = async () => ({ providerDependencies: tuple("10.0.0-beta.1") });
    if (failure === "unaligned") modified.discover = async () => ({ providerDependencies: [tuple("1.0.0")[0], tuple("2.0.0")[1]] });
    if (failure === "verification") modified.verify = async () => { throw new Error("GPU mismatch"); };
    if (failure === "install") modified.execute = async (entry) => { if (entry.label === "install-verified") throw new Error("disk full"); await options.execute(entry); };
    await assert.rejects(activateLatestRendererProvider(modified));
    assert.equal(await fs.readFile(packagePath, "utf8"), original);
    await assert.rejects(fs.access(path.join(options.appRoot, ".toolcraft/vgpu-activation.lock")), { code: "ENOENT" });
  }));
}
test("concurrent app edits are preserved and prevent candidate publication", () => fixture(async ({ options, packagePath }) => {
  await assert.rejects(activateLatestRendererProvider({ ...options, verify: async () => fs.writeFile(packagePath, '{"name":"concurrent"}') }), /changed during/);
  assert.equal(await fs.readFile(packagePath, "utf8"), '{"name":"concurrent"}');
}));
test("concurrent lockfile changes prevent candidate publication", () => fixture(async ({ options, packagePath, original }) => {
  await assert.rejects(activateLatestRendererProvider({ ...options, verify: async () => fs.writeFile(path.join(options.appRoot, "package-lock.json"), "concurrent") }), /Lockfile changed/);
  assert.equal(await fs.readFile(packagePath, "utf8"), original);
}));
test("unverified manually installed dependencies are rejected", () => fixture(async ({ options, packagePath, events }) => {
  await fs.writeFile(packagePath, JSON.stringify({ dependencies: { vgpu: "9.8.7" } }));
  await assert.rejects(activateLatestRendererProvider(options), /no verified app-local resolution/);
  assert.deepEqual(events, []);
}));

test("a failed final install preserves concurrent lockfile edits", () => fixture(async ({ options, packagePath, original }) => {
  const lockPath = path.join(options.appRoot, "package-lock.json");
  await assert.rejects(activateLatestRendererProvider({ ...options, execute: async (entry) => {
    if (entry.label === "install-verified") {
      await fs.writeFile(lockPath, "user-change");
      throw new Error("interrupted install");
    }
    await options.execute(entry);
  } }), /interrupted install/);
  assert.equal(await fs.readFile(packagePath, "utf8"), original);
  assert.equal(await fs.readFile(lockPath, "utf8"), "user-change");
}));
test("activation does not mix package-manager lockfiles", () => fixture(async ({ options, events }) => {
  await fs.writeFile(path.join(options.appRoot, "package-lock.json"), "npm-lock");
  await fs.writeFile(path.join(options.appRoot, "pnpm-lock.yaml"), "pnpm-lock");
  await assert.rejects(activateLatestRendererProvider(options), /Multiple package-manager/);
  assert.deepEqual(events, []);
}));
test("saved app versions reject changed adapter proof without querying latest", () => fixture(async ({ options, events }) => {
  await activateLatestRendererProvider(options);
  events.length = 0;
  await assert.rejects(activateLatestRendererProvider({ ...options, sourceHash: async () => "b".repeat(64) }), /adapter source changed/);
  assert.deepEqual(events, []);
}));
