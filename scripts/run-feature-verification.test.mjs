import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  parseToolcraftFeatureVerificationArguments,
  runToolcraftFeatureVerificationCore,
} from "./run-feature-verification.mjs";
import {
  revalidateToolcraftFeaturePlaywrightAuthoritySeal,
  validateToolcraftFeaturePlaywrightAuthority,
} from "./toolcraft-feature-playwright-authority.mjs";

const standardScenario = Object.freeze({
  acceptanceIds: Object.freeze(["material.layer"]),
  budget: "standard",
  file: "e2e/app-controls.spec.ts",
  testName: "browser: material.layer",
});

const standardPlan = Object.freeze({
  acceptanceIds: Object.freeze(["material.layer"]),
  scenarios: Object.freeze([standardScenario]),
  version: 2,
});

function createDependencies(plan = standardPlan, overrides = {}) {
  const calls = { authority: [], chromium: [], load: [], output: [], revalidate: [], run: [], sequence: [] };
  const dependencies = {
    ensureChromium: async (input) => calls.chromium.push(input),
    getBinaryPath: (projectDir, binary) =>
      `${projectDir}/node_modules/.bin/${binary}`,
    loadFeaturePlan: async (input) => {
      calls.load.push(input);
      return plan;
    },
    runProcess: async (command, arguments_, options) => {
      calls.sequence.push("run");
      calls.run.push({ arguments_, command, options });
    },
    validatePlaywrightAuthority: async (input) => {
      calls.authority.push(input);
      return { seal: { files: [{ digest: "signed", filePath: "selected", repoPath: standardScenario.file }] } };
    },
    revalidatePlaywrightAuthoritySeal: async (receipt) => {
      calls.sequence.push("revalidate"); calls.revalidate.push(receipt);
    },
    writeOutput: (source) => calls.output.push(source),
    ...overrides,
  };
  return { calls, dependencies };
}

async function withProject(files, callback) {
  const projectDir = await mkdtemp(path.join(tmpdir(), "toolcraft-feature-"));
  try {
    for (const file of files) {
      const absoluteFile = path.join(projectDir, file);
      await mkdir(path.dirname(absoluteFile), { recursive: true });
      await writeFile(absoluteFile, "", "utf8");
    }
    await writeFile(path.join(projectDir, "playwright.config.ts"), "export default {};", "utf8");
    return await callback(projectDir);
  } finally {
    await rm(projectDir, { force: true, recursive: true });
  }
}

function exactPlaywrightFileFilterMatches(filter, filePath) {
  const match = filter.match(/^\/(.*)\/([gi]*)$/u);
  const regularExpression = match
    ? new RegExp(match[1], match[2])
    : new RegExp(filter, "gi");
  return regularExpression.test(filePath);
}

test("parses explicit ids and preserves explicit product-only all mode", () => {
  assert.deepEqual(
    parseToolcraftFeatureVerificationArguments([
      "material.layer",
      "lighting.intensity",
    ]),
    {
      acceptanceIds: ["lighting.intensity", "material.layer"],
      mode: "ids",
      version: 1,
    },
  );
  assert.deepEqual(
    parseToolcraftFeatureVerificationArguments(["--", "material.layer"]),
    { acceptanceIds: ["material.layer"], mode: "ids", version: 1 },
  );
  assert.deepEqual(parseToolcraftFeatureVerificationArguments(["--all"]), {
    mode: "all",
    version: 1,
  });
  assert.deepEqual(parseToolcraftFeatureVerificationArguments(["--", "--all"]), {
    mode: "all",
    version: 1,
  });

  for (const arguments_ of [
    [], ["--"], ["--unknown"], ["--", "--unknown"],
    ["material.layer", "material.layer"], ["--all", "material.layer"],
    ["--", "--all", "material.layer"], [" material.layer"],
  ]) {
    assert.throws(
      () => parseToolcraftFeatureVerificationArguments(arguments_),
      /feature verification/iu,
    );
  }
});

