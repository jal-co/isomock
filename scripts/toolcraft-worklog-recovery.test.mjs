import assert from "node:assert/strict";
import test from "node:test";
import { createToolcraftPerformanceRequestAuthority } from "./toolcraft-performance-request-authority.mjs";
import { parseToolcraftDecisionTrail } from "./toolcraft-worklog-decision-trail.mjs";
import { executeToolcraftDeliveryLifecycleCore } from "./toolcraft-delivery-lifecycle.mjs";

const ordinary = (heading, extra = "") =>
  `### ${heading}\n- Request: Rename the visible label.\n${extra}\n- Verification: Focused label test passed.\n`;
const performance = `### Delivery 1 — Previous complaint
- Request: The canvas lags while dragging.
- Performance intent: performance-iteration
- Performance request evidence: "The canvas lags while dragging."
- Performance paths: ["performance-path:%5B%22interactive-discrete%22%2C%22control-change%22%2C%5B%22composite%22%5D%2C%5B%5D%2C%5B%5D%2C%5B%22main%22%5D%2C%5B%5D%5D"]
- Verification: Targeted checks passed.
`;

test("newest-first history does not revive an older complaint", () => {
  const source = `## Decision Trail\n${ordinary("Delivery 2 — Copy")}\n${performance}`;
  assert.equal(createToolcraftPerformanceRequestAuthority(source), null);
});

test("misplaced newer entries are diagnosed instead of silently ignored", () => {
  const source = `${ordinary("Delivery 3 — New")}\n## Decision Trail\n${performance}`;
  assert.match(
    parseToolcraftDecisionTrail(source).errors.join("\n"),
    /outside.*Decision Trail/iu,
  );
  assert.throws(
    () => createToolcraftPerformanceRequestAuthority(source),
    /outside.*Decision Trail/iu,
  );
});

test("ambiguous repeated numbering requires explicit change identity", () => {
  const source = `## Decision Trail\n${ordinary("Delivery 2 — Copy")}\n${ordinary("Delivery 2 — Camera")}`;
  assert.throws(
    () => createToolcraftPerformanceRequestAuthority(source),
    /ambiguous|duplicate.*number/iu,
  );
});

test("active change identity selects independent of display order", () => {
  const source = `Active change: copy-change\n## Decision Trail\n${ordinary("Copy", "- Change ID: copy-change")}\n${performance.replace("Previous complaint", "Previous complaint\n- Change ID: old-change")}`;
  assert.equal(createToolcraftPerformanceRequestAuthority(source), null);
  assert.throws(
    () =>
      createToolcraftPerformanceRequestAuthority(
        source.replace(
          "Active change: copy-change",
          "Active change: missing-change",
        ),
      ),
    /Active change/iu,
  );
});

test("proven product accepts truthful focused narrative without collecting inventory", async () => {
  let collected = false;
  const result = await executeToolcraftDeliveryLifecycleCore({
    projectDir: "/unused",
    dependencies: {
      readDeliveryAnchor: async () => ({
        missing: false,
        anchor: {
          lifecycle: { consumedPerformanceRequestAuthorityHashes: [] },
        },
      }),
      readPerformanceAuthority: async () =>
        createToolcraftPerformanceRequestAuthority(
          `## Decision Trail\n${ordinary("Delivery 1 — Copy")}`,
        ),
      collectInventory: async () => {
        collected = true;
        throw new Error("unexpected inventory");
      },
    },
  });
  assert.equal(collected, false);
  assert.equal(result.status, "focused-development-only");
});

test("recorded commands do not grant performance authority", () => {
  const source = `## Decision Trail\n${ordinary("Delivery 1 — Copy").replace("Focused label test passed.", "pnpm verify:perf was not run; pnpm test:feature -- label passed.")}`;
  assert.equal(createToolcraftPerformanceRequestAuthority(source), null);
  assert.throws(
    () =>
      createToolcraftPerformanceRequestAuthority(
        source.replace(
          "- Verification:",
          "- Performance paths: []\n- Verification:",
        ),
      ),
    /performance.*authority/iu,
  );
});
