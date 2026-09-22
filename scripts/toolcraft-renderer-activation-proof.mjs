import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const sourceRoots = [
  "src/toolcraft/integrations/vgpu", "src/toolcraft/renderer-providers",
  "toolcraft/renderer-providers/vgpu",
];
const sourceFiles = [
  "scripts/toolcraft-renderer-activation.mjs", "scripts/toolcraft-renderer-activation-proof.mjs",
  "scripts/toolcraft-renderer-provider.mjs", "scripts/renderer-provider-registry-client.mjs",
  "scripts/toolcraft-renderer-vite-plugins.mjs",
  "e2e/app-browser-vgpu-surface.spec.ts", "e2e/browser-vgpu-surface-fixture.ts",
  "e2e/browser-vgpu-surface-fixture.html", "e2e/renderer-provider-runtime-evidence.ts",
];

export async function readActivationSourceHash(appRoot) {
  const files = [...sourceFiles];
  async function walk(relative) {
    for (const entry of await fs.readdir(path.join(appRoot, relative), { withFileTypes: true })) {
      const child = `${relative}/${entry.name}`;
      if (entry.isDirectory()) await walk(child);
      else if (entry.isFile()) files.push(child);
    }
  }
  for (const root of sourceRoots) await walk(root);
  const hash = createHash("sha256");
  for (const file of files.sort()) {
    hash.update(JSON.stringify([file, createHash("sha256").update(await fs.readFile(path.join(appRoot, file))).digest("hex")]));
  }
  return hash.digest("hex");
}

export function runActivationProcess({ cwd, command, args, label }) {
  process.stdout.write(`[vgpu] ${label}\n`);
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, shell: false, env: { ...process.env, CI: "true" }, stdio: ["ignore", "pipe", "pipe"] });
    let tail = "";
    for (const stream of [child.stdout, child.stderr]) stream.on("data", (chunk) => {
      tail = (tail + chunk.toString()).slice(-12_000);
    });
    child.once("error", reject);
    child.once("close", (code) => code === 0 ? resolve() : reject(new Error(`VGPU ${label} failed (${code}):\n${tail}`)));
  });
}

export function activationExec(manager, binary, args) {
  return { command: manager, args: manager === "npm" ? ["exec", "--", binary, ...args] : ["exec", binary, ...args] };
}

export async function verifyActivationCandidate({ appRoot, manager, execute = runActivationProcess }) {
  const run = (label, binary, args) => execute({ cwd: appRoot, label, ...activationExec(manager, binary, args) });
  await run("browser-install", "playwright", ["install", "chromium"]);
  await run("wgsl-check", "vgpu", ["check", "--require-validation", "toolcraft/renderer-providers/vgpu/fixtures/verification.wgsl"]);
  await run("adapter-types", "tsc", ["-p", "toolcraft/renderer-providers/vgpu/tsconfig.json"]);
  await run("adapter-tests", "vitest", ["run", "toolcraft/renderer-providers/vgpu/tests"]);
  await run("surface-browser", "playwright", ["test", "e2e/app-browser-vgpu-surface.spec.ts", "--workers=1"]);
}

export async function assertInstalledActivationTuple(appRoot, dependencies) {
  let lock;
  try { lock = { manager: "npm", value: JSON.parse(await fs.readFile(path.join(appRoot, "package-lock.json"), "utf8")) }; }
  catch (error) {
    if (error.code !== "ENOENT") throw error;
    lock = { manager: "pnpm", value: await fs.readFile(path.join(appRoot, "pnpm-lock.yaml"), "utf8") };
  }
  for (const dependency of dependencies) {
    if (lock.manager === "npm") {
      const entry = lock.value.packages?.[`node_modules/${dependency.name}`];
      if (entry?.version !== dependency.version || entry?.integrity !== dependency.integrity) throw new Error(`Lockfile integrity/version mismatch for ${dependency.name}.`);
    } else {
      const key = `${dependency.name}@${dependency.version}`;
      const lines = lock.value.split(/\r?\n/u);
      const matches = lines.flatMap((line, index) => line === `  ${key}:` || line === `  '${key}':` ? [index] : []);
      const integrity = matches.map((index) => lines[index + 1]?.match(/^    resolution: \{integrity: ([^,}\s]+)\}$/u)?.[1]).filter(Boolean);
      if (integrity.length !== 1 || integrity[0] !== dependency.integrity) throw new Error(`Lockfile integrity mismatch for ${dependency.name}.`);
    }
    const manifest = JSON.parse(await fs.readFile(path.join(appRoot, "node_modules", dependency.name, "package.json"), "utf8"));
    if (manifest.name !== dependency.name || manifest.version !== dependency.version) {
      throw new Error(`Installed ${dependency.name} does not match its exact resolved version.`);
    }
  }
}
