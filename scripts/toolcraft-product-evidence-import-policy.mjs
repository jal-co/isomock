const PRIVATE_EVIDENCE_MESSAGE =
  "Product-owned source must use the protected public evidence facade instead of importing its private implementation module.";

export const toolcraftProductEvidenceModulePolicies = Object.freeze([
  Object.freeze({
    capability: "unavailable-image-resource-evidence",
    privateModuleRepoPath:
      "e2e/browser-infinity-canvas-unavailable-image-evidence.ts",
    publicFacadeRepoPath: "e2e/browser-infinity-canvas-evidence.ts",
  }),
]);

const privateEvidencePolicyByRepoPath = new Map(
  toolcraftProductEvidenceModulePolicies.map((policy) => [
    policy.privateModuleRepoPath,
    policy,
  ]),
);

function normalizeRepoPath(repoPath) {
  return String(repoPath).replaceAll("\\", "/").replace(/^\.\//u, "");
}

export function createToolcraftPrivateEvidenceImportViolation({
  importerRepoPath,
  moduleImport,
}) {
  if (moduleImport.resolution !== "resolved") return null;
  const policy = privateEvidencePolicyByRepoPath.get(
    normalizeRepoPath(moduleImport.resolvedRepoPath),
  );
  if (!policy) return null;

  return {
    column: moduleImport.column,
    kind: "reserved-runtime-evidence",
    line: moduleImport.line,
    message:
      `${PRIVATE_EVIDENCE_MESSAGE} Import ${policy.publicFacadeRepoPath} ` +
      `for ${policy.capability}.`,
    repoPath: importerRepoPath,
  };
}