test("loads the current plan then runs its exact selected file once", async () => {
  await withProject([standardScenario.file], async (projectDir) => {
    const { calls, dependencies } = createDependencies();
    const request = parseToolcraftFeatureVerificationArguments(["material.layer"]);
    const result = await runToolcraftFeatureVerificationCore({
      dependencies, projectDir, request,
    });

    assert.deepEqual(result, standardPlan);
    assert.deepEqual(calls.load, [{ env: { ...process.env }, projectDir, request }]);
    assert.deepEqual(calls.chromium, [{ projectDir }]);
    assert.deepEqual(calls.authority, [{ files: [standardScenario.file], projectDir }]);
    assert.deepEqual(calls.revalidate, [{ files: [{ digest: "signed", filePath: "selected", repoPath: standardScenario.file }] }]);
    assert.deepEqual(calls.sequence, ["revalidate", "run"]);
    assert.equal(calls.run.length, 1);
    assert.equal(calls.run[0].command, `${projectDir}/node_modules/.bin/playwright`);
    const fileFilter = calls.run[0].arguments_[1];
    assert.deepEqual(calls.run[0].arguments_, [
      "test", fileFilter, "--timeout=30000", "--workers=1",
    ]);
    assert.equal(
      exactPlaywrightFileFilterMatches(
        fileFilter,
        path.join(projectDir, standardScenario.file),
      ),
      true,
    );
    assert.equal(
      exactPlaywrightFileFilterMatches(
        fileFilter,
        path.join(projectDir, "e2e/app-controlsXspec.ts"),
      ),
      false,
    );
    assert.equal(calls.run[0].options.cwd, projectDir);
    assert.equal(calls.run[0].options.deadlineMs, 50_000);
    assert.equal(
      calls.run[0].options.env.TOOLCRAFT_FEATURE_VERIFICATION_PLAN,
      JSON.stringify(standardPlan),
    );
    assert.equal(calls.run[0].options.env.TOOLCRAFT_BROWSER_SERVER_MODE, "dev");
    assert.match(calls.output.join(""), /material\.layer/iu);
  });
});

