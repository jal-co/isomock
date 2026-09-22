import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { getToolcraftCheckpointBundlePath } from "./toolcraft-checkpoint-paths.mjs";
import { createProtectedRunnerFixture } from "./run-browser-performance-test-helpers.mjs";
import { writePassedCheckpointFixture } from "./toolcraft-verification-receipt-test-helpers.mjs";

export async function createFullPerformanceFixture() {
  const rootDir = createProtectedRunnerFixture();
  const fixtureScriptsDir = path.join(rootDir, "scripts");
  writeFileSync(
    path.join(fixtureScriptsDir, "check-toolcraft-integrity.mjs"),
    `import { appendFileSync } from "node:fs";
import path from "node:path";
appendFileSync(
  path.join(process.cwd(), ".toolcraft", "proof-events.jsonl"),
  \`\${JSON.stringify("integrity")}\\n\`,
);
`,
  );
  writeFileSync(
    path.join(fixtureScriptsDir, "record-proof.mjs"),
    `import { appendFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const [label] = process.argv.slice(2);
appendFileSync(
  path.join(process.cwd(), ".toolcraft", "proof-events.jsonl"),
  \`\${JSON.stringify(label)}\\n\`,
);
if (
  label === "build" &&
  process.env.TOOLCRAFT_FIXTURE_MUTATE_DURING_BUILD === "1"
) {
  writeFileSync(
    path.join(process.cwd(), "src", "app.ts"),
    "export const value = 'mutated-during-build';\\n",
  );
}
`,
  );
  writeFileSync(
    path.join(rootDir, "package.json"),
    `${JSON.stringify({
      name: "toolcraft-full-performance-fixture",
      private: true,
      scripts: {
        "ai:check": "node scripts/record-proof.mjs ai-check",
        build: "node scripts/record-proof.mjs build",
        "docs:check": "node scripts/record-proof.mjs docs-check",
        "test:delivery": "node scripts/record-proof.mjs test-delivery",
      },
    })}\n`,
  );
  await writePassedCheckpointFixture(rootDir, { writeBaseline: false });
  const bundlePath = getToolcraftCheckpointBundlePath(rootDir);
  const bundle = JSON.parse(readFileSync(bundlePath, "utf8"));
  writeFileSync(
    bundlePath,
    `${JSON.stringify({
      ...bundle,
      currentPerformance: null,
      performanceBaseline: null,
    }, null, 2)}\n`,
  );
  return rootDir;
}
