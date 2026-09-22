export type ToolcraftPlaywrightTestTitle = Readonly<{
  fullTitle: string;
  grepTitle: string;
  leafTitle: string;
}>;

export function collectToolcraftPlaywrightTestTitles(
  report: unknown,
): readonly ToolcraftPlaywrightTestTitle[];

export function resolveToolcraftPlaywrightTestTitles(
  availableTitles: readonly ToolcraftPlaywrightTestTitle[],
  requestedTitles: readonly string[],
): readonly ToolcraftPlaywrightTestTitle[];

export function getToolcraftPlaywrightExactGrepPattern(
  selections: readonly ToolcraftPlaywrightTestTitle[],
): string;
