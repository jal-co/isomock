import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { getToolcraftPlaywrightContainingFile } from "./playwright-containing-file.mjs";
import { createToolcraftDeliveryCatalog } from "./toolcraft-delivery-catalog.mjs";
import { validateToolcraftDeliveryCatalog } from "./toolcraft-delivery-catalog-validation.mjs";
import {
  createToolcraftAcceptanceContractHash,
  deriveToolcraftAcceptanceDomainId,
} from "./toolcraft-functional-proof-model.mjs";

const pathId =
  "performance-path:%5B%22interactive-discrete%22%2C%22control-change%22%2C%5B%22preview-composite%22%5D%2C%5B%5D%2C%5B%5D%2C%5B%22main%22%5D%2C%5B%5D%5D";
const performanceTestName = `browser perf: toolcraft path ${pathId}`;
const acceptance = [{
  browser: {
    budget: "standard",
    file: "e2e/background-output.spec.ts",
    testName: "browser: background color changes preview and exported image",
  },
  id: "appearance.background",
}];
const catalogAcceptanceRow = (entry, file) => ({
  acceptanceId: entry.id,
  contractHash: createToolcraftAcceptanceContractHash(entry),
  domainId: deriveToolcraftAcceptanceDomainId(entry.id),
  file,
  testName: entry.browser.testName,
});
const performancePaths = [{ id: pathId, invalidates: ["preview-composite"] }];
const catalogRoot = path.join(tmpdir(), "toolcraft-delivery-catalog-root");
const availableTests = [
  {
    file: path.join(catalogRoot, "e2e", "background-output.spec.ts"),
    testName: acceptance[0].browser.testName,
  },
  {
    file: path.join(catalogRoot, "e2e", "other-output.spec.ts"),
    testName: acceptance[0].browser.testName,
  },
  {
    file: path.join(catalogRoot, "e2e", "performance", "renderer.spec.ts"),
    testName: performanceTestName,
  },
];

test("catalog attributes helper-registered tests to their containing specs", () => {
  const rootSuite = { parent: undefined, type: "root" };
  const projectSuite = { parent: rootSuite, type: "project" };
  const fileSuite = (file) => ({
    location: { file: path.join(catalogRoot, "e2e", file), line: 1, column: 1 },
    parent: projectSuite,
    type: "file",
  });
  const helperLocation = {
    file: path.join(catalogRoot, "e2e", "toolcraft-product-test.ts"),
    line: 22,
    column: 1,
  };
  const persistenceFile = fileSuite("app-persistence.spec.ts");
  const nestedDescribe = {
    location: helperLocation,
    parent: persistenceFile,
    type: "describe",
  };
  const persistenceTest = {
    location: helperLocation,
    parent: nestedDescribe,
    title: "browser: persistence reload",
  };
  const backgroundTest = {
    location: path.join(catalogRoot, "e2e", "app-controls.spec.ts"),
    parent: fileSuite("app-controls.spec.ts"),
    title: acceptance[0].browser.testName,
  };

  assert.equal(
    getToolcraftPlaywrightContainingFile(persistenceTest, catalogRoot),
    "e2e/app-persistence.spec.ts",
  );
  assert.equal(
    getToolcraftPlaywrightContainingFile(backgroundTest, catalogRoot),
    "e2e/app-controls.spec.ts",
  );
  const persistence = {
    browser: {
      budget: "extended-io",
      file: "e2e/app-persistence.spec.ts",
      testName: persistenceTest.title,
    },
    id: "persistence.reload",
  };
  assert.deepEqual(
    createToolcraftDeliveryCatalog({
      acceptance: [persistence],
      availableTests: [{
        file: getToolcraftPlaywrightContainingFile(persistenceTest, catalogRoot),
        testName: persistenceTest.title,
      }],
      performancePaths: [],
      rootDir: catalogRoot,
    }).acceptance,
    [catalogAcceptanceRow(persistence, "e2e/app-persistence.spec.ts")],
  );
  assert.throws(
    () => createToolcraftDeliveryCatalog({
      acceptance: [persistence],
      availableTests: [persistenceTest, { ...persistenceTest, parent: persistenceFile }]
        .map((entry) => ({
          file: getToolcraftPlaywrightContainingFile(entry, catalogRoot),
          testName: entry.title,
        })),
      performancePaths: [],
      rootDir: catalogRoot,
    }),
    /appears 2 times in its declared Playwright file/iu,
  );
  assert.throws(
    () => getToolcraftPlaywrightContainingFile(
      { location: helperLocation, parent: nestedDescribe.parent.parent },
      catalogRoot,
    ),
    /containing Playwright file suite/iu,
  );
  assert.throws(
    () => getToolcraftPlaywrightContainingFile({
      location: helperLocation,
      parent: {
        location: { file: path.join(catalogRoot, "e2e", "second.spec.ts") },
        parent: persistenceFile,
        type: "file",
      },
    }, catalogRoot),
    /ambiguous containing Playwright file suites/iu,
  );
});

