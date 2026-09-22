import { failModelSourceBundle } from "./model-source-bundle-error";
import type { ModelSourceFileSnapshot } from "./model-source-path";

export type ModelSourceLookupObserver = Readonly<{
  onCanonicalResolution?: () => void;
  onIndexedFile?: () => void;
}>;

export type ModelSourceDependencyResolver = Readonly<{
  resolve: (uriSegments: readonly string[]) => ModelSourceFileSnapshot;
}>;

export type ModelSourcePackageLookup<T extends Readonly<{ path: string }>> =
  Readonly<{
    resolveFrom: (
      basePath: string,
      uriSegments: readonly string[],
    ) => T | undefined;
  }>;

export function createModelSourcePackageLookup<
  T extends Readonly<{ path: string }>,
>(
  files: readonly T[],
): ModelSourcePackageLookup<T> {
  const filesByPath = new Map(files.map((file) => [file.path, file]));
  return Object.freeze({
    resolveFrom: (basePath, uriSegments) => {
      const directory = basePath.split("/").slice(0, -1);
      return filesByPath.get([...directory, ...uriSegments].join("/"));
    },
  });
}

function addCandidate(
  index: Map<string, ModelSourceFileSnapshot[]>,
  key: string,
  file: ModelSourceFileSnapshot,
): void {
  const candidates = index.get(key);
  if (candidates) {
    candidates.push(file);
  } else {
    index.set(key, [file]);
  }
}

function freezeCandidates(index: Map<string, ModelSourceFileSnapshot[]>): void {
  for (const candidates of index.values()) Object.freeze(candidates);
}

function missingGeometryFile(): never {
  return failModelSourceBundle(
    "bundle",
    "missing-buffer-file",
    "The selected batch is missing a required local geometry buffer.",
  );
}

function duplicateGeometryPath(
  matches: readonly ModelSourceFileSnapshot[],
): never {
  const code =
    new Set(matches.map(({ rawPath }) => rawPath)).size > 1
      ? "ambiguous-normalized-path"
      : "duplicate-source-path";
  return failModelSourceBundle(
    "bundle",
    code,
    "More than one selected source file resolves to required geometry.",
  );
}

function selectCandidate(
  candidates: readonly ModelSourceFileSnapshot[] | undefined,
): ModelSourceFileSnapshot {
  if (!candidates || candidates.length === 0) return missingGeometryFile();
  if (candidates.length !== 1) return duplicateGeometryPath(candidates);
  return candidates[0]!;
}

export function createModelSourceDependencyResolver(
  root: ModelSourceFileSnapshot,
  files: readonly ModelSourceFileSnapshot[],
  observer?: ModelSourceLookupObserver,
): ModelSourceDependencyResolver {
  const provenPaths = new Map<string, ModelSourceFileSnapshot[]>();
  const siblingBasenames = new Map<string, ModelSourceFileSnapshot[]>();
  for (const file of files) {
    addCandidate(
      file.hasPathEvidence ? provenPaths : siblingBasenames,
      file.path,
      file,
    );
    observer?.onIndexedFile?.();
  }
  freezeCandidates(provenPaths);
  freezeCandidates(siblingBasenames);

  const rootDirectory = root.path.split("/").slice(0, -1);
  const resolvedCanonicalPaths = new Map<string, ModelSourceFileSnapshot>();

  const resolve = (uriSegments: readonly string[]): ModelSourceFileSnapshot => {
    let canonicalPath: string;
    let candidateKey: string;
    let candidateIndex: ReadonlyMap<string, readonly ModelSourceFileSnapshot[]>;
    if (!root.hasPathEvidence) {
      if (uriSegments.length !== 1) {
        return failModelSourceBundle(
          "bundle",
          "unproven-buffer-path",
          "Nested glTF buffers require browser-provided relative path evidence.",
        );
      }
      canonicalPath = `sibling:${uriSegments[0]}`;
      candidateKey = uriSegments[0]!;
      candidateIndex = siblingBasenames;
    } else {
      const targetPath = [...rootDirectory, ...uriSegments].join("/");
      canonicalPath = `path:${targetPath}`;
      candidateKey = targetPath;
      candidateIndex = provenPaths;
    }

    const cached = resolvedCanonicalPaths.get(canonicalPath);
    if (cached) return cached;
    observer?.onCanonicalResolution?.();
    const dependency = selectCandidate(candidateIndex.get(candidateKey));
    resolvedCanonicalPaths.set(canonicalPath, dependency);
    return dependency;
  };

  return Object.freeze({ resolve });
}
