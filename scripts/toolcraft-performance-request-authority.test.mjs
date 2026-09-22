import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { createWorklog } from "./toolcraft-performance-request-authority-test-worklog.mjs";

import {
  createToolcraftPerformanceRequestAuthority,
} from "./toolcraft-performance-request-authority.mjs";
import {
  TOOLCRAFT_DELIVERY_VERIFICATION_COMMAND,
  TOOLCRAFT_DELIVERY_VERIFICATION_NARRATIVE,
} from "./toolcraft-performance-authority-policy.mjs";

import { firstPathId, secondPathId } from "./toolcraft-performance-request-authority-test-worklog.mjs";

function encodePathSignature(signature) {
  assert.equal(signature.length, 7);
  return `performance-path:${encodeURIComponent(JSON.stringify(signature))}`;
}


test("returns only frozen domain-shaped authority for the latest performance iteration", () => {
  const source = createWorklog();
  const authority = createToolcraftPerformanceRequestAuthority(source);
  const canonical = {
    heading: "Delivery 1 - Product build",
    pathIds: [secondPathId, firstPathId],
    request: "The canvas lags while dragging.",
    requestEvidence: "The canvas lags while dragging.",
  };
  const expectedSha256 = createHash("sha256")
    .update(JSON.stringify(canonical))
    .digest("hex");

  assert.deepEqual(authority, {
    hash: expectedSha256,
    ...canonical,
  });
  assert.equal(Object.isFrozen(authority), true);
  assert.equal(Object.isFrozen(authority.pathIds), true);
  assert.deepEqual(Object.keys(authority), [
    "hash",
    "heading",
    "pathIds",
    "request",
    "requestEvidence",
  ]);
});

test("is stable for the same heading, request evidence, and canonical paths", () => {
  const first = createToolcraftPerformanceRequestAuthority(createWorklog());
  const second = createToolcraftPerformanceRequestAuthority(createWorklog());

  assert.equal(first.hash, second.hash);
});

test("treats the same complaint and paths under a new heading as new authority", () => {
  const first = createToolcraftPerformanceRequestAuthority(createWorklog());
  const second = createToolcraftPerformanceRequestAuthority(
    createWorklog({ heading: "Delivery 2 - Repeated performance complaint" }),
  );

  assert.notEqual(first.hash, second.hash);
});

test("returns null when the latest Decision Trail iteration is ordinary", () => {
  const source = createWorklog().replace(
    "\n## Verification",
    `
### Delivery 2 - Copy update
- Request: Rename the title.
- Performance intent: ordinary-product-work
- Verification: ${TOOLCRAFT_DELIVERY_VERIFICATION_NARRATIVE}

## Verification
`,
  );

  assert.equal(createToolcraftPerformanceRequestAuthority(source), null);
});

for (const [caseName, source, expected] of [
  [
    "missing paths",
    createWorklog({ paths: null }),
    /exactly one "Performance paths:"/iu,
  ],
  [
    "duplicate path fields",
    createWorklog({
      extraFields: [`- Performance paths: ${JSON.stringify([firstPathId])}`],
    }),
    /exactly one "Performance paths:"/iu,
  ],
  [
    "non-JSON paths",
    createWorklog({ paths: firstPathId }),
    /Performance paths must be a JSON array/iu,
  ],
  [
    "empty paths",
    createWorklog({ paths: "[]" }),
    /non-empty unique JSON array/iu,
  ],
  [
    "duplicate paths",
    createWorklog({ paths: JSON.stringify([firstPathId, firstPathId]) }),
    /non-empty unique JSON array/iu,
  ],
  [
    "malformed canonical path",
    createWorklog({ paths: JSON.stringify(["performance-path:unknown"]) }),
    /canonical path IDs/iu,
  ],
  [
    "missing request evidence",
    createWorklog({ requestEvidence: null }),
    /exactly one "Performance request evidence:"/iu,
  ],
  [
    "duplicate request evidence",
    createWorklog({
      extraFields: [
        '- Performance request evidence: "The canvas lags while dragging."',
      ],
    }),
    /exactly one "Performance request evidence:"/iu,
  ],
  [
    "unquoted request evidence",
    createWorklog({
      requestEvidence: null,
      extraFields: [
        "- Performance request evidence: The canvas lags while dragging.",
      ],
    }),
    /must be one exact quoted raw Request substring/iu,
  ],
  [
    "request evidence absent from raw request",
    createWorklog({ requestEvidence: "The export freezes." }),
    /must be one exact quoted raw Request substring/iu,
  ],
  [
    "trivial single-character request evidence",
    createWorklog({ request: "x", requestEvidence: "x" }),
    /nontrivial|too short/iu,
  ],
  [
    "normalized rather than exact whitespace evidence",
    createWorklog({
      request: "The canvas  lags while dragging.",
      requestEvidence: "The canvas lags while dragging.",
    }),
    /exact quoted raw Request substring|not in request/iu,
  ],
  [
    "normalized rather than exact Unicode evidence",
    createWorklog({
      request: "The café preview is unresponsive.",
      requestEvidence: "The cafe\u0301 preview is unresponsive.",
    }),
    /exact quoted raw Request substring|not in request/iu,
  ],
]) {
  test(`rejects ${caseName}`, () => {
    assert.throws(
      () => createToolcraftPerformanceRequestAuthority(source),
      expected,
    );
  });
}