test("rejects selected closure mutation after Chromium readiness and before spawn", async () => {
  await withProject([standardScenario.file], async (projectDir) => {
    const selectedPath = path.join(projectDir, standardScenario.file);
    const { calls, dependencies } = createDependencies(standardPlan, {
      ensureChromium: async () => writeFile(selectedPath, "export const changed = true;\n"),
      revalidatePlaywrightAuthoritySeal: revalidateToolcraftFeaturePlaywrightAuthoritySeal,
      validatePlaywrightAuthority: validateToolcraftFeaturePlaywrightAuthority,
    });
    await assert.rejects(runToolcraftFeatureVerificationCore({
      dependencies, projectDir, request: parseToolcraftFeatureVerificationArguments(["material.layer"]),
    }), /app-controls\.spec\.ts changed after authority validation/iu);
    assert.equal(calls.run.length, 0);
  });
});
test("rejects imported config, configured reporter, and extended tsconfig mutation before spawn", async () => {
  for (const changedFile of ["config/playwright-helper.ts", "config/proof-reporter.ts", "config/tsconfig.base.json", "config/nested-options.json", "node_modules/proof-reporter/index.js", "node_modules/proof-reporter/package.json", "node_modules/proof-setup/index.js", "node_modules/proof-child/index.js"]) {
    await withProject([standardScenario.file], async (projectDir) => {
      await mkdir(path.join(projectDir, "config"), { recursive: true });
      await writeFile(path.join(projectDir, "playwright.config.ts"), 'import { defineConfig } from "@playwright/test"; import { port } from "./config/playwright-helper"; const suffix = "reporter"; const paths = { reporter: "proof-" + suffix }; const proofConfig = { ["reporter"]: process.env.CI ? [[paths["reporter"] as string]] : [[`./config/proof-reporter.ts`]] }; export default defineConfig({ port, metadata: { reporter: unknownReporter() } }, { ...proofConfig, globalSetup: `proof-setup` as string });');
      await writeFile(path.join(projectDir, "config/playwright-helper.ts"), "export const port = 3002;");
      await writeFile(path.join(projectDir, "config/proof-reporter.ts"), "export default class Reporter {}");
      await writeFile(path.join(projectDir, "tsconfig.json"), '{"extends":"./config/tsconfig.base.json"}');
      await writeFile(path.join(projectDir, "config/tsconfig.base.json"), '{/* jsonc */"extends":"./nested-options.json","compilerOptions":{}}');
      await writeFile(path.join(projectDir, "config/nested-options.json"), '{"compilerOptions":{}}');
      for (const packageName of ["proof-reporter", "proof-setup"]) {
        await mkdir(path.join(projectDir, "node_modules", packageName), { recursive: true });
        await writeFile(path.join(projectDir, "node_modules", packageName, "package.json"), `{"name":"${packageName}","type":"module","exports":"./index.js"}`);
        await writeFile(path.join(projectDir, "node_modules", packageName, "index.js"), "export default class ProofAuthority {}");
      }
      await mkdir(path.join(projectDir, "node_modules/proof-child"), { recursive: true }); await writeFile(path.join(projectDir, "node_modules/proof-child/package.json"), '{"name":"proof-child","type":"module","exports":"./index.js"}');
      await writeFile(path.join(projectDir, "node_modules/proof-child/index.js"), 'export const child = "safe";'); await writeFile(path.join(projectDir, "node_modules/proof-reporter/index.js"), 'import { child } from "proof-child"; export default class ProofAuthority { child = child }');
      const { calls, dependencies } = createDependencies(standardPlan, {
        ensureChromium: async () => writeFile(path.join(projectDir, changedFile), "{}"),
        revalidatePlaywrightAuthoritySeal: revalidateToolcraftFeaturePlaywrightAuthoritySeal,
        validatePlaywrightAuthority: validateToolcraftFeaturePlaywrightAuthority,
      });
      await assert.rejects(runToolcraftFeatureVerificationCore({ dependencies, projectDir,
        request: parseToolcraftFeatureVerificationArguments(["material.layer"]) }), /changed after authority validation/iu);
      assert.equal(calls.run.length, 0);
    });
  }
});
test("uses one process for mixed budgets with sorted de-duplicated files", async () => {
  const mixedPlan = Object.freeze({
    acceptanceIds: Object.freeze([
      "image.export", "material.layer", "persistence.reload",
    ]),
    scenarios: Object.freeze([
      standardScenario,
      Object.freeze({
        acceptanceIds: Object.freeze(["persistence.reload"]),
        budget: "extended-io",
        file: "e2e/app-controls.spec.ts",
        testName: "browser: persistence reload",
      }),
      Object.freeze({
        acceptanceIds: Object.freeze(["image.export"]),
        budget: "standard",
        file: "e2e/app-export.spec.ts",
        testName: "browser: image export",
      }),
    ]),
    version: 2,
  });

  await withProject(
    ["e2e/app-export.spec.ts", "e2e/app-controls.spec.ts"],
    async (projectDir) => {
      const { calls, dependencies } = createDependencies(mixedPlan);
      await runToolcraftFeatureVerificationCore({
        dependencies,
        projectDir,
        request: parseToolcraftFeatureVerificationArguments(["--all"]),
      });

      assert.equal(calls.run.length, 1);
      const fileFilters = calls.run[0].arguments_.slice(1, 3);
      assert.deepEqual(calls.run[0].arguments_, [
        "test", ...fileFilters, "--timeout=120000", "--workers=1",
      ]);
      assert.deepEqual(
        fileFilters.map((filter) =>
          ["e2e/app-controls.spec.ts", "e2e/app-export.spec.ts"].map(
            (file) => exactPlaywrightFileFilterMatches(
              filter,
              path.join(projectDir, file),
            ),
          )
        ),
        [[true, false], [false, true]],
      );
      assert.deepEqual(
        JSON.parse(calls.run[0].options.env.TOOLCRAFT_FEATURE_VERIFICATION_PLAN),
        mixedPlan,
      );
    },
  );
});

