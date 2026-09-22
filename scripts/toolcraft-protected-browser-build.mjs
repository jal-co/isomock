import {
  runToolcraftProofPackageScript,
} from "./toolcraft-proof-process.mjs";

const protectedBrowserProofEnvironmentPrefix =
  "VITE_TOOLCRAFT_BROWSER_PROOF_";
const protectedBrowserProofFixtureEnvironmentKey =
  "VITE_TOOLCRAFT_BROWSER_PROOF_FIXTURES";
const protectedBrowserProofFixtureEnvironmentValue = "unavailable-resource";

function createToolcraftProtectedBrowserBuildEnvironment(environment) {
  const sanitizedEnvironment = Object.fromEntries(
    Object.entries(environment).filter(
      ([name]) => !name.startsWith(protectedBrowserProofEnvironmentPrefix),
    ),
  );
  return Object.freeze({
    ...sanitizedEnvironment,
    [protectedBrowserProofFixtureEnvironmentKey]:
      protectedBrowserProofFixtureEnvironmentValue,
  });
}

export function runToolcraftProtectedBrowserBuild({
  environment = process.env,
  projectDir,
  runPackageScript = runToolcraftProofPackageScript,
}) {
  return runPackageScript(projectDir, "build", {
    env: createToolcraftProtectedBrowserBuildEnvironment(environment),
  });
}
