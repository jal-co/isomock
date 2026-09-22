import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { runToolcraftFeatureVerificationCore } from "./run-feature-verification.mjs";
import { revalidateToolcraftFeaturePlaywrightAuthoritySeal,
  validateToolcraftFeaturePlaywrightPreflightAuthority } from "./toolcraft-feature-playwright-authority.mjs";
import { createToolcraftFeaturePlaywrightAuthoritySeal, createToolcraftFeaturePreflightSeal,
  createToolcraftFeaturePreflightSnapshot } from "./toolcraft-feature-playwright-authority-seal.mjs";
import { inspectToolcraftExecutableConfigCandidates,
  requireToolcraftFeaturePreflightManifest } from "./toolcraft-feature-preflight-manifest.mjs";
import { createToolcraftIntegrityFixture, createToolcraftStarterIntegrityFixture } from "./toolcraft-integrity-test-utils.mjs";

test("rejects mutated signed Vite authority before loading the source plan", async () => {
  const projectDir = await createToolcraftIntegrityFixture();
  let loaded = false;
  try {
    await mkdir(path.join(projectDir, "e2e"), { recursive: true });
    await writeFile(path.join(projectDir, "e2e/app-controls.spec.ts"), "export {};");
    await writeFile(path.join(projectDir, "vite.config.ts"), "export default { forged: true };");
    const dependencies = {
      loadFeaturePlan: async () => { loaded = true; throw new Error("source plan must not load"); },
      revalidatePlaywrightAuthoritySeal: () => undefined,
      validatePlaywrightPreflightAuthority: validateToolcraftFeaturePlaywrightPreflightAuthority,
    };
    await assert.rejects(runToolcraftFeatureVerificationCore({ dependencies, projectDir,
      request: { acceptanceIds: ["material.layer"], mode: "ids", version: 1 } }), /vite\.config\.ts required signed config authority/iu);
    assert.equal(loaded, false);
  } finally { await rm(projectDir, { force: true, recursive: true }); }
});

test("rejects an unsigned higher-precedence executable config before loading the source plan", async () => {
  const projectDir = await createToolcraftIntegrityFixture();
  let loaded = false;
  try {
    await writeFile(path.join(projectDir, "vite.config.js"), "export default {};\n");
    await assert.rejects(runToolcraftFeatureVerificationCore({ dependencies: {
      loadFeaturePlan: async () => { loaded = true; throw new Error("source plan must not load"); },
      revalidatePlaywrightAuthoritySeal: () => undefined,
      validatePlaywrightPreflightAuthority: validateToolcraftFeaturePlaywrightPreflightAuthority,
    }, projectDir, request: { acceptanceIds: ["material.layer"], mode: "ids", version: 1 } }),
    /vite\.config\.js required signed config authority/iu);
    assert.equal(loaded, false);
  } finally { await rm(projectDir, { force: true, recursive: true }); }
});

test("rejects a config candidate created after preflight before importing the source loader", async () => {
  const projectDir = await createToolcraftIntegrityFixture();
  let loaded = false;
  try {
    const dependencies = {
      loadFeaturePlan: async () => { loaded = true; throw new Error("source plan must not load"); },
      revalidatePlaywrightAuthoritySeal: revalidateToolcraftFeaturePlaywrightAuthoritySeal,
      validatePlaywrightPreflightAuthority: async () => {
        const candidates = await inspectToolcraftExecutableConfigCandidates(projectDir, ["vite.config.js"]);
        const seal = await createToolcraftFeaturePlaywrightAuthoritySeal(projectDir,
          { sourceRecords: new Map() }, [], new Map(), [], [], new Map(), candidates);
        await writeFile(path.join(projectDir, "vite.config.js"), "export default {};\n");
        return { seal };
      },
    };
    await assert.rejects(runToolcraftFeatureVerificationCore({ dependencies, projectDir,
      request: { acceptanceIds: ["material.layer"], mode: "ids", version: 1 } }),
    /vite\.config\.js executable config precedence changed/iu);
    assert.equal(loaded, false);
  } finally { await rm(projectDir, { force: true, recursive: true }); }
});

test("rejects a config candidate added between inspection and seal creation", async () => {
  const projectDir = await mkdtemp(path.join(tmpdir(), "toolcraft-config-snapshot-"));
  try {
    const candidates = await inspectToolcraftExecutableConfigCandidates(projectDir, ["vite.config.js"]);
    await writeFile(path.join(projectDir, "vite.config.js"), "export default {};\n");
    await assert.rejects(createToolcraftFeaturePlaywrightAuthoritySeal(projectDir,
      { sourceRecords: new Map() }, [], new Map(), [], [], new Map(), candidates),
    /executable config precedence changed/iu);
  } finally { await rm(projectDir, { force: true, recursive: true }); }
});

test("rejects a standalone preflight without a signed manifest", async () => {
  const projectDir = await mkdtemp(path.join(tmpdir(), "toolcraft-preflight-manifest-"));
  try {
    await assert.rejects(validateToolcraftFeaturePlaywrightPreflightAuthority({ projectDir }), /requires \.toolcraft-manifest\.json/iu);
  } finally { await rm(projectDir, { force: true, recursive: true }); }
});