test("catalog selects the declared exact file when two files share a title", () => {
  const persistence = {
    browser: {
      budget: "extended-io",
      file: "e2e/persistence/reload.spec.ts",
      testName: "browser: persistence reload",
    },
    id: "persistence.reload",
  };
  const catalog = createToolcraftDeliveryCatalog({
    acceptance: [persistence, ...acceptance],
    availableTests: [...availableTests, {
      file: path.join(catalogRoot, "e2e", "persistence", "reload.spec.ts"),
      testName: persistence.browser.testName,
    }],
    performancePaths,
    rootDir: catalogRoot,
  });

  assert.deepEqual(catalog.acceptance, [
    catalogAcceptanceRow(acceptance[0], "e2e/background-output.spec.ts"),
    catalogAcceptanceRow(persistence, "e2e/persistence/reload.spec.ts"),
  ]);
});

test("catalog rejects an absent declared file and duplicate exact occurrences", () => {
  assert.throws(
    () => createToolcraftDeliveryCatalog({
      acceptance,
      availableTests: availableTests.filter(
        ({ file }) => !file.endsWith("background-output.spec.ts"),
      ),
      performancePaths,
      rootDir: catalogRoot,
    }),
    /absent.*declared Playwright file/iu,
  );
  assert.throws(
    () => createToolcraftDeliveryCatalog({
      acceptance,
      availableTests: [...availableTests, availableTests[0]],
      performancePaths,
      rootDir: catalogRoot,
    }),
    /appears 2 times in its declared Playwright file/iu,
  );
});

test("creates a sorted immutable delivery catalog from protected inputs", () => {
  const catalog = createToolcraftDeliveryCatalog({
    acceptance,
    availableTests,
    performancePaths,
    rootDir: catalogRoot,
  });

  assert.deepEqual(catalog, {
    acceptance: [
      catalogAcceptanceRow(acceptance[0], "e2e/background-output.spec.ts"),
    ],
    performance: [{
      passIds: ["preview-composite"],
      pathId,
      testName: performanceTestName,
    }],
    version: 2,
  });
  assert.equal(Object.isFrozen(catalog), true);
  assert.equal(Object.isFrozen(catalog.acceptance[0]), true);
  assert.equal(Object.isFrozen(catalog.performance[0].passIds), true);
});

test("catalog keeps two acceptance ids that share one exact browser scenario", () => {
  const shared = { ...acceptance[0], id: "appearance.background.secondary" };
  const catalog = createToolcraftDeliveryCatalog({
    acceptance: [shared, acceptance[0]],
    availableTests,
    performancePaths: [],
    rootDir: catalogRoot,
  });

  assert.deepEqual(
    catalog.acceptance.map(({ acceptanceId, file, testName }) => ({
      acceptanceId,
      file,
      testName,
    })),
    [
      {
        acceptanceId: "appearance.background",
        file: "e2e/background-output.spec.ts",
        testName: acceptance[0].browser.testName,
      },
      {
        acceptanceId: "appearance.background.secondary",
        file: "e2e/background-output.spec.ts",
        testName: acceptance[0].browser.testName,
      },
    ],
  );
});

