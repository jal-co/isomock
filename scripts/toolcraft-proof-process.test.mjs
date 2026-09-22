import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";

import {
  captureToolcraftProofProcess,
  detectToolcraftPackageManager,
  ensureToolcraftChromium,
  getToolcraftBinaryPath,
  getToolcraftFrozenInstallCommand,
  runToolcraftProofPackageScript,
  runToolcraftProofProcess,
} from "./toolcraft-proof-process.mjs";

function createFixture(t, prefix = "toolcraft-proof-process-") {
  const projectDir = mkdtempSync(path.join(tmpdir(), prefix));
  t.after(() => rmSync(projectDir, { force: true, recursive: true }));
  return projectDir;
}

function writeExecutable(filePath, source) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, source);
  if (process.platform !== "win32") chmodSync(filePath, 0o755);
}

function createMissingExecutableError() {
  return Object.assign(new Error("Chromium is missing."), { code: "ENOENT" });
}

test("detects package managers from the invoking user agent", () => {
  const projectDir = path.join(tmpdir(), "toolcraft-missing-project");
  assert.equal(
    detectToolcraftPackageManager(projectDir, {
      npm_config_user_agent: "pnpm/10.13.1 npm/? node/v22.14.0",
    }),
    "pnpm",
  );
  assert.equal(
    detectToolcraftPackageManager(projectDir, {
      npm_config_user_agent: "yarn/4.9.2 npm/? node/v22.14.0",
    }),
    "yarn",
  );
  assert.equal(
    detectToolcraftPackageManager(projectDir, {
      npm_config_user_agent: "bun/1.2.19 npm/? node/v22.14.0",
    }),
    "bun",
  );
  assert.equal(
    detectToolcraftPackageManager(projectDir, {
      npm_config_user_agent: "npm/11.4.2 node/v22.14.0",
    }),
    "npm",
  );
});

test("detects package managers from supported lockfiles", (t) => {
  for (const [lockfile, expected] of [
    ["pnpm-lock.yaml", "pnpm"],
    ["yarn.lock", "yarn"],
    ["bun.lock", "bun"],
    ["bun.lockb", "bun"],
    ["package-lock.json", "npm"],
  ]) {
    const projectDir = createFixture(t, `toolcraft-${expected}-lock-`);
    writeFileSync(path.join(projectDir, lockfile), "");
    assert.equal(detectToolcraftPackageManager(projectDir, {}), expected);
  }
});

test("prefers the durable project lockfile over the invoking package manager", (t) => {
  const projectDir = createFixture(t, "toolcraft-durable-npm-lock-");
  writeFileSync(path.join(projectDir, "package-lock.json"), "{}\n");

  assert.equal(
    detectToolcraftPackageManager(projectDir, {
      npm_config_user_agent: "pnpm/10.13.1 npm/? node/v22.14.0",
    }),
    "npm",
  );
});

test("returns exact frozen install commands for every package manager", () => {
  assert.deepEqual(getToolcraftFrozenInstallCommand("pnpm"), {
    args: ["install", "--frozen-lockfile"],
    command: "pnpm",
  });
  assert.deepEqual(getToolcraftFrozenInstallCommand("npm"), {
    args: ["ci"],
    command: "npm",
  });
  assert.deepEqual(getToolcraftFrozenInstallCommand("yarn"), {
    args: ["install", "--immutable"],
    command: "yarn",
  });
  assert.deepEqual(getToolcraftFrozenInstallCommand("bun"), {
    args: ["install", "--frozen-lockfile"],
    command: "bun",
  });
});