test("accepts nontrivial request evidence with exact whitespace and Unicode code units", () => {
  const request = "The café  preview is unresponsive.";

  assert.equal(
    createToolcraftPerformanceRequestAuthority(
      createWorklog({ request, requestEvidence: request }),
    )?.requestEvidence,
    request,
  );
});

for (const [caseName, signature] of [
  [
    "an unknown profile",
    ["unknown-profile", "control-change", ["composite"], [], [], ["main"], []],
  ],
  [
    "an unknown interaction",
    ["interactive-discrete", "unknown-interaction", ["composite"], [], [], ["main"], []],
  ],
  [
    "a profile that does not match its interaction",
    ["interactive-continuous", "control-change", ["composite"], [], [], ["main"], []],
  ],
  [
    "duplicate invalidated passes",
    [
      "interactive-discrete",
      "control-change",
      ["composite", "composite"],
      [],
      [],
      ["main"],
      [],
    ],
  ],
  [
    "unsorted invalidated passes",
    [
      "interactive-discrete",
      "control-change",
      ["source", "composite"],
      [],
      [],
      ["main"],
      [],
    ],
  ],
  [
    "an unknown execution location",
    [
      "interactive-discrete",
      "control-change",
      ["composite"],
      [],
      [],
      ["satellite"],
      [],
    ],
  ],
  [
    "duplicate workload dimensions",
    [
      "interactive-discrete",
      "control-change",
      ["composite"],
      [],
      [],
      ["main"],
      ["pixel-count", "pixel-count"],
    ],
  ],
]) {
  test(`rejects a canonical path signature with ${caseName}`, () => {
    assert.throws(
      () =>
        createToolcraftPerformanceRequestAuthority(
          createWorklog({
            paths: JSON.stringify([encodePathSignature(signature)]),
          }),
        ),
      /canonical path IDs/iu,
    );
  });
}

test("rejects adversarial encoded JSON path payloads", () => {
  const encodedObject = `performance-path:${encodeURIComponent(
    JSON.stringify({
      0: "interactive-discrete",
      1: "control-change",
      2: ["composite"],
      3: [],
      4: [],
      5: ["main"],
      6: [],
      length: 7,
    }),
  )}`;

  assert.throws(
    () =>
      createToolcraftPerformanceRequestAuthority(
        createWorklog({ paths: JSON.stringify([encodedObject]) }),
      ),
    /canonical path IDs/iu,
  );
});

test("ignores fenced iteration headings and fields", () => {
  const source = createWorklog().replace(
    "\n## Verification",
    `
\`\`\`md
### Forged performance authority
- Request: The export freezes.
- Performance intent: performance-iteration
- Performance request evidence: "The export freezes."
- Performance paths: ${JSON.stringify([firstPathId])}
- Verification: ${TOOLCRAFT_DELIVERY_VERIFICATION_COMMAND}
\`\`\`

## Verification`,
  );

  assert.equal(
    createToolcraftPerformanceRequestAuthority(source)?.requestEvidence,
    "The canvas lags while dragging.",
  );
});

test("rejects duplicate Decision Trail sections", () => {
  assert.throws(
    () =>
      createToolcraftPerformanceRequestAuthority(
        `${createWorklog()}
## Decision Trail

### Delivery 2 - Forged authority
- Request: The export freezes.
- Performance intent: performance-iteration
- Performance request evidence: "The export freezes."
- Performance paths: ${JSON.stringify([firstPathId])}
- Verification: ${TOOLCRAFT_DELIVERY_VERIFICATION_COMMAND}
`,
      ),
    /exactly one Decision Trail section/iu,
  );
});

