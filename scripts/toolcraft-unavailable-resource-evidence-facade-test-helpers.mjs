import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

import ts from "typescript";

const harnessStateKey = Symbol.for(
  "toolcraft.unavailable-resource-evidence-facade-harness",
);
const evidenceAttribute = "data-toolcraft-unavailable-resource-evidence";
const proofEventName = "toolcraft.browser-proof.unavailable-resource-request";
const runtimeAppSelector = '[data-slot="toolcraft-runtime-app"]';
const starterRoot = path.resolve(import.meta.dirname, "..");
const helperPath = path.join(
  starterRoot,
  "e2e/browser-infinity-canvas-evidence.ts",
);
const observationHelperPath = path.join(
  starterRoot,
  "e2e/browser-infinity-canvas-observation.ts",
);
const unavailableImageHelperPath = path.join(
  starterRoot,
  "e2e/browser-infinity-canvas-unavailable-image-evidence.ts",
);
let sessionSequence = 0;

function getState() {
  const state = globalThis[harnessStateKey];
  assert.ok(state, "Unavailable-resource evidence harness must be reset first.");
  return state;
}

export function executeClosurelessObservation(read, root) {
  const execute = new Function(
    "root",
    `"use strict"; return (${read.toString()})(root);`,
  );
  return execute(root);
}

function publishObservation(state, observation) {
  state.observation = observation;
  state.attributeValue = JSON.stringify(observation);
}

function createProtocolState() {
  const state = {
    actionCalls: 0,
    activationError: null,
    artifactValidations: 0,
    attachments: [],
    attributeNames: [],
    attributeValue: null,
    bridgeActions: [],
    bridgeStatus: "missing",
    cleanupFailure: false,
    closurelessObservationCalls: 0,
    eventNames: [],
    executeClosurelessObservation,
    malformedActivation: false,
    observation: { status: "missing" },
    pollCalls: 0,
    selectorNames: [],
    sessionAssertions: 0,
    trace: [],
  };
  state.root = {
    getAttribute(attributeName) {
      state.attributeNames.push(attributeName);
      assert.equal(attributeName, evidenceAttribute);
      return state.attributeValue;
    },
  };
  state.document = {
    dispatchEvent(event) {
      state.eventNames.push(event.type);
      assert.equal(event.type, proofEventName);
      const detail = event.detail;
      assert.equal(typeof detail, "object");
      const expectedAction = state.bridgeStatus === "missing"
        ? "activate"
        : "cleanup";
      assert.equal(detail.action, expectedAction);
      state.bridgeActions.push(detail.action);
      state.trace.push(`action:${detail.action}`);
      if (detail.action === "cleanup" && state.cleanupFailure) {
        throw new Error("cleanup failed");
      }
      if (detail.action === "activate" && state.activationError) {
        state.bridgeStatus = "error";
        publishObservation(state, {
          message: state.activationError,
          requestId: detail.requestId,
          status: "error",
        });
        return true;
      }
      if (detail.action === "activate" && state.malformedActivation) {
        state.bridgeStatus = "error";
        state.attributeValue = "{";
        return true;
      }
      state.bridgeStatus = detail.action === "activate" ? "active" : "cleaned";
      publishObservation(state, {
        assetId: "image-2",
        fileName: detail.fileName,
        lifecycle: detail.action === "activate" ? "unavailable" : "ready",
        requestId: detail.requestId,
        resolverAvailable: detail.action !== "activate",
        status: state.bridgeStatus,
      });
      return true;
    },
  };
  state.page = {
    async evaluate(run, payload) {
      const previousDocument = globalThis.document;
      const previousCustomEvent = globalThis.CustomEvent;
      globalThis.document = state.document;
      globalThis.CustomEvent = class ToolcraftHarnessCustomEvent {
        constructor(type, options) {
          this.detail = options.detail;
          this.type = type;
        }
      };
      try {
        return await run(payload);
      } finally {
        if (previousDocument === undefined) delete globalThis.document;
        else globalThis.document = previousDocument;
        if (previousCustomEvent === undefined) delete globalThis.CustomEvent;
        else globalThis.CustomEvent = previousCustomEvent;
      }
    },
    locator(selector) {
      state.selectorNames.push(selector);
      assert.equal(selector, runtimeAppSelector);
      return {
        getAttribute: (attributeName) =>
          state.root.getAttribute(attributeName),
      };
    },
  };
  return state;
}

async function transpileEvidenceModule(sourcePath, outputPath) {
  const source = (await fs.readFile(sourcePath, "utf8"))
    .replaceAll('"@playwright/test"', '"./playwright.mjs"')
    .replaceAll('"./browser-infinity-artifact-parity"', '"./browser-infinity-artifact-parity.mjs"')
    .replaceAll('"./browser-runtime-evidence"', '"./evidence.mjs"')
    .replaceAll('"./browser-proof-session"', '"./proof-session.mjs"')
    .replaceAll('"./export-artifact-helpers"', '"./artifact.mjs"')
    .replaceAll(
      '"./browser-infinity-canvas-unavailable-image-evidence"',
      '"./browser-infinity-canvas-unavailable-image-evidence.mjs"',
    )
    .replaceAll(
      '"./browser-infinity-canvas-observation"',
      '"./browser-infinity-canvas-observation.mjs"',
    );
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: sourcePath,
  });
  await fs.writeFile(outputPath, outputText);
}