test("rejects a generated manifest when the copied UI domain is missing", async () => {
  const projectDir = await createToolcraftIntegrityFixture();
  try {
    await rm(path.join(projectDir, "src/toolcraft/ui"), { force: true, recursive: true });
    await assert.rejects(requireToolcraftFeaturePreflightManifest(projectDir),
      /requires its runtime and UI domain evidence/iu);
  } finally { await rm(projectDir, { force: true, recursive: true }); }
});

test("imports the Vite source loader only after protected preflight", async () => {
  const source = await readFile(new URL("./run-feature-verification.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /from "\.\/toolcraft-feature-source-loader\.mjs"/u);
  assert.match(source, /loadFeaturePlan:\s*async[\s\S]*import\("\.\/toolcraft-feature-source-loader\.mjs"\)/u);
});

test("rejects preflight-owned mutation performed while loading the source plan", async () => {
  let mutated = false, selectedValidation = false;
  const dependencies = {
    loadFeaturePlan: async () => { mutated = true; return { acceptanceIds: ["material.layer"], scenarios: [], version: 2 }; },
    revalidatePlaywrightAuthoritySeal: async () => { if (mutated) throw new Error("preflight toolchain changed"); },
    validatePlaywrightAuthority: async () => { selectedValidation = true; },
    validatePlaywrightPreflightAuthority: async () => ({ seal: { files: [] } }),
  };
  await assert.rejects(runToolcraftFeatureVerificationCore({ dependencies, projectDir: process.cwd(),
    request: { acceptanceIds: ["material.layer"], mode: "ids", version: 1 } }), /preflight toolchain changed/iu);
  assert.equal(selectedValidation, false);
});

test("seals the manifest itself across source-plan loading", async () => {
  const projectDir = await createToolcraftIntegrityFixture();
  const manifestPath = path.join(projectDir, "src/toolcraft/.toolcraft-manifest.json");
  try {
    const seal = await createToolcraftFeaturePlaywrightAuthoritySeal(projectDir,
      { sourceRecords: new Map() }, [], new Map([["src/toolcraft/.toolcraft-manifest.json", await readFile(manifestPath)]]));
    let selectedValidation = false;
    await assert.rejects(runToolcraftFeatureVerificationCore({ dependencies: {
      loadFeaturePlan: async () => {
        await writeFile(manifestPath, "{}\n");
        return { acceptanceIds: ["material.layer"], scenarios: [], version: 2 };
      },
      revalidatePlaywrightAuthoritySeal: revalidateToolcraftFeaturePlaywrightAuthoritySeal,
      validatePlaywrightAuthority: async () => { selectedValidation = true; },
      validatePlaywrightPreflightAuthority: async () => ({ seal }),
    }, projectDir, request: { acceptanceIds: ["material.layer"], mode: "ids", version: 1 } }),
    /\.toolcraft-manifest\.json changed after authority validation/iu);
    assert.equal(selectedValidation, false);
  } finally { await rm(projectDir, { force: true, recursive: true }); }
});

test("rejects manifest replacement between inspection and seal creation", async () => {
  const projectDir = await createToolcraftIntegrityFixture();
  const manifestPath = path.join(projectDir, "src/toolcraft/.toolcraft-manifest.json");
  try {
    const source = await readFile(manifestPath);
    await writeFile(manifestPath, "{}\n");
    await assert.rejects(createToolcraftFeaturePlaywrightAuthoritySeal(projectDir,
      { sourceRecords: new Map() }, [], new Map([["src/toolcraft/.toolcraft-manifest.json", source]])),
    /changed during authority validation/iu);
  } finally { await rm(projectDir, { force: true, recursive: true }); }
});

test("rejects the starter manifest domain inside a generated runtime", async () => {
  const projectDir = await createToolcraftStarterIntegrityFixture();
  try {
    await mkdir(path.join(projectDir, "src/toolcraft/runtime"), { recursive: true });
    await assert.rejects(requireToolcraftFeaturePreflightManifest(projectDir), /cannot use the starter preflight manifest domain/iu);
  } finally { await rm(projectDir, { force: true, recursive: true }); }
});

test("rejects restoring a generated runtime after starter-domain inspection", async () => {
  const projectDir = await createToolcraftStarterIntegrityFixture();
  try {
    const manifestAuthority = await requireToolcraftFeaturePreflightManifest(projectDir);
    const snapshot = createToolcraftFeaturePreflightSnapshot({ configCandidates: [], directories: new Map(), manifestAuthority,
      resolutions: [], sources: new Map([["src/toolcraft/.toolcraft-manifest.json", manifestAuthority.source]]) });
    await mkdir(path.join(projectDir, "src/toolcraft/runtime"));
    await assert.rejects(createToolcraftFeaturePreflightSeal(projectDir, { sourceRecords: new Map() }, [], snapshot),
      /runtime manifest domain evidence changed/iu);
  } finally { await rm(projectDir, { force: true, recursive: true }); }
});
