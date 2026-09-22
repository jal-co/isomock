export type ToolcraftPlaywrightProjectRootConfig = Readonly<{
  configFile: unknown;
  rootDir?: unknown;
}>;

export type ToolcraftPlaywrightContainingFileSuite = Readonly<{
  location?: Readonly<{ file?: unknown }>;
  parent?: ToolcraftPlaywrightContainingFileSuite;
  type?: unknown;
}>;

export type ToolcraftPlaywrightContainingFileTestCase = Readonly<{
  parent?: ToolcraftPlaywrightContainingFileSuite;
  title?: unknown;
}>;

export function getToolcraftPlaywrightProjectRoot(
  config: ToolcraftPlaywrightProjectRootConfig,
): string;

export function getToolcraftPlaywrightContainingFile(
  testCase: ToolcraftPlaywrightContainingFileTestCase,
  rootDir: string,
): string;