export async function loadUnavailableResourceFacade(context) {
  const outputDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "toolcraft-unavailable-resource-evidence-"),
  );
  context.after(() => fs.rm(outputDir, { force: true, recursive: true }));
  const outputPath = path.join(outputDir, "browser-infinity-canvas-evidence.mjs");
  const stateAccessor =
    `globalThis[Symbol.for("${Symbol.keyFor(harnessStateKey)}")]`;

  await Promise.all([
    transpileEvidenceModule(helperPath, outputPath),
    transpileEvidenceModule(path.join(starterRoot, "e2e/browser-infinity-artifact-parity.ts"), path.join(outputDir, "browser-infinity-artifact-parity.mjs")),
    transpileEvidenceModule(
      observationHelperPath,
      path.join(outputDir, "browser-infinity-canvas-observation.mjs"),
    ),
    transpileEvidenceModule(
      unavailableImageHelperPath,
      path.join(
        outputDir,
        "browser-infinity-canvas-unavailable-image-evidence.mjs",
      ),
    ),
    fs.writeFile(
      path.join(outputDir, "playwright.mjs"),
      `
        import assert from "node:assert/strict";
        const state = () => ${stateAccessor};
        function partial(actual, expected, message) {
          for (const [key, value] of Object.entries(expected)) {
            assert.deepEqual(actual?.[key], value, message);
          }
        }
        export function expect(actual, message = "Expectation failed") {
          return {
            not: {
              toBe: (expected) => assert.notEqual(actual, expected, message),
              toEqual: (expected) => assert.notDeepEqual(actual, expected, message),
            },
            toBe: (expected) => assert.equal(actual, expected, message),
            toBeTruthy: () => assert.ok(actual, message),
            toEqual: (expected) => assert.deepEqual(actual, expected, message),
            toMatchObject(expected) {
              if (expected?.status) state().trace.push("assert:" + expected.status);
              partial(actual, expected, message);
            },
          };
        }
        expect.poll = (read, options) => ({
          async toBe(expected) {
            state().pollCalls += 1;
            assert.equal(await read(), expected, options?.message);
          },
        });
      `,
    ),
    fs.writeFile(
      path.join(outputDir, "evidence.mjs"),
      `
        const state = () => ${stateAccessor};
        export async function attachToolcraftBrowserRuntimeEvidence(evidence) {
          state().trace.push("evidence:" + evidence.evidenceType);
          state().attachments.push(evidence);
        }
      `,
    ),
    fs.writeFile(
      path.join(outputDir, "proof-session.mjs"),
      `
        import assert from "node:assert/strict";
        const state = () => ${stateAccessor};
        export function assertToolcraftBrowserProofSession(observation, ...actions) {
          state().sessionAssertions += 1;
          for (const action of actions) {
            assert.equal(
              action.sessionToken,
              observation.sessionToken,
              "Semantic evidence observations and actions must belong to the same browser proof session.",
            );
          }
        }
        export function getToolcraftBrowserActionTarget(action) {
          return action.target;
        }
        export async function readToolcraftBrowserObservation(observation) {
          const current = state();
          current.closurelessObservationCalls += 1;
          return current.executeClosurelessObservation(
            observation.read,
            current.root,
          );
        }
        export async function runToolcraftBrowserAction(action) {
          state().actionCalls += 1;
          await action.run(state().page);
        }
        export async function runToolcraftBrowserValueAction(action) {
          return action.run(state().page);
        }
      `,
    ),
    fs.writeFile(
      path.join(outputDir, "artifact.mjs"),
      `
        const state = () => ${stateAccessor};
        export function assertToolcraftProducedArtifact(artifact) {
          if (!artifact) throw new Error("missing artifact");
        }
        export function validateToolcraftExportArtifactInspection(inspection) {
          state().artifactValidations += 1;
          if (!inspection?.byteLength) throw new Error("invalid inspection");
          return inspection;
        }
      `,
    ),
  ]);

  return import(`${pathToFileURL(outputPath).href}?test=${Date.now()}`);
}

export function createSession() {
  const sessionToken = `session-${++sessionSequence}`;
  return {
    observe(read) {
      return Object.freeze({ read, sessionToken });
    },
    targetAction(target, run) {
      return Object.freeze({ run, sessionToken, target });
    },
  };
}

export function createArtifactAction(session, target, result) {
  return session.targetAction(target, async () => {
    getState().trace.push("artifact");
    return result;
  });
}

export function resetHarness() {
  globalThis[harnessStateKey] = createProtocolState();
}

export function getHarnessState() {
  return getState();
}

export function setCleanupFailure() {
  getState().cleanupFailure = true;
}

export function setActivationError(message) {
  getState().activationError = message;
}

export function setMalformedActivation() {
  getState().malformedActivation = true;
}
