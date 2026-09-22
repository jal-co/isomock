export const toolcraftFrameworkOwnedSourceRoots: readonly string[];
export const toolcraftFrameworkOwnedRootFiles: readonly string[];
export const toolcraftProductOwnedGeneratedPaths: readonly string[];

export function toToolcraftGeneratedPath(relativePath: string): string;
export function isToolcraftFrameworkOwnedPath(relativePath: string): boolean;

export function collectToolcraftFrameworkOwnedLocalPaths(
  rootDir: string,
): Promise<string[]>;
export function collectToolcraftFrameworkOwnedGeneratedPaths(
  rootDir: string,
): Promise<string[]>;