test("catalog rejects one acceptance title mapped to different exact files", () => {
  const splitIdentity = {
    ...acceptance[0],
    browser: { ...acceptance[0].browser, file: "e2e/other-output.spec.ts" },
    id: "appearance.background.secondary",
  };
  const rawCatalog = {
    acceptance: [
      catalogAcceptanceRow(acceptance[0], acceptance[0].browser.file),
      catalogAcceptanceRow(splitIdentity, splitIdentity.browser.file),
    ],
    performance: [],
    version: 2,
  };

  assert.match(
    validateToolcraftDeliveryCatalog(rawCatalog).errors.join("\n"),
    /acceptance test name.*different files/iu,
  );
  assert.throws(
    () => createToolcraftDeliveryCatalog({
      acceptance: [acceptance[0], splitIdentity],
      availableTests,
      performancePaths: [],
      rootDir: catalogRoot,
    }),
    /acceptance test name.*different files/iu,
  );
});

test("catalog rejects acceptance and performance title collisions", () => {
  const collision = {
    ...acceptance[0],
    browser: {
      ...acceptance[0].browser,
      file: "e2e/performance/renderer.spec.ts",
      testName: performanceTestName,
    },
    id: "appearance.performance-collision",
  };
  const rawCatalog = {
    acceptance: [catalogAcceptanceRow(collision, collision.browser.file)],
    performance: [{
      passIds: ["preview-composite"],
      pathId,
      testName: performanceTestName,
    }],
    version: 2,
  };

  assert.match(
    validateToolcraftDeliveryCatalog(rawCatalog).errors.join("\n"),
    /acceptance.*performance.*test name.*collision/iu,
  );
  assert.throws(
    () => createToolcraftDeliveryCatalog({
      acceptance: [collision],
      availableTests,
      performancePaths,
      rootDir: catalogRoot,
    }),
    /acceptance.*performance.*test name.*collision/iu,
  );
});

test("catalog rejects duplicate ids, absent tests, and ambiguity", () => {
  assert.throws(
    () => createToolcraftDeliveryCatalog({
      acceptance: [...acceptance, { ...acceptance[0] }],
      availableTests,
      performancePaths: [],
      rootDir: catalogRoot,
    }),
    /duplicate acceptance id/iu,
  );
  assert.throws(
    () => createToolcraftDeliveryCatalog({
      acceptance,
      availableTests: [],
      performancePaths,
      rootDir: catalogRoot,
    }),
    /absent.*declared Playwright file/iu,
  );
  assert.throws(
    () => createToolcraftDeliveryCatalog({
      acceptance,
      availableTests: [...availableTests, availableTests[0]],
      performancePaths: [],
      rootDir: catalogRoot,
    }),
    /appears 2 times in its declared Playwright file/iu,
  );
});

test("catalog accepts only canonical app-root e2e spec identities", () => {
  const validCatalog = {
    acceptance: [catalogAcceptanceRow(acceptance[0], "e2e/nested/background.spec.ts")],
    performance: [],
    version: 2,
  };
  assert.deepEqual(validateToolcraftDeliveryCatalog(validCatalog).errors, []);

  for (const invalidFile of [
    "background.spec.ts",
    "nested/background.spec.ts",
    "../outside.spec.ts",
    "e2e/../outside.spec.ts",
    "e2e//background.spec.ts",
    "./e2e/background.spec.ts",
    "e2e\\background.spec.ts",
    "/e2e/background.spec.ts",
  ]) {
    const invalidCatalog = structuredClone(validCatalog);
    invalidCatalog.acceptance[0].file = invalidFile;
    assert.match(
      validateToolcraftDeliveryCatalog(invalidCatalog).errors.join("\n"),
      /canonical.*app-root.*e2e/iu,
      invalidFile,
    );
  }
});
