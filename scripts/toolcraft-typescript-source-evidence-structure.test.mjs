import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

test("keeps TypeScript parsing and boundary facts on one canonical path", async () => {
  const scriptsDir = import.meta.dirname;
  const dependencyResolutionModule = await import(
    "./toolcraft-product-dependency-resolution.mjs"
  );
  assert.equal(
    "getToolcraftParsedSourceFile" in dependencyResolutionModule,
    false,
  );
  await assert.rejects(
    fs.access(path.join(scriptsDir, "toolcraft-product-boundary-ast-utils.mjs")),
    { code: "ENOENT" },
  );

  const scriptNames = await fs.readdir(scriptsDir);
  const checkerOwners = [];
  for (const scriptName of scriptNames) {
    if (!scriptName.endsWith(".mjs") || scriptName.endsWith(".test.mjs")) {
      continue;
    }
    const source = await fs.readFile(path.join(scriptsDir, scriptName), "utf8");
    if (/\.createProgram\(/u.test(source)) {
      checkerOwners.push(scriptName);
    }
    if (scriptName === "toolcraft-typescript-source-evidence.mjs") {
      assert.equal(source.match(/ts\.createSourceFile\(/gu)?.length, 1);
      assert.match(source, /ts\.getJSDocCommentsAndTags\(/u);
      assert.match(source, /node\.jsDoc \?\? \[\]/u);
      continue;
    }
    assert.doesNotMatch(
      source,
      /collectToolcraftModuleSpecifiers|(?:ts\.)?createSourceFile\(/u,
    );
  }
  assert.deepEqual(checkerOwners, [
    "toolcraft-typescript-analysis.mjs",
  ]);

  const productBoundarySource = await fs.readFile(
    path.join(scriptsDir, "toolcraft-product-boundary-ast.mjs"),
    "utf8",
  );
  const controlBoundarySource = await fs.readFile(
    path.join(scriptsDir, "toolcraft-product-control-boundary.mjs"),
    "utf8",
  );
  const modulePolicySource = await fs.readFile(
    path.join(scriptsDir, "toolcraft-product-boundary-module-policy.mjs"),
    "utf8",
  );

  assert.match(productBoundarySource, /createToolcraftProductControlInspector/u);
  assert.match(
    modulePolicySource,
    /isToolcraftPrivateControlImplementationModule/u,
  );
  assert.doesNotMatch(controlBoundarySource, /(?:ts\.)?createSourceFile\(/u);
});
