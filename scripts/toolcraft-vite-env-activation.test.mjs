import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { createServer } from "vite";

const starterRoot = path.resolve(import.meta.dirname, "..");
const generatedProofControllerPath = path.join(
  starterRoot,
  "src/toolcraft/runtime/react/app-shell/toolcraft-unavailable-resource-proof.ts",
);
const monorepoProofControllerPath = path.resolve(
  starterRoot,
  "../packages/toolcraft-runtime/src/react/app-shell/toolcraft-unavailable-resource-proof.ts",
);
let transformedProofControllerSequence = 0;

async function resolveProofControllerSource() {
  try {
    return {
      filePath: generatedProofControllerPath,
      requestPath:
        "/src/toolcraft/runtime/react/app-shell/toolcraft-unavailable-resource-proof.ts",
      root: starterRoot,
      source: await fs.readFile(generatedProofControllerPath, "utf8"),
    };
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  return {
    filePath: monorepoProofControllerPath,
    requestPath:
      "/packages/toolcraft-runtime/src/react/app-shell/toolcraft-unavailable-resource-proof.ts",
    root: path.resolve(starterRoot, ".."),
    source: await fs.readFile(monorepoProofControllerPath, "utf8"),
  };
}

function readInjectedViteEnv(code, mode) {
  const match = code.match(/import\.meta\.env\s*=\s*(\{[^\n]*\});/u);
  assert.ok(
    match,
    `Vite ${mode} transform must recognize direct import.meta.env access and inject its environment.`,
  );
  return JSON.parse(match[1]);
}

async function transformProofController({ mode, requestPath, root }) {
  const server = await createServer({
    configFile: false,
    envDir: false,
    mode,
    optimizeDeps: { noDiscovery: true },
    root,
    server: { middlewareMode: true },
  });

  try {
    const result = await server.transformRequest(requestPath);
    assert.ok(result?.code, `Vite ${mode} transform must return runtime code.`);
    return result.code;
  } finally {
    await server.close();
  }
}

async function loadTransformedProofController({
  fixtureFlag,
  mode,
  requestPath,
  root,
}) {
  const previousFixtureValue =
    process.env.VITE_TOOLCRAFT_BROWSER_PROOF_FIXTURES;
  try {
    if (fixtureFlag === undefined) {
      delete process.env.VITE_TOOLCRAFT_BROWSER_PROOF_FIXTURES;
    } else {
      process.env.VITE_TOOLCRAFT_BROWSER_PROOF_FIXTURES = fixtureFlag;
    }
    const code = await transformProofController({ mode, requestPath, root });
    const moduleUrl =
      `data:text/javascript;base64,${Buffer.from(code).toString("base64")}` +
      `#toolcraft-proof-${++transformedProofControllerSequence}`;
    const transformedModule = await import(moduleUrl);
    assert.equal(
      typeof transformedModule.decorateToolcraftUnavailableResourceProofCoordinator,
      "function",
    );
    return {
      code,
      decorateCoordinator:
        transformedModule.decorateToolcraftUnavailableResourceProofCoordinator,
    };
  } finally {
    if (previousFixtureValue === undefined) {
      delete process.env.VITE_TOOLCRAFT_BROWSER_PROOF_FIXTURES;
    } else {
      process.env.VITE_TOOLCRAFT_BROWSER_PROOF_FIXTURES = previousFixtureValue;
    }
  }
}

async function observeProofControllerDecoration(decorateCoordinator) {
  const addedEvents = [];
  const removedEvents = [];
  const previousDocument = globalThis.document;
  globalThis.document = {
    addEventListener(eventName) {
      addedEvents.push(eventName);
    },
    removeEventListener(eventName) {
      removedEvents.push(eventName);
    },
  };
  const originalDispose = async () => {};
  const originalResolveResource = async () => new Uint8Array([1]);
  const coordinator = {
    dispose: originalDispose,
    resolveResource: originalResolveResource,
  };
  try {
    const returned = decorateCoordinator(coordinator, {});
    const decorationApplied =
      coordinator.dispose !== originalDispose &&
      coordinator.resolveResource !== originalResolveResource;
    await coordinator.dispose();
    return {
      addedEvents,
      decorationApplied,
      removedEvents,
      returnedOriginal: returned === coordinator,
    };
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
}

test("unavailable-resource proof activation uses Vite-static env access and stays production-disabled", async () => {
  const proofController = await resolveProofControllerSource();
  assert.match(
    proofController.source,
    /import\.meta\.env\?\.MODE/u,
    `${proofController.filePath} must read MODE through direct, Node-safe Vite-static access.`,
  );
  assert.match(
    proofController.source,
    /import\.meta\.env\?\.VITE_TOOLCRAFT_BROWSER_PROOF_FIXTURES/u,
    `${proofController.filePath} must read the protected fixture flag through direct, Node-safe Vite-static access.`,
  );
  assert.doesNotMatch(
    proofController.source,
    /\bconst\s+\w+\s*=\s*import\.meta\s*(?:;|\n)/u,
    `${proofController.filePath} must not alias import.meta before reading env.`,
  );

  for (const scenario of [
    { enabled: false, fixtureFlag: undefined, mode: "production" },
    { enabled: false, fixtureFlag: undefined, mode: "development" },
    { enabled: true, fixtureFlag: undefined, mode: "test" },
    {
      enabled: true,
      fixtureFlag: "unavailable-resource",
      mode: "production",
    },
  ]) {
    const transformed = await loadTransformedProofController({
      ...proofController,
      fixtureFlag: scenario.fixtureFlag,
      mode: scenario.mode,
    });
    const injectedEnv = readInjectedViteEnv(
      transformed.code,
      scenario.mode,
    );
    assert.equal(injectedEnv.MODE, scenario.mode);
    assert.equal(
      injectedEnv.VITE_TOOLCRAFT_BROWSER_PROOF_FIXTURES,
      scenario.fixtureFlag,
    );
    assert.deepEqual(
      await observeProofControllerDecoration(
        transformed.decorateCoordinator,
      ),
      {
        addedEvents: scenario.enabled
          ? ["toolcraft.browser-proof.unavailable-resource-request"]
          : [],
        decorationApplied: scenario.enabled,
        removedEvents: scenario.enabled
          ? ["toolcraft.browser-proof.unavailable-resource-request"]
          : [],
        returnedOriginal: true,
      },
    );
  }
});
