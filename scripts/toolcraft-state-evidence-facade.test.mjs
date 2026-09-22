import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import ts from "typescript";

const helperPath = path.resolve(
  import.meta.dirname,
  "../e2e/browser-state-evidence-helpers.ts",
);

async function loadStateEvidenceFacade(context) {
  const outputDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "toolcraft-state-evidence-"),
  );
  context.after(() => fs.rm(outputDir, { force: true, recursive: true }));
  const outputPath = path.join(outputDir, "browser-state-evidence-helpers.mjs");
  const source = (await fs.readFile(helperPath, "utf8"))
    .replaceAll('"@playwright/test"', '"./playwright.mjs"')
    .replaceAll('"./browser-runtime-evidence"', '"./evidence.mjs"')
    .replaceAll('"./browser-proof-session"', '"./proof-session.mjs"')
    .replaceAll(
      '"./browser-acceptance-transition-helpers"',
      '"./transition.mjs"',
    )
    .replaceAll('"./stable-outcome-helpers"', '"./stable-outcome.mjs"');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: helperPath,
  });

  await Promise.all([
    fs.writeFile(outputPath, outputText),
    fs.writeFile(
      path.join(outputDir, "playwright.mjs"),
      `
        import assert from "node:assert/strict";
        export function expect(actual, message = "Expectation failed") {
          return {
            not: {
              toBe(expected) {
                assert.notEqual(actual, expected, message);
              },
              toEqual(expected) {
                assert.notDeepEqual(actual, expected, message);
              },
            },
            toBe(expected) {
              assert.equal(actual, expected, message);
            },
            toBeGreaterThan(expected) {
              assert.ok(actual > expected, message);
            },
            toEqual(expected) {
              assert.deepEqual(actual, expected, message);
            },
          };
        }
      `,
    ),
    fs.writeFile(
      path.join(outputDir, "evidence.mjs"),
      `
        export async function attachToolcraftBrowserRuntimeEvidence(evidence) {
          globalThis.__toolcraftStateEvidenceTrace.push("evidence");
          globalThis.__toolcraftStateEvidenceAttachments.push(evidence);
        }
      `,
    ),
    fs.writeFile(
      path.join(outputDir, "proof-session.mjs"),
      `
        export function assertToolcraftBrowserProofSession(
          observation,
          mutate,
          reload,
        ) {
          if (
            !observation.session ||
            observation.session !== mutate.session ||
            observation.session !== reload.session
          ) {
            throw new Error("wrong proof session");
          }
        }
        export function getToolcraftBrowserActionTarget(action) {
          return action.target;
        }
        export async function readToolcraftBrowserObservation(observation) {
          return observation.read();
        }
        export async function runToolcraftBrowserAction(action) {
          globalThis.__toolcraftStateEvidenceTrace.push("action:" + action.kind);
          await action.run();
        }
      `,
    ),
    fs.writeFile(
      path.join(outputDir, "transition.mjs"),
      `
        export function createToolcraftSemanticTransitionOptions(message, options) {
          return { message, ...options };
        }
        export async function expectToolcraftExpectedOutcomeAfterAction() {
          throw new Error("unexpected generic transition");
        }
      `,
    ),
    fs.writeFile(
      path.join(outputDir, "stable-outcome.mjs"),
      `
        import assert from "node:assert/strict";
        export async function expectToolcraftPersistentExpectedOutcome(
          observe,
          expected,
        ) {
          const actual = structuredClone(await observe());
          globalThis.__toolcraftStateEvidenceAssertionCount += 1;
          globalThis.__toolcraftStateEvidenceTrace.push(
            "assert:state:" + globalThis.__toolcraftStateEvidenceAssertionCount,
          );
          assert.deepEqual(actual, expected);
          return actual;
        }
        export function snapshotToolcraftOutcome(value) {
          return structuredClone(value);
        }
      `,
    ),
  ]);

  return import(`${pathToFileURL(outputPath).href}?test=${Date.now()}`);
}

function createPersistenceScenario({ restoredState = "persisted" } = {}) {
  const session = {};
  let state = "initial";
  const observation = {
    read: async () => ({ state }),
    session,
  };
  const mutate = {
    kind: "mutate",
    run: async () => {
      state = "persisted";
    },
    session,
    target: "workspace.persistence",
  };
  const reload = {
    kind: "reload",
    run: async () => {
      state = restoredState;
    },
    session,
  };
  return { mutate, observation, reload };
}

function resetHarness() {
  globalThis.__toolcraftStateEvidenceAssertionCount = 0;
  globalThis.__toolcraftStateEvidenceAttachments = [];
  globalThis.__toolcraftStateEvidenceTrace = [];
}

test("persistence recipe asserts restored output before attaching evidence", async (context) => {
  const facade = await loadStateEvidenceFacade(context);
  resetHarness();
  const scenario = createPersistenceScenario();

  await facade.expectToolcraftPersistenceState(
    scenario.observation,
    scenario.mutate,
    scenario.reload,
    { state: "persisted" },
    {
      assertRestoredOutput: async () => {
        globalThis.__toolcraftStateEvidenceTrace.push("assert:output");
      },
      requirementId: "workspace.persistence",
    },
  );

  assert.deepEqual(globalThis.__toolcraftStateEvidenceTrace, [
    "action:mutate",
    "assert:state:1",
    "action:reload",
    "assert:state:2",
    "assert:output",
    "evidence",
  ]);
  assert.deepEqual(globalThis.__toolcraftStateEvidenceAttachments, [
    {
      evidenceType: "persistence-state",
      requirementId: "workspace.persistence",
      target: "workspace.persistence",
    },
  ]);
});

test("persistence recipe emits no evidence when restored output assertion fails", async (context) => {
  const facade = await loadStateEvidenceFacade(context);
  resetHarness();
  const scenario = createPersistenceScenario();

  await assert.rejects(
    facade.expectToolcraftPersistenceState(
      scenario.observation,
      scenario.mutate,
      scenario.reload,
      { state: "persisted" },
      {
        assertRestoredOutput: async () => {
          globalThis.__toolcraftStateEvidenceTrace.push("assert:output");
          throw new Error("restored pixels differ");
        },
        requirementId: "workspace.persistence",
      },
    ),
    /restored pixels differ/u,
  );
  assert.deepEqual(globalThis.__toolcraftStateEvidenceAttachments, []);
  assert.equal(globalThis.__toolcraftStateEvidenceTrace.at(-1), "assert:output");
});

test("persistence recipe keeps existing state-only callers compatible and emits no evidence on state failure", async (context) => {
  const facade = await loadStateEvidenceFacade(context);
  resetHarness();
  const valid = createPersistenceScenario();

  await facade.expectToolcraftPersistenceState(
    valid.observation,
    valid.mutate,
    valid.reload,
    { state: "persisted" },
    { requirementId: "workspace.persistence" },
  );
  assert.equal(globalThis.__toolcraftStateEvidenceTrace.at(-1), "evidence");

  resetHarness();
  const invalid = createPersistenceScenario({ restoredState: "lost" });
  await assert.rejects(
    facade.expectToolcraftPersistenceState(
      invalid.observation,
      invalid.mutate,
      invalid.reload,
      { state: "persisted" },
      { requirementId: "workspace.persistence" },
    ),
  );
  assert.deepEqual(globalThis.__toolcraftStateEvidenceAttachments, []);
});
