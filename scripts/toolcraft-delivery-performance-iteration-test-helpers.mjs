import { writeFileSync } from "node:fs";
import path from "node:path";

import {
  performanceTestName,
} from "./run-delivery-verification-test-helpers.mjs";
import { writePerformanceIterationWorklog } from "./run-browser-performance-test-helpers.mjs";

export function updateRenderer(rootDir, version) {
  writeFileSync(
    path.join(rootDir, "src", "app", "renderer.ts"),
    `export const renderer = ${version};\n`,
  );
  writePerformanceIterationWorklog(
    rootDir,
    String(version),
    performanceTestName,
  );
}