test("uses the platform-specific local binary path", () => {
  assert.equal(
    getToolcraftBinaryPath("/workspace/app", "playwright"),
    path.join(
      "/workspace/app",
      "node_modules",
      ".bin",
      process.platform === "win32" ? "playwright.cmd" : "playwright",
    ),
  );

  const originalPlatform = process.platform;
  Object.defineProperty(process, "platform", {
    configurable: true,
    value: "win32",
  });
  try {
    assert.equal(
      getToolcraftBinaryPath("C:\\workspace\\app", "playwright"),
      path.join(
        "C:\\workspace\\app",
        "node_modules",
        ".bin",
        "playwright.cmd",
      ),
    );
  } finally {
    Object.defineProperty(process, "platform", {
      configurable: true,
      value: originalPlatform,
    });
  }
});

test("runs inherited and captured proof processes through one public contract", async (t) => {
  const projectDir = createFixture(t);
  const inheritedResult = await runToolcraftProofProcess(
    process.execPath,
    ["-e", ""],
    { cwd: projectDir },
  );
  assert.equal(inheritedResult, undefined);

  const stdout = await captureToolcraftProofProcess(
    process.execPath,
    [
      "-e",
      "process.stdout.write(`${process.cwd()}|${process.env.TOOLCRAFT_CAPTURE}`)",
    ],
    {
      cwd: projectDir,
      env: {
        ...process.env,
        TOOLCRAFT_CAPTURE: "captured",
      },
    },
  );
  assert.equal(stdout, `${realpathSync(projectDir)}|captured`);
});

test("preserves JSON when a multibyte UTF-8 value is split across chunks", async () => {
  const value = { label: "café 🙂" };
  const stdout = await captureToolcraftProofProcess(process.execPath, [
    "-e",
    [
      `const bytes = Buffer.from(${JSON.stringify(JSON.stringify(value))});`,
      'const split = bytes.indexOf(Buffer.from("🙂")) + 2;',
      "process.stdout.write(bytes.subarray(0, split));",
      "setTimeout(() => process.stdout.write(bytes.subarray(split)), 25);",
    ].join(" "),
  ]);

  assert.equal(stdout, JSON.stringify(value));
  assert.deepEqual(JSON.parse(stdout), value);
});

test("preserves captured stderr when multibyte UTF-8 is split", async () => {
  const value = { error: "échec 🙂" };
  await assert.rejects(
    captureToolcraftProofProcess(process.execPath, [
      "-e",
      [
        `const bytes = Buffer.from(${JSON.stringify(JSON.stringify(value))});`,
        'const split = bytes.indexOf(Buffer.from("🙂")) + 2;',
        "process.stderr.write(bytes.subarray(0, split));",
        "setTimeout(() => {",
        "  process.stderr.write(bytes.subarray(split));",
        "  process.exit(4);",
        "}, 25);",
      ].join(" "),
    ]),
    (error) => {
      assert.equal(error.stderr, JSON.stringify(value));
      assert.deepEqual(JSON.parse(error.stderr), value);
      return true;
    },
  );
});

test("reports command basename, exit code, and captured output", async () => {
  await assert.rejects(
    captureToolcraftProofProcess(process.execPath, [
      "-e",
      'process.stdout.write("proof stdout"); process.stderr.write("proof stderr"); process.exit(7)',
    ]),
    (error) => {
      assert.match(error.message, /node.*code 7/iu);
      assert.match(error.message, /proof stdout/u);
      assert.match(error.message, /proof stderr/u);
      assert.equal(error.code, 7);
      assert.equal(error.signal, null);
      assert.equal(error.stdout, "proof stdout");
      assert.equal(error.stderr, "proof stderr");
      return true;
    },
  );
});

