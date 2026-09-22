import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  executeToolcraftDeliveryPlanCore,
} from "./toolcraft-delivery-executor.mjs";
import {
  EMPTY_TOOLCRAFT_DELIVERY_LIFECYCLE_STATE,
} from "./toolcraft-delivery-lifecycle-state.mjs";
import {
  createToolcraftPlanExecutionAuthorityRegistry,
} from "./toolcraft-plan-execution-authority.mjs";
import {
  createToolcraftDeliveryReceipt,
} from "./toolcraft-delivery-receipt.mjs";
import {
  createFunctionalProofModelFixture,
  createInventory,
  createPlanReceiptFixture,
} from "./toolcraft-delivery-receipt-test-helpers.mjs";
import {
  createToolcraftFunctionalProofModelHash,
} from "./toolcraft-functional-proof-model.mjs";
import {
  runToolcraftProtectedBrowserBuild,
} from "./toolcraft-protected-browser-build.mjs";

const hash = (character) => character.repeat(64);

function freeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function createScheduledPlan() {
  const finalInventory = createInventory({
    "src/app/app-schema.ts": hash("2"),
  });
  const functionalProofModel = createFunctionalProofModelFixture();
  const functionalProofModelHash =
    createToolcraftFunctionalProofModelHash(functionalProofModel);
  return {
    finalInventory,
    plan: freeze({
      basis: { kind: "initial" },
      functionalProofModelHash,
      kind: "functional",
      lifecycle: EMPTY_TOOLCRAFT_DELIVERY_LIFECYCLE_STATE,
      manifestHash: hash("a"),
      sourceHash: finalInventory.sourceHash,
      steps: [
        { kind: "docs" },
        { kind: "code-health" },
        {
          acceptanceIds: null,
          files: ["src/app/app-schema.test.ts"],
          kind: "product-tests",
        },
        { kind: "build" },
        {
          kind: "browser-functional",
          testNames: ["browser: focused acceptance"],
        },
      ],
    }),
  };
}

function createNoopOperations(overrides = {}) {
  return freeze({
    collectInventory: async () => {
      throw new Error("collectInventory must be supplied by the test.");
    },
    runBrowserFunctional: async () => {},
    runBrowserPerformance: async () => {
      throw new Error("Unexpected performance proof.");
    },
    runBuild: async () => {},
    runCodeHealth: async () => {},
    runDependencies: async () => {},
    runDocs: async () => {},
    runProductTests: async () => {},
    ...overrides,
  });
}

