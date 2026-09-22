export type ToolcraftSourceOwner = "framework" | "platform" | "product";
export type ToolcraftSourceRole = "generated" | "production" | "test" | "test-support";

export type ToolcraftSourceInventoryEntry = {
  absolutePath: string;
  owner: ToolcraftSourceOwner;
  repoPath: string;
  role: ToolcraftSourceRole;
};

export type ToolcraftSourceFilesystemViolation = {
  reason: string;
  repoPath: string;
};

export type ToolcraftSourceInventory = {
  entries: ToolcraftSourceInventoryEntry[];
  filesystemViolations: ToolcraftSourceFilesystemViolation[];
};

export type ToolcraftSourceInventoryOptions = {
  frameworkPathPrefixes?: readonly string[];
  generatedFilePatterns?: readonly RegExp[];
  ignoredFilePatterns?: readonly RegExp[];
  protectedFilePaths?: readonly string[];
  rootDir: string;
  sourceExtensions?: ReadonlySet<string>;
  sourceRoots?: readonly string[];
  testFilePatterns?: readonly RegExp[];
  testSupportPatterns?: readonly RegExp[];
};

export const toolcraftSourceExtensions: ReadonlySet<string>;

export function resolveToolcraftRootResourcePath(
  resourcePath: string,
  rootDir: string,
): string;

export function classifyToolcraftSourcePath(
  repoPath: string,
  options?: Omit<ToolcraftSourceInventoryOptions, "rootDir" | "sourceRoots">,
): { owner: ToolcraftSourceOwner; role: ToolcraftSourceRole };

export function collectToolcraftSourceInventorySync(
  options: ToolcraftSourceInventoryOptions,
): ToolcraftSourceInventory;

export function collectToolcraftSourceInventory(
  options: ToolcraftSourceInventoryOptions,
): Promise<ToolcraftSourceInventory>;