test(
  "terminates a hanging proof process group at its wall deadline",
  { skip: process.platform === "win32" },
  async () => {
    const startedAt = Date.now();
    await assert.rejects(
      captureToolcraftProofProcess(
        process.execPath,
        ["-e", 'require("node:child_process").spawn(process.execPath,["-e","process.on(\\"SIGTERM\\",()=>{}); setInterval(()=>{},1000)"],{stdio:"ignore"}); setInterval(()=>{},1000)'],
        { deadlineMs: 150, terminationGraceMs: 50 },
      ),
      (error) => {
        assert.equal(error.code, "TOOLCRAFT_PROOF_PROCESS_DEADLINE");
        assert.match(error.message, /150ms wall deadline/iu);
        return true;
      },
    );
    assert.ok(Date.now() - startedAt < 2_000);
  },
);
test(
  "reports a terminating signal",
  { skip: process.platform === "win32" },
  async () => {
    await assert.rejects(
      runToolcraftProofProcess(process.execPath, [
        "-e",
        'process.kill(process.pid, "SIGTERM")',
      ]),
      (error) => {
        assert.match(error.message, /node.*signal SIGTERM/iu);
        assert.equal(error.code, null);
        assert.equal(error.signal, "SIGTERM");
        return true;
      },
    );
  },
);

test("keeps spawn errors authoritative when close follows afterward", async () => {
  let spawnCalls = 0;
  const spawnProcess = () => {
    spawnCalls += 1;
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    queueMicrotask(() => {
      child.emit(
        "error",
        Object.assign(new Error("spawn denied"), { code: "EACCES" }),
      );
      child.emit("close", 0, null);
    });
    return child;
  };

  await assert.rejects(
    runToolcraftProofProcess("/fixture/proof-tool", [], { spawnProcess }),
    (error) => {
      assert.match(error.message, /proof-tool.*EACCES.*spawn denied/iu);
      assert.equal(error.code, "EACCES");
      return true;
    },
  );
  assert.equal(spawnCalls, 1);
});

test(
  "invokes ordinary package builds without injecting browser proof fixtures",
  { skip: process.platform === "win32" },
  async (t) => {
    const projectDir = createFixture(t);
    const binDir = path.join(projectDir, "bin");
    const capturePath = path.join(projectDir, "package-script.json");
    for (const packageManager of ["npm", "pnpm"]) {
      writeExecutable(
        path.join(binDir, packageManager),
        [
          "#!/usr/bin/env node",
          'import { writeFileSync } from "node:fs";',
          `writeFileSync(${JSON.stringify(capturePath)}, JSON.stringify({`,
          `  packageManager: ${JSON.stringify(packageManager)},`,
          "  args: process.argv.slice(2),",
          "  proofFixture: process.env.VITE_TOOLCRAFT_BROWSER_PROOF_FIXTURES ?? null,",
          "}));",
          "",
        ].join("\n"),
      );
    }
    const originalPath = process.env.PATH;
    const originalProofFixture =
      process.env.VITE_TOOLCRAFT_BROWSER_PROOF_FIXTURES;
    const originalUserAgent = process.env.npm_config_user_agent;
    process.env.PATH = `${binDir}${path.delimiter}${originalPath ?? ""}`;
    delete process.env.VITE_TOOLCRAFT_BROWSER_PROOF_FIXTURES;
    try {
      process.env.npm_config_user_agent = "npm/11.4.2 node/v22.14.0";
      await runToolcraftProofPackageScript(projectDir, "build");
      assert.deepEqual(JSON.parse(readFileSync(capturePath, "utf8")), {
        args: ["run", "build"],
        packageManager: "npm",
        proofFixture: null,
      });

      process.env.npm_config_user_agent = "pnpm/10.13.1 npm/? node/v22.14.0";
      await runToolcraftProofPackageScript(projectDir, "build");
      assert.deepEqual(JSON.parse(readFileSync(capturePath, "utf8")), {
        args: ["build"],
        packageManager: "pnpm",
        proofFixture: null,
      });
    } finally {
      if (originalPath === undefined) delete process.env.PATH;
      else process.env.PATH = originalPath;
      if (originalProofFixture === undefined) {
        delete process.env.VITE_TOOLCRAFT_BROWSER_PROOF_FIXTURES;
      } else {
        process.env.VITE_TOOLCRAFT_BROWSER_PROOF_FIXTURES =
          originalProofFixture;
      }
      if (originalUserAgent === undefined) {
        delete process.env.npm_config_user_agent;
      } else {
        process.env.npm_config_user_agent = originalUserAgent;
      }
    }
  },
);

