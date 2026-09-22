import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import postcss from "postcss";

import { evaluateGeneratedCodeHealth } from "./check-toolcraft-code-health.mjs";
import {
  createToolcraftCssSourceRecord,
} from "./toolcraft-css-source-evidence.mjs";
import { createToolcraftLocalDependencyGraph } from "./toolcraft-local-dependency-graph.mjs";
import { collectToolcraftSourceInventory } from "./toolcraft-source-inventory.mjs";

async function createFixture(files) {
  const rootDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "toolcraft-css-source-evidence-"),
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

test("generated code health parses CSS once and reuses boundary evidence", async (context) => {
  const fixture = await createFixture({
    "src/styles/unsafe.module.css": "button { color: red; }\n",
  });
  context.after(() => fs.rm(fixture.rootDir, { force: true, recursive: true }));
  const originalParse = postcss.parse;
  const originalReadFile = fs.readFile;
  const cssPath = path.join(fixture.rootDir, "src/styles/unsafe.module.css");
  let parseCount = 0;
  let readCount = 0;
  postcss.parse = (...args) => {
    parseCount += 1;
    return originalParse(...args);
  };
  fs.readFile = (filePath, ...args) => {
    if (filePath === cssPath) readCount += 1;
    return originalReadFile(filePath, ...args);
  };
  context.after(() => {
    postcss.parse = originalParse;
    fs.readFile = originalReadFile;
  });

  const result = await evaluateGeneratedCodeHealth(fixture.rootDir);
  assert.equal(parseCount, 1);
  assert.equal(readCount, 1);
  assert.deepEqual(
    result.productBoundary.violations.map(({ kind }) => kind),
    ["product-global-css"],
  );
});

test("limits CSS edges to quoted local URLs in modules and exposes immutable facts", async (context) => {
  const fixture = await createFixture({
    "src/assets/local.png": "local",
    "src/assets/plain.png": "plain",
    "src/assets/unquoted.png": "unquoted",
    "src/styles/base.css":
      '.base { background: url("../assets/plain.png"); }\n',
    "src/styles/output.module.css": `
      @import url("./base.css");
      .output {
        background:
          url(  " ../assets/local.png "  ),
          url(../assets/unquoted.png),
          url("data:image/png;base64,AAAA"),
          url("http://example.com/insecure.png"),
          url("https://example.com/remote.png"),
          url("ftp:asset.png"),
          url("blob:fixture"),
          url("mailto:person@example.com"),
          url("file:asset.png"),
          url("custom+scheme:asset.png"),
          url("h\\74 tp://example.com/escaped.png"),
          url("#paint");
      }
      button { color: red; }
    `,
  });
  context.after(() => fs.rm(fixture.rootDir, { force: true, recursive: true }));

  const graph = await createToolcraftLocalDependencyGraph({
    entries: [
      ...fixture.inventory.entries,
      {
        absolutePath: path.join(
          fixture.rootDir,
          "src/styles/ftp:asset.png",
        ),
        owner: "product",
        repoPath: "src/styles/ftp:asset.png",
        role: "production",
      },
    ],
    rootDir: fixture.rootDir,
  });
  assert.deepEqual(graph.forward.get("src/styles/output.module.css"), [
    "src/assets/local.png",
    "src/styles/base.css",
  ]);
  assert.deepEqual(graph.forward.get("src/styles/base.css"), []);
  assert.deepEqual(
    graph.moduleImports
      .filter(({ importerRepoPath }) =>
        importerRepoPath === "src/styles/output.module.css")
      .map(({ category, specifier }) => ({ category, specifier })),
    [
      { category: "css-url", specifier: "./base.css" },
      { category: "css-url", specifier: "../assets/local.png" },
    ],
  );
  const sourceRecord = graph.sourceRecords.get("src/styles/output.module.css");
  assert.deepEqual(
    sourceRecord.cssEvidence.urlFacts.map(
      ({ local, quoted, rawValue, value }) => ({
        local,
        quoted,
        rawValue,
        value,
      }),
    ),
    [
      {
        local: true,
        quoted: true,
        rawValue: '"./base.css"',
        value: "./base.css",
      },
      {
        local: true,
        quoted: true,
        rawValue: '" ../assets/local.png "',
        value: "../assets/local.png",
      },
      {
        local: true,
        quoted: false,
        rawValue: "../assets/unquoted.png",
        value: "../assets/unquoted.png",
      },
      {
        local: false,
        quoted: true,
        rawValue: '"data:image/png;base64,AAAA"',
        value: "data:image/png;base64,AAAA",
      },
      {
        local: false,
        quoted: true,
        rawValue: '"http://example.com/insecure.png"',
        value: "http://example.com/insecure.png",
      },
      {
        local: false,
        quoted: true,
        rawValue: '"https://example.com/remote.png"',
        value: "https://example.com/remote.png",
      },
      {
        local: false,
        quoted: true,
        rawValue: '"ftp:asset.png"',
        value: "ftp:asset.png",
      },
      {
        local: false,
        quoted: true,
        rawValue: '"blob:fixture"',
        value: "blob:fixture",
      },
      {
        local: false,
        quoted: true,
        rawValue: '"mailto:person@example.com"',
        value: "mailto:person@example.com",
      },
      {
        local: false,
        quoted: true,
        rawValue: '"file:asset.png"',
        value: "file:asset.png",
      },
      {
        local: false,
        quoted: true,
        rawValue: '"custom+scheme:asset.png"',
        value: "custom+scheme:asset.png",
      },
      {
        local: false,
        quoted: true,
        rawValue: String.raw`"h\74 tp://example.com/escaped.png"`,
        value: "http://example.com/escaped.png",
      },
      {
        local: false,
        quoted: true,
        rawValue: '"#paint"',
        value: "#paint",
      },
    ],
  );
  assert.deepEqual(sourceRecord.cssEvidence.urlFacts[1], {
    column: 17,
    line: 5,
    local: true,
    quoted: true,
    rawValue: '" ../assets/local.png "',
    value: "../assets/local.png",
  });
  assert.equal(
    sourceRecord.cssEvidence.urlFacts.every(
      ({ column, line }) => column > 0 && line > 0,
    ),
    true,
  );
  const plainRecord = graph.sourceRecords.get("src/styles/base.css");
  assert.deepEqual(
    plainRecord.cssEvidence.urlFacts.map(
      ({ local, quoted, value }) => ({ local, quoted, value }),
    ),
    [{ local: true, quoted: true, value: "../assets/plain.png" }],
  );
  assert.equal(sourceRecord.cssEvidence.violations[0].kind, "product-global-css");
  assert.equal(Object.isFrozen(sourceRecord.cssEvidence), true);
  assert.equal(Object.isFrozen(sourceRecord.cssEvidence.urlFacts), true);
  assert.equal(Object.isFrozen(sourceRecord.cssEvidence.urlFacts[0]), true);
  assert.equal(Object.isFrozen(sourceRecord.cssEvidence.reasons), true);
  assert.equal(Object.isFrozen(sourceRecord.cssEvidence.violations), true);
  assert.equal(Object.isFrozen(sourceRecord.cssEvidence.violations[0]), true);
  assert.throws(() => sourceRecord.cssEvidence.reasons.push("forged"));
  assert.throws(() => {
    sourceRecord.cssEvidence.urlFacts[0].local = false;
  });
  assert.throws(() => {
    sourceRecord.cssEvidence.violations[0].kind = "forged";
  });
  assert.throws(() => sourceRecord.imports.push({}));
});

