import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createToolcraftCssSourceRecord } from "./toolcraft-css-source-evidence.mjs";
import { createToolcraftLocalDependencyGraph } from "./toolcraft-local-dependency-graph.mjs";
import { collectToolcraftSourceInventory } from "./toolcraft-source-inventory.mjs";

async function createFixture(files) {
  const rootDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "toolcraft-css-url-graph-evidence-"),
  );
  for (const [repoPath, source] of Object.entries(files)) {
    const filePath = path.join(rootDir, repoPath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, source);
  }
  const inventory = await collectToolcraftSourceInventory({
    includeResourceFiles: true,
    rootDir,
    sourceRoots: ["src"],
  });
  return { inventory, rootDir };
}

test("maps lexical CSS URL tokens to fail-closed graph evidence", async (context) => {
  const fixture = await createFixture({
    'src/assets/a" )b.png': "double",
    "src/assets/a' )b.png": "single",
    "src/assets/a)b.png": "unquoted",
    "src/assets/escaped-name.png": "escaped-name",
    "src/assets/fake.png": "fake",
    "src/assets/real.png": "real",
    "src/styles/escaped.module.css": String.raw`
      .escaped {
        background:
          url(  "../assets/a\" )b.png"  ),
          url( '../assets/a\' )b.png' ),
          url(../assets/a\)b.png),
          url("h\74 tp://example.com/remote.png");
      }
    `,
    "src/styles/lexical.module.css": String.raw`
      .lexical {
        content: "url(../assets/fake.png)";
        --comment: /* url("../assets/fake.png") */ none;
        --hash: #url("../assets/fake.png");
        --at: @url("../assets/fake.png");
        background:
          myurl("../assets/fake.png"),
          --url("../assets/fake.png"),
          _url("../assets/fake.png"),
          x-url("../assets/fake.png"),
          u\72l("../assets/escaped-name.png"),
          URL("../assets/real.png");
      }
    `,
    "src/styles/malformed.module.css": String.raw`
      .malformed {
        background:
          url("../assets/a\" )b.png"),
          url("../assets/a.png" junk);
      }
    `,
  });
  context.after(() => fs.rm(fixture.rootDir, { force: true, recursive: true }));

  const graph = await createToolcraftLocalDependencyGraph({
    entries: fixture.inventory.entries,
    rootDir: fixture.rootDir,
  });
  assert.deepEqual(graph.forward.get("src/styles/escaped.module.css"), [
    'src/assets/a" )b.png',
    "src/assets/a' )b.png",
  ]);
  assert.deepEqual(graph.forward.get("src/styles/lexical.module.css"), [
    "src/assets/escaped-name.png",
    "src/assets/real.png",
  ]);
  assert.deepEqual(graph.forward.get("src/styles/malformed.module.css"), []);

  const escapedRecord = graph.sourceRecords.get(
    "src/styles/escaped.module.css",
  );
  assert.deepEqual(escapedRecord.cssEvidence.urlFacts, [
    {
      column: 17,
      line: 4,
      local: true,
      quoted: true,
      rawValue: String.raw`"../assets/a\" )b.png"`,
      value: '../assets/a" )b.png',
    },
    {
      column: 16,
      line: 5,
      local: true,
      quoted: true,
      rawValue: String.raw`'../assets/a\' )b.png'`,
      value: "../assets/a' )b.png",
    },
    {
      column: 15,
      line: 6,
      local: true,
      quoted: false,
      rawValue: String.raw`../assets/a\)b.png`,
      value: "../assets/a)b.png",
    },
    {
      column: 15,
      line: 7,
      local: false,
      quoted: true,
      rawValue: String.raw`"h\74 tp://example.com/remote.png"`,
      value: "http://example.com/remote.png",
    },
  ]);
  const lexicalRecord = graph.sourceRecords.get(
    "src/styles/lexical.module.css",
  );
  assert.deepEqual(lexicalRecord.cssEvidence.urlFacts, [
    {
      column: 17,
      line: 12,
      local: true,
      quoted: true,
      rawValue: '"../assets/escaped-name.png"',
      value: "../assets/escaped-name.png",
    },
    {
      column: 15,
      line: 13,
      local: true,
      quoted: true,
      rawValue: '"../assets/real.png"',
      value: "../assets/real.png",
    },
  ]);
  assert.deepEqual(
    graph.sourceRecords.get("src/styles/malformed.module.css").cssEvidence
      .urlFacts,
    [],
  );

  const unclosedRecord = createToolcraftCssSourceRecord({
    rawSource: '.unclosed { background: url("../assets/a.png); }\n',
    repoPath: "src/styles/unclosed.module.css",
  });
  assert.deepEqual(unclosedRecord.cssEvidence.urlFacts, []);
  assert.match(
    unclosedRecord.cssEvidence.reasons.at(-1),
    /CSS could not be parsed/u,
  );
});