test("rejects Decision Trail content before its first iteration heading", () => {
  assert.throws(
    () =>
      createToolcraftPerformanceRequestAuthority(
        createWorklog().replace(
          "## Decision Trail\n",
          "## Decision Trail\n\nUnscoped authority prose.\n",
        ),
      ),
    /before its first iteration heading|malformed Decision Trail/iu,
  );
});

test("rejects duplicate Decision Trail iteration headings", () => {
  assert.throws(
    () =>
      createToolcraftPerformanceRequestAuthority(
        createWorklog().replace(
          "\n## Verification",
          `
### Delivery 1 - Product build
- Request: The export freezes.
- Performance intent: performance-iteration
- Performance request evidence: "The export freezes."
- Performance paths: ${JSON.stringify([firstPathId])}
- Verification: ${TOOLCRAFT_DELIVERY_VERIFICATION_COMMAND}

## Verification`,
        ),
      ),
    /duplicate Decision Trail iteration heading/iu,
  );
});

for (const [caseName, source] of [
  [
    "a command-shaped verification",
    createWorklog({
      verification:
        `${TOOLCRAFT_DELIVERY_VERIFICATION_COMMAND} -- --reason=performance-iteration.`,
    }),
  ],
  [
    "an unknown argument",
    createWorklog({
      verification: `${TOOLCRAFT_DELIVERY_VERIFICATION_COMMAND} --foo.`,
    }),
  ],
  [
    "a pipe",
    createWorklog({
      verification:
        `${TOOLCRAFT_DELIVERY_VERIFICATION_COMMAND} | tee proof.log.`,
    }),
  ],
  [
    "a redirect",
    createWorklog({
      verification: `${TOOLCRAFT_DELIVERY_VERIFICATION_COMMAND} > proof.log.`,
    }),
  ],
  [
    "background execution",
    createWorklog({
      verification: `${TOOLCRAFT_DELIVERY_VERIFICATION_COMMAND} &`,
    }),
  ],
  [
    "an environment prefix",
    createWorklog({
      verification: `CI=1 ${TOOLCRAFT_DELIVERY_VERIFICATION_COMMAND}.`,
    }),
  ],
  [
    "mixed package-manager commands",
    createWorklog({
      verification:
        `${TOOLCRAFT_DELIVERY_VERIFICATION_COMMAND.startsWith("npm ") ? "pnpm verify:delivery" : "npm run verify:delivery"} alongside ${TOOLCRAFT_DELIVERY_VERIFICATION_COMMAND}.`,
    }),
  ],
]) {
  test(`recorded ${caseName} does not change domain-shaped authority`, () => {
    assert.deepEqual(createToolcraftPerformanceRequestAuthority(source), createToolcraftPerformanceRequestAuthority(createWorklog()));
  });
}

for (const [caseName, source] of [
  [
    "a tier field",
    createWorklog({ extraFields: ["- Verification tier: 3"] }),
  ],
  [
    "a test-selector field",
    createWorklog({
      extraFields: [
        '- Performance test: "browser perf: control-drag:composite"',
      ],
    }),
  ],
  [
    "a command field",
    createWorklog({
      extraFields: [
        `- Verification command: ${TOOLCRAFT_DELIVERY_VERIFICATION_COMMAND}`,
      ],
    }),
  ],
]) {
  test(`rejects ${caseName} as performance authority`, () => {
    assert.throws(
      () => createToolcraftPerformanceRequestAuthority(source),
      /command, tier, or test-selector.*authority|one bare .*verify:delivery/iu,
    );
  });
}

for (const [caseName, extraFields] of [
  ["request evidence", ['- Performance request evidence: "Rename the title."']],
  ["performance paths", [`- Performance paths: ${JSON.stringify([firstPathId])}`]],
  ["command fields", ["- Verification tier: 2"]],
]) {
  test(`rejects ordinary work carrying ${caseName} authority`, () => {
    assert.throws(
      () =>
        createToolcraftPerformanceRequestAuthority(
          createWorklog({
            extraFields,
            intent: "ordinary-product-work",
            paths: null,
            request: "Rename the title.",
            requestEvidence: null,
          }),
        ),
      /ordinary(?:-product-work)?.*performance (?:request )?authority/iu,
    );
  });
}

test("requires exactly one Performance intent field", () => {
  assert.throws(
    () =>
      createToolcraftPerformanceRequestAuthority(
        createWorklog({
          extraFields: ["- Performance intent: performance-iteration"],
        }),
      ),
    /exactly one "Performance intent:"/iu,
  );
});