test("preserves canonical style-boundary facts and violation rendering", () => {
  const sourceRecord = createToolcraftCssSourceRecord({
    rawSource: `
      @import "theme.css";
      :global(.x) { color: red; }
      body { margin: 0; }
      [data-toolcraft-canvas] { display: none; }
      .local + button { color: red; }
    `,
    repoPath: "src/styles/unsafe.module.css",
  });
  assert.deepEqual(sourceRecord.cssEvidence.reasons, [
    "CSS @import can pull unscoped styles into the product bundle",
    'selector ":global(.x)" uses :global',
    'selector ":global(.x)" is not anchored to a local class',
    'selector "body" targets a document root',
    'selector "body" is not anchored to a local class',
    'selector "[data-toolcraft-canvas]" targets a Toolcraft host attribute',
    'selector "[data-toolcraft-canvas]" is not anchored to a local class',
    'selector ".local + button" escapes through sibling combinator +',
  ]);
  assert.deepEqual(
    sourceRecord.cssEvidence.violations.map(
      ({ column, kind, line, repoPath }) => ({ column, kind, line, repoPath }),
    ),
    [{
      column: 1,
      kind: "product-global-css",
      line: 1,
      repoPath: "src/styles/unsafe.module.css",
    }],
  );
  assert.match(
    sourceRecord.cssEvidence.violations[0].message,
    /CSS @import.*:global.*document root.*Toolcraft host attribute.*sibling combinator \+/u,
  );
});

test("keeps CSS parsing and boundary consumption on the canonical evidence path", async () => {
  const scriptsDir = import.meta.dirname;
  const boundarySource = await fs.readFile(
    path.join(scriptsDir, "toolcraft-product-boundary.mjs"),
    "utf8",
  );
  assert.doesNotMatch(
    boundarySource,
    /inspectToolcraftProductCss|postcss|selectorParser/u,
  );
  assert.match(boundarySource, /sourceRecord\.cssEvidence\.violations/u);

  const graphSource = await fs.readFile(
    path.join(scriptsDir, "toolcraft-local-dependency-graph.mjs"),
    "utf8",
  );
  assert.match(
    graphSource,
    /createToolcraftDependencySourceRecord/u,
  );
  const dependencySource = await fs.readFile(
    path.join(scriptsDir, "toolcraft-dependency-source-record.mjs"),
    "utf8",
  );
  assert.equal(
    dependencySource.match(/createToolcraftCssSourceRecord\(\{/gu)?.length,
    1,
  );
  assert.doesNotMatch(
    `${graphSource}\n${dependencySource}`,
    /quotedUrlPattern|urlPattern/u,
  );

  const evidenceSource = await fs.readFile(
    path.join(scriptsDir, "toolcraft-css-source-evidence.mjs"),
    "utf8",
  );
  assert.equal(evidenceSource.match(/postcss\.parse\(/gu)?.length, 1);

  const codeHealthSource = await fs.readFile(
    path.join(scriptsDir, "toolcraft-code-health-core.mjs"),
    "utf8",
  );
  assert.doesNotMatch(codeHealthSource, /node:fs\/promises|readFile\(/u);
  assert.match(codeHealthSource, /sourceRecords\.get\(repoPath\)\?\.rawSource/u);
});
