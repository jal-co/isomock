// Canonical policy for standalone apps and CLI copying. No filesystem or
// product imports: classification never executes user template code.
export const disposableDevelopmentRoots = Object.freeze([
  ".toolcraft/browser-artifacts", ".toolcraft/scratch",
]);
export const developmentFileGraceMs = 24 * 60 * 60 * 1000;

const excludedNames = new Set([
  ".git", ".DS_Store", "Thumbs.db", "node_modules", ".toolcraft", ".vercel",
  ".turbo", ".next", ".vite", ".output", "skills-lock.json", "toolcraft-source.json",
]);
const outputRoots = new Set([
  "dist", "dist-ssr", "build", "out", "coverage", "playwright-report", "test-results", "logs",
]);
const agentDirectories = new Set([".agents", ".claude", ".codex", ".cursor", ".opencode", ".github"]);

export function isDevelopmentFileExcluded(relativePath) {
  const parts = relativePath.replaceAll("\\", "/").split("/");
  return outputRoots.has(parts[0]) || parts.some((part, index) =>
    excludedNames.has(part) || part.startsWith(".playwright-") ||
    part.endsWith(".log") || part.endsWith(".tsbuildinfo") ||
    (part !== ".env.example" && (part === ".env" || part.startsWith(".env."))) ||
    (part === "skills" && agentDirectories.has(parts[index - 1])));
}

export function getMisplacedDevelopmentFileReason(relativePath) {
  const normalized = relativePath.replaceAll("\\", "/");
  if (isDevelopmentFileExcluded(normalized)) return null;
  // Authored evidence and fixtures have durable owners. Ambiguous diagnostic
  // names elsewhere are reported, never silently omitted or deleted.
  if (/^(?:docs\/assets\/|(?:e2e|tests?)\/fixtures\/|src\/app\/reference-studies\/)/u.test(normalized)) return null;
  const name = normalized.split("/").at(-1);
  const diagnostic = /^(?:screenshot|screen[-_ ]?shot|shot|capture|debug|trace)(?:[._ -]|$)/iu.test(name) &&
    /\.(?:png|jpe?g|webp|gif|mp4|webm|zip)$/iu.test(name);
  if (diagnostic || /\.(?:tmp|bak)$/iu.test(name)) {
    return "Move working diagnostics to .toolcraft/browser-artifacts/ and temporary inputs to .toolcraft/scratch/. Keep intentional documentation images in docs/assets/ and test inputs in e2e/fixtures/.";
  }
  return null;
}
