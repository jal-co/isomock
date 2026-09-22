import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "..");
export const workspaceRoot = path.resolve(projectRoot, "..");
const workspaceRuntimeRoot = path.join(
  workspaceRoot,
  "packages/toolcraft-runtime/src",
);
const isWorkspaceLayout =
  projectRoot === path.join(workspaceRoot, "starter") &&
  fs.existsSync(workspaceRuntimeRoot);
export const sourceLayout = isWorkspaceLayout
  ? Object.freeze({
      kind: "workspace",
      projectRoot: workspaceRoot,
      publicRuntimeSpecifier: "@/toolcraft/runtime",
      runtimeSourceRoot: workspaceRuntimeRoot,
    })
  : Object.freeze({
      kind: "standalone",
      projectRoot,
      publicRuntimeSpecifier: "@/toolcraft/runtime",
      runtimeSourceRoot: path.join(projectRoot, "src/toolcraft/runtime"),
    });
