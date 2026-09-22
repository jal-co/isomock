import path from "node:path";

import {
  requireToolcraftMotionReferenceSourceIdentity,
} from "./toolcraft-motion-reference-roots.mjs";

function fail(message, cause) {
  throw new Error(`Toolcraft motion reference staging scope failed: ${message}`, {
    cause,
  });
}

function isStrictDescendant(root, target) {
  const relative = path.relative(root, target);
  return relative !== "" && relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function requireCanonicalAbsolute(target, label) {
  if (typeof target !== "string" || !path.isAbsolute(target) ||
      path.resolve(target) !== target) {
    fail(`${label} must be a canonical absolute path without traversal`);
  }
  return target;
}

function publicationRecords(records) {
  if (!Array.isArray(records) || records.length === 0) {
    fail("a nonempty publication record group is required");
  }
  const published = records.filter(({ stagingDirectory }) =>
    stagingDirectory !== null);
  if (published.length === 0) {
    fail("a publication group must contain at least one staged study");
  }
  return published;
}

export function defineToolcraftMotionReferenceStagingScope(
  records,
  { sourceIdentity, stagingRoot, temporaryRoot },
) {
  requireToolcraftMotionReferenceSourceIdentity(sourceIdentity);
  requireCanonicalAbsolute(temporaryRoot, "temporary root");
  const published = publicationRecords(records);
  const derivedRoots = new Set(published.map(({ stagingDirectory }) => {
    requireCanonicalAbsolute(stagingDirectory, "staging directory");
    return path.dirname(stagingDirectory);
  }));
  if (derivedRoots.size !== 1) {
    fail("one complete publication must use one canonical staging root");
  }
  const derivedRoot = derivedRoots.values().next().value;
  if (stagingRoot !== undefined && stagingRoot !== derivedRoot) {
    fail("declared staging root must own every staged study directly");
  }
  requireCanonicalAbsolute(derivedRoot, "staging root");
  if (!isStrictDescendant(temporaryRoot, derivedRoot) ||
      path.basename(derivedRoot) !== `${sourceIdentity}.staging`) {
    fail("staging root must be source-owned beneath the checked temporary root");
  }
  for (const { finalDirectory, stagingDirectory } of published) {
    requireCanonicalAbsolute(finalDirectory, "final directory");
    if (path.dirname(stagingDirectory) !== derivedRoot ||
        path.basename(stagingDirectory) !== path.basename(finalDirectory)) {
      fail("each staged study must be the direct expected child of its staging root");
    }
  }
  return { sourceIdentity, stagingRoot: derivedRoot, temporaryRoot };
}

async function requireDirectDirectoryChain(
  fileSystem,
  root,
  target,
  { allowMissingTarget },
) {
  const relative = path.relative(root, target);
  let current = root;
  for (const component of ["", ...relative.split(path.sep)]) {
    if (component !== "") current = path.join(current, component);
    let status;
    try {
      status = await fileSystem.lstat(current);
    } catch (error) {
      if (allowMissingTarget && error?.code === "ENOENT") return;
      fail(`staging path is missing or unreadable: ${current}`, error);
    }
    if (!status.isDirectory() || status.isSymbolicLink()) {
      fail(`staging path must contain only direct directories, not links: ${current}`);
    }
  }
  const [realRoot, realTarget] = await Promise.all([
    fileSystem.realpath(root),
    fileSystem.realpath(target),
  ]);
  const contained = target === root ? realTarget === realRoot :
    isStrictDescendant(realRoot, realTarget);
  if (!contained) {
    fail("staging path real location escapes its checked directory boundary");
  }
}

export async function requireToolcraftMotionReferenceStagingScope(
  records,
  {
    allowMissingStagingDirectories = false,
    fileSystem,
    sourceIdentity,
    stagingRoot,
    temporaryRoot,
  },
) {
  const scope = defineToolcraftMotionReferenceStagingScope(records, {
    sourceIdentity, stagingRoot, temporaryRoot,
  });
  await requireDirectDirectoryChain(
    fileSystem, temporaryRoot, scope.stagingRoot,
    { allowMissingTarget: allowMissingStagingDirectories },
  );
  for (const { stagingDirectory } of publicationRecords(records)) {
    await requireDirectDirectoryChain(
      fileSystem, scope.stagingRoot, stagingDirectory,
      { allowMissingTarget: allowMissingStagingDirectories },
    );
  }
  return scope;
}
