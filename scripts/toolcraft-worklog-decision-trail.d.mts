export type ToolcraftDecisionTrailIteration = Readonly<{
  body: string;
  heading: string;
}>;

export declare function getToolcraftMarkdownSectionBodies(
  source: string,
  sectionName: string,
): string[];

export declare function parseToolcraftDecisionTrail(source: string): Readonly<{
  errors: readonly string[];
  iterations: readonly ToolcraftDecisionTrailIteration[];
}>;

export declare function getToolcraftWorklogEntries(source: string): Array<ToolcraftDecisionTrailIteration & { startLine: number; endLine: number }>;
export declare function selectToolcraftDecisionTrailIteration(source: string): ToolcraftDecisionTrailIteration;