test("passes regular-expression syntax only through the exact plan", async () => {
  const plan = Object.freeze({
    acceptanceIds: Object.freeze(["material.advanced"]),
    scenarios: Object.freeze([Object.freeze({
      acceptanceIds: Object.freeze(["material.advanced"]),
      budget: "standard",
      file: "e2e/app-controls.spec.ts",
      testName: "browser: material (advanced)",
    })]),
    version: 2,
  });
  await withProject(["e2e/app-controls.spec.ts"], async (projectDir) => {
    const { calls, dependencies } = createDependencies(plan);
    await runToolcraftFeatureVerificationCore({
      dependencies,
      projectDir,
      request: parseToolcraftFeatureVerificationArguments(["material.advanced"]),
    });
    assert.equal(calls.run[0].arguments_.includes("--grep"), false);
    assert.equal(
      JSON.parse(
        calls.run[0].options.env.TOOLCRAFT_FEATURE_VERIFICATION_PLAN,
      ).scenarios[0].testName,
      "browser: material (advanced)",
    );
  });
});

test("uses an exact absolute file filter for nested identity without fabricating a Playwright title", async () => {
  const nestedScenario = Object.freeze({
    acceptanceIds: Object.freeze(["material.nested"]),
    budget: "standard",
    file: "e2e/nested/app-controls.spec.ts",
    testName: "browser: material (nested)",
  });
  const plan = Object.freeze({
    acceptanceIds: nestedScenario.acceptanceIds,
    scenarios: Object.freeze([nestedScenario]),
    version: 2,
  });

  await withProject([nestedScenario.file], async (projectDir) => {
    const { calls, dependencies } = createDependencies(plan);
    await runToolcraftFeatureVerificationCore({
      dependencies,
      projectDir,
      request: parseToolcraftFeatureVerificationArguments(["material.nested"]),
    });

    assert.equal(calls.run.length, 1);
    assert.equal(
      exactPlaywrightFileFilterMatches(
        calls.run[0].arguments_[1],
        path.join(projectDir, nestedScenario.file),
      ),
      true,
    );
    assert.equal(
      exactPlaywrightFileFilterMatches(
        calls.run[0].arguments_[1],
        path.join(projectDir, "e2e/nested/app-controlsXspec.ts"),
      ),
      false,
    );
    assert.equal(calls.run[0].arguments_.includes("--grep"), false);
    assert.equal(
      JSON.parse(
        calls.run[0].options.env.TOOLCRAFT_FEATURE_VERIFICATION_PLAN,
      ).scenarios[0].file,
      nestedScenario.file,
    );
  });
});

test("surfaces source loader failure before Chromium", async () => {
  await withProject([], async (projectDir) => {
    const sourceError = new Error("source plan failed");
    const { calls, dependencies } = createDependencies(standardPlan, {
      loadFeaturePlan: async () => { throw sourceError; },
    });
    await assert.rejects(
      runToolcraftFeatureVerificationCore({
        dependencies,
        projectDir,
        request: parseToolcraftFeatureVerificationArguments(["material.layer"]),
      }),
      sourceError,
    );
    assert.equal(calls.chromium.length, 0);
    assert.equal(calls.run.length, 0);
  });
});

test("rejects a missing selected file before Chromium or process execution", async () => {
  await withProject([], async (projectDir) => {
    const { calls, dependencies } = createDependencies();
    await assert.rejects(
      runToolcraftFeatureVerificationCore({
        dependencies,
        projectDir,
        request: parseToolcraftFeatureVerificationArguments(["material.layer"]),
      }),
      /selected browser file.*real file/iu,
    );
    assert.equal(calls.chromium.length, 0);
    assert.equal(calls.run.length, 0);
  });
});