test("skips Chromium installation when the configured executable is accessible", async (t) => {
  const projectDir = createFixture(t);
  const executablePath = path.join(projectDir, "chromium");
  writeFileSync(executablePath, "");

  await ensureToolcraftChromium({
    playwright: {
      chromium: {
        executablePath: () => executablePath,
      },
    },
    projectDir,
  });
});

test("installs missing Chromium through the canonical proof process", async () => {
  let accessible = false;
  const calls = [];
  const executablePath = "/fixture/chromium";
  await ensureToolcraftChromium({
    accessFile: async () => {
      if (!accessible) throw createMissingExecutableError();
    },
    playwright: {
      chromium: {
        executablePath: () => executablePath,
      },
    },
    projectDir: "/fixture/project",
    runProcess: async (...args) => {
      calls.push(args);
      accessible = true;
    },
  });

  assert.deepEqual(calls, [
    [
      getToolcraftBinaryPath("/fixture/project", "playwright"),
      ["install", "chromium"],
      { cwd: "/fixture/project", deadlineMs: 120_000 },
    ],
  ]);
});

test("bounds missing Chromium installation with the proof-process tree deadline", async () => {
  await assert.rejects(ensureToolcraftChromium({
    accessFile: async () => { throw createMissingExecutableError(); },
    playwright: { chromium: { executablePath: () => "/fixture/missing-chromium" } },
    projectDir: "/fixture/deadline-project",
    runProcess: async (_command, _arguments, options) => {
      assert.equal(options.deadlineMs, 120_000);
      throw new Error("Toolcraft proof process exceeded its 120000ms deadline and terminated its process tree.");
    },
  }), /deadline.*process tree/iu);
});

test("coalesces concurrent Chromium installation for one project and browser", async () => {
  let accessible = false;
  let finishInstall;
  let installStarted;
  let installCalls = 0;
  const started = new Promise((resolve) => {
    installStarted = resolve;
  });
  const finished = new Promise((resolve) => {
    finishInstall = resolve;
  });
  const options = {
    accessFile: async () => {
      if (!accessible) throw createMissingExecutableError();
    },
    playwright: {
      chromium: {
        executablePath: () => "/fixture/shared-chromium",
      },
    },
    projectDir: "/fixture/shared-project",
    runProcess: async () => {
      installCalls += 1;
      installStarted();
      await finished;
      accessible = true;
    },
  };

  const first = ensureToolcraftChromium(options);
  await started;
  const second = ensureToolcraftChromium(options);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(installCalls, 1);
  finishInstall();
  await Promise.all([first, second]);
  assert.equal(installCalls, 1);
});

test("clears failed Chromium installation state so a later call can retry", async () => {
  let accessible = false;
  let installCalls = 0;
  const options = {
    accessFile: async () => {
      if (!accessible) throw createMissingExecutableError();
    },
    playwright: {
      chromium: {
        executablePath: () => "/fixture/retry-chromium",
      },
    },
    projectDir: "/fixture/retry-project",
    runProcess: async () => {
      installCalls += 1;
      if (installCalls === 1) throw new Error("install failed");
      accessible = true;
    },
  };

  await assert.rejects(ensureToolcraftChromium(options), /install failed/u);
  await ensureToolcraftChromium(options);
  assert.equal(installCalls, 2);
});

test("already installed Chromium bypasses the injected process runner", async () => {
  let installCalls = 0;
  await ensureToolcraftChromium({
    accessFile: async () => {},
    playwright: {
      chromium: {
        executablePath: () => "/fixture/installed-chromium",
      },
    },
    projectDir: "/fixture/installed-project",
    runProcess: async () => {
      installCalls += 1;
    },
  });
  assert.equal(installCalls, 0);
});