test("executes exact overlapping stages and waits for build before browser", async () => {
  const { finalInventory, plan } = createScheduledPlan();
  const docs = deferred();
  const codeHealth = deferred();
  const productTests = deferred();
  const build = deferred();
  const events = [];
  const operations = createNoopOperations({
    collectInventory: async () => {
      events.push("final-inventory");
      return finalInventory;
    },
    runBrowserFunctional: async () => {
      events.push("browser-functional:start");
      events.push("browser-functional:finish");
    },
    runBuild: async () => {
      events.push("build:start");
      await build.promise;
      events.push("build:finish");
    },
    runCodeHealth: async () => {
      events.push("code-health:start");
      await codeHealth.promise;
      events.push("code-health:finish");
    },
    runDocs: async () => {
      events.push("docs:start");
      await docs.promise;
      events.push("docs:finish");
    },
    runProductTests: async () => {
      events.push("product-tests:start");
      await productTests.promise;
      events.push("product-tests:finish");
    },
  });

  const execution = executeToolcraftDeliveryPlanCore({
    operations,
    plan,
    projectDir: "/workspace/app",
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(events, ["docs:start", "code-health:start"]);
  docs.resolve();
  codeHealth.resolve();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(events.slice(2, 6), [
    "docs:finish",
    "code-health:finish",
    "product-tests:start",
    "build:start",
  ]);
  assert.equal(events.includes("browser-functional:start"), false);
  productTests.resolve();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(events.includes("browser-functional:start"), false);
  build.resolve();

  const result = await execution;
  assert.deepEqual(events, [
    "docs:start",
    "code-health:start",
    "docs:finish",
    "code-health:finish",
    "product-tests:start",
    "build:start",
    "product-tests:finish",
    "build:finish",
    "browser-functional:start",
    "browser-functional:finish",
    "final-inventory",
  ]);
  assert.deepEqual(result.evidence, [
    { kind: "docs" },
    { kind: "code-health" },
    { files: ["src/app/app-schema.test.ts"], kind: "product-tests" },
    { kind: "build" },
    {
      kind: "browser-functional",
      testNames: ["browser: focused acceptance"],
    },
  ]);
  assert.equal(Object.isFrozen(result), true);
});

test("does not require a removed browser operation", async () => {
  const { plan, result } =
    createPlanReceiptFixture("functional-initial");
  await assert.doesNotReject(
    executeToolcraftDeliveryPlanCore({
      operations: createNoopOperations({
        collectInventory: async () => result.finalInventory,
      }),
      plan,
      projectDir: "/workspace/app",
    }),
  );
});

test("rejects an unknown browser operation", async () => {
  const { plan, result } =
    createPlanReceiptFixture("functional-initial");
  await assert.rejects(
    executeToolcraftDeliveryPlanCore({
      operations: createNoopOperations({
        collectInventory: async () => result.finalInventory,
        runBrowserLegacy: async () => {},
      }),
      plan,
      projectDir: "/workspace/app",
    }),
    /operations/iu,
  );
});

test("initial functional proof invokes the complete browser catalog once", async () => {
  const { plan, result: expected } =
    createPlanReceiptFixture("functional-initial");
  const invocations = [];
  const operations = createNoopOperations({
    collectInventory: async () => expected.finalInventory,
    runBrowserFunctional: async (input) => {
      invocations.push(input);
    },
  });
  const result = await executeToolcraftDeliveryPlanCore({
    operations,
    plan,
    projectDir: "/workspace/app",
  });

  assert.equal(invocations.length, 1);
  assert.deepEqual(invocations[0].testNames, plan.steps.at(-1).testNames);
  assert.equal(invocations[0].serverMode, "preview");
  assert.deepEqual(result.evidence.at(-1), expected.evidence.at(-1));
});

test("any failed operation prevents final inventory collection", async () => {
  const { plan } = createScheduledPlan();
  let inventories = 0;
  const operations = createNoopOperations({
    collectInventory: async () => {
      inventories += 1;
    },
    runBuild: async () => {
      throw new Error("build failed");
    },
  });
  await assert.rejects(
    executeToolcraftDeliveryPlanCore({
      operations,
      plan,
      projectDir: "/workspace/app",
    }),
    /build failed/iu,
  );
  assert.equal(inventories, 0);
});

test("parallel failure waits for every sibling and reports canonical step order", async (t) => {
  for (const firstFailure of ["docs", "code-health"]) {
    await t.test(`${firstFailure} rejects first`, async () => {
      const { plan } = createScheduledPlan();
      const gates = {
        "code-health": deferred(),
        docs: deferred(),
      };
      const events = [];
      let executionResult;
      let inventories = 0;
      let productTests = 0;
      const operations = createNoopOperations({
        collectInventory: async () => {
          inventories += 1;
        },
        runCodeHealth: async () => {
          await gates["code-health"].promise;
          events.push("code-health:settled");
          throw new Error("code-health failed");
        },
        runDocs: async () => {
          await gates.docs.promise;
          events.push("docs:settled");
          throw new Error("docs failed");
        },
        runProductTests: async () => {
          productTests += 1;
        },
      });
      const registry = createToolcraftPlanExecutionAuthorityRegistry(
        (options) =>
          executeToolcraftDeliveryPlanCore({
            ...options,
            operations,
          }),
      );
      let rejectionObserved = false;
      const execution = registry
        .execute({ plan, projectDir: "/workspace/app" })
        .then((result) => {
          executionResult = result;
          return result;
        })
        .catch((error) => {
          rejectionObserved = true;
          events.push(`observed:${error.message}`);
          throw error;
        });
      await new Promise((resolve) => setImmediate(resolve));

      gates[firstFailure].resolve();
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(rejectionObserved, false);

      const secondFailure =
        firstFailure === "docs" ? "code-health" : "docs";
      gates[secondFailure].resolve();
      await assert.rejects(execution, /docs failed/iu);
      assert.deepEqual(events.slice(-1), ["observed:docs failed"]);
      assert.equal(events.includes("docs:settled"), true);
      assert.equal(events.includes("code-health:settled"), true);
      assert.equal(executionResult, undefined);
      assert.equal(inventories, 0);
      assert.equal(productTests, 0);
    });
  }
});

test("requires a deeply frozen plan and explicit frozen operations", async () => {
  const { plan, result } = createPlanReceiptFixture("functional-initial");
  await assert.rejects(
    executeToolcraftDeliveryPlanCore({
      operations: {},
      plan,
      projectDir: "/workspace/app",
    }),
    /operations/iu,
  );
  await assert.rejects(
    executeToolcraftDeliveryPlanCore({
      operations: createNoopOperations({
        collectInventory: async () => result.finalInventory,
      }),
      plan: structuredClone(plan),
      projectDir: "/workspace/app",
    }),
    /immutable/iu,
  );
});

test("same-process authority reserves one exact receipt", async () => {
  const { functionalProofModel, plan, result } =
    createPlanReceiptFixture("functional-initial");
  const projectDir = path.resolve("/workspace/app");
  const registry = createToolcraftPlanExecutionAuthorityRegistry(async () =>
    freeze(structuredClone(result)),
  );
  const execution = await registry.execute({ plan, projectDir });
  const receipt = createToolcraftDeliveryReceipt({
    functionalProofModel,
    plan,
    result: execution,
  });
  const reservation = registry.reserve({
    authority: execution.planExecutionAuthority,
    deliveryReceipt: receipt,
    projectDir,
  });

  assert.throws(
    () =>
      registry.reserve({
        authority: execution.planExecutionAuthority,
        deliveryReceipt: receipt,
        projectDir,
      }),
    /authority/iu,
  );
  registry.finalize(reservation);
  assert.throws(
    () =>
      registry.reserve({
        authority: execution.planExecutionAuthority,
        deliveryReceipt: receipt,
        projectDir,
      }),
    /authority/iu,
  );
});

test("same-process authority rejects forged, cross-project, and released bindings", async () => {
  const { functionalProofModel, plan, result } =
    createPlanReceiptFixture("functional-initial");
  const projectDir = path.resolve("/workspace/app");
  const registry = createToolcraftPlanExecutionAuthorityRegistry(async () =>
    freeze(structuredClone(result)),
  );
  const execution = await registry.execute({ plan, projectDir });
  const receipt = createToolcraftDeliveryReceipt({
    functionalProofModel,
    plan,
    result: execution,
  });
  for (const options of [
    {
      authority: Object.freeze(Object.create(null)),
      deliveryReceipt: receipt,
      projectDir,
    },
    {
      authority: execution.planExecutionAuthority,
      deliveryReceipt: receipt,
      projectDir: "/workspace/other",
    },
    {
      authority: execution.planExecutionAuthority,
      deliveryReceipt: {
        ...receipt,
        evidence: [{ kind: "build" }],
      },
      projectDir,
    },
  ]) {
    assert.throws(() => registry.reserve(options), /authority/iu);
  }
  const reservation = registry.reserve({
    authority: execution.planExecutionAuthority,
    deliveryReceipt: receipt,
    projectDir,
  });
  registry.release(reservation);
  assert.throws(() => registry.finalize(reservation), /reservation/iu);
});

test("protected browser build fixes the exact compile-time proof fixture without broadening other scripts", async () => {
  const invocations = [];
  await runToolcraftProtectedBrowserBuild({
    environment: {
      PATH: "/workspace/bin",
      VITE_TOOLCRAFT_BROWSER_PROOF_FIXTURES: "hostile-value",
      VITE_TOOLCRAFT_BROWSER_PROOF_UNRECOGNIZED: "hostile-value",
    },
    projectDir: "/workspace/app",
    runPackageScript: async (...args) => {
      invocations.push(args);
    },
  });

  assert.equal(invocations.length, 1);
  assert.equal(invocations[0][0], "/workspace/app");
  assert.equal(invocations[0][1], "build");
  assert.deepEqual(invocations[0][2].env, {
    PATH: "/workspace/bin",
    VITE_TOOLCRAFT_BROWSER_PROOF_FIXTURES: "unavailable-resource",
  });
});