test("rejects selected Playwright authority before Chromium", async () => {
  await withProject([standardScenario.file], async (projectDir) => {
    const authorityError = new Error("protected Playwright authority rejected");
    const { calls, dependencies } = createDependencies(standardPlan, {
      validatePlaywrightAuthority: async (input) => {
        calls.authority.push(input);
        throw authorityError;
      },
    });
    await assert.rejects(
      runToolcraftFeatureVerificationCore({
        dependencies,
        projectDir,
        request: parseToolcraftFeatureVerificationArguments(["material.layer"]),
      }),
      authorityError,
    );
    assert.equal(calls.authority.length, 1);
    assert.equal(calls.chromium.length, 0);
    assert.equal(calls.run.length, 0);
  });
});

test("surfaces the one Playwright process failure", async () => {
  await withProject([standardScenario.file], async (projectDir) => {
    const processError = new Error("Playwright failed");
    const { calls, dependencies } = createDependencies(standardPlan, {
      runProcess: async (command, arguments_, options) => {
        calls.run.push({ arguments_, command, options });
        throw processError;
      },
    });
    await assert.rejects(
      runToolcraftFeatureVerificationCore({
        dependencies,
        projectDir,
        request: parseToolcraftFeatureVerificationArguments(["material.layer"]),
      }),
      processError,
    );
    assert.equal(calls.chromium.length, 1);
    assert.equal(calls.run.length, 1);
  });
});

test("strips inherited proof authority and replaces forged feature state", async () => {
  const inheritedAuthority = {
    TOOLCRAFT_BROWSER_EXECUTION_LEDGER_DIRECTORY: "/ledger",
    TOOLCRAFT_BROWSER_EXECUTION_LEDGER_NONCE: "nonce",
    TOOLCRAFT_FEATURE_VERIFICATION_PLAN: '{"forged":true}',
    TOOLCRAFT_FEATURE_VERIFICATION_REQUEST: '{"forged":true}',
    TOOLCRAFT_KERNEL_BENCHMARK_REPORT_NONCE: "kernel-nonce",
    TOOLCRAFT_KERNEL_BENCHMARK_REPORT_PATH: "/kernel",
    TOOLCRAFT_KERNEL_BENCHMARK_SOURCE_HASH: "d".repeat(64),
    TOOLCRAFT_PERFORMANCE_FIXTURE_RESOLUTION_MODE: "full-certification",
    TOOLCRAFT_PERFORMANCE_FIXTURE_SELECTOR: "maximum",
    TOOLCRAFT_PERFORMANCE_REPORT_NONCE: "performance-nonce",
    TOOLCRAFT_PERFORMANCE_REPORT_PATH: "/performance",
    TOOLCRAFT_PERFORMANCE_REPORT_SOURCE_HASH: "a".repeat(64),
    TOOLCRAFT_PERFORMANCE_REQUEST_AUTHORITY_HASH: "b".repeat(64),
    TOOLCRAFT_TARGETED_PERFORMANCE_PASS_IDS: '["scene"]',
    TOOLCRAFT_TARGETED_PERFORMANCE_PATH_IDS: '["path"]',
    TOOLCRAFT_TARGETED_PERFORMANCE_REPORT_NONCE: "targeted-nonce",
    TOOLCRAFT_TARGETED_PERFORMANCE_REPORT_PATH: "/targeted",
    TOOLCRAFT_TARGETED_PERFORMANCE_REPORT_SOURCE_HASH: "c".repeat(64),
  };
  const env = { KEEP_ME: "yes", ...inheritedAuthority };
  await withProject([standardScenario.file], async (projectDir) => {
    const { calls, dependencies } = createDependencies();
    await runToolcraftFeatureVerificationCore({
      dependencies, env, projectDir,
      request: parseToolcraftFeatureVerificationArguments(["material.layer"]),
    });
    const executionEnv = calls.run[0].options.env;
    assert.equal(executionEnv.KEEP_ME, "yes");
    assert.equal(
      executionEnv.TOOLCRAFT_FEATURE_VERIFICATION_PLAN,
      JSON.stringify(standardPlan),
    );
    assert.equal(executionEnv.TOOLCRAFT_FEATURE_VERIFICATION_REQUEST, undefined);
    for (const name of Object.keys(inheritedAuthority)) {
      if (name === "TOOLCRAFT_FEATURE_VERIFICATION_PLAN") continue;
      assert.equal(executionEnv[name], undefined, name);
    }
    assert.deepEqual(env, { KEEP_ME: "yes", ...inheritedAuthority });
  });
});

test("isolates concurrent source loads from ambient proof state across success and failure", async () => {
  const previousPlan = process.env.TOOLCRAFT_FEATURE_VERIFICATION_PLAN;
  const previousRequest = process.env.TOOLCRAFT_FEATURE_VERIFICATION_REQUEST;
  process.env.TOOLCRAFT_FEATURE_VERIFICATION_PLAN = '{"forged":true}';
  process.env.TOOLCRAFT_FEATURE_VERIFICATION_REQUEST = '{"forged":true}';
  try {
    await withProject([standardScenario.file], async (projectDir) => {
      const seenEnvironments = [];
      const success = createDependencies(standardPlan, {
        loadFeaturePlan: async ({ env }) => {
          seenEnvironments.push(env);
          await new Promise((resolve) => setTimeout(resolve, 10));
          return standardPlan;
        },
      });
      const failure = createDependencies(standardPlan, {
        loadFeaturePlan: async ({ env }) => {
          seenEnvironments.push(env);
          throw new Error("isolated load failed");
        },
      });
      const request = parseToolcraftFeatureVerificationArguments(["material.layer"]);
      const outcomes = await Promise.allSettled([
        runToolcraftFeatureVerificationCore({ dependencies: success.dependencies, env: { SAFE: "one", TOOLCRAFT_FEATURE_VERIFICATION_PLAN: "forged" }, projectDir, request }),
        runToolcraftFeatureVerificationCore({ dependencies: failure.dependencies, env: { SAFE: "two", TOOLCRAFT_FEATURE_VERIFICATION_REQUEST: "forged" }, projectDir, request }),
      ]);
      assert.equal(outcomes[0].status, "fulfilled");
      assert.equal(outcomes[1].status, "rejected");
      assert.deepEqual(seenEnvironments.toSorted((a, b) => a.SAFE.localeCompare(b.SAFE)), [{ SAFE: "one" }, { SAFE: "two" }]);
    });
    assert.equal(process.env.TOOLCRAFT_FEATURE_VERIFICATION_PLAN, '{"forged":true}');
    assert.equal(process.env.TOOLCRAFT_FEATURE_VERIFICATION_REQUEST, '{"forged":true}');
  } finally {
    if (previousPlan === undefined) delete process.env.TOOLCRAFT_FEATURE_VERIFICATION_PLAN;
    else process.env.TOOLCRAFT_FEATURE_VERIFICATION_PLAN = previousPlan;
    if (previousRequest === undefined) delete process.env.TOOLCRAFT_FEATURE_VERIFICATION_REQUEST;
    else process.env.TOOLCRAFT_FEATURE_VERIFICATION_REQUEST = previousRequest;
  }
});

test("runner has no capture, listing, inexact grep, or redundant selection adapter", async () => {
  const source = await readFile(new URL("./run-feature-verification.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /captureProcess|--list|--grep|toolcraft-feature-browser-selection|createToolcraftFeatureBrowserSelection|serializeToolcraftFeatureVerificationPlan|validateLoadedPlan/iu);
});
