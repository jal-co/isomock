export const toolcraftBrowserProofBudgetValues: readonly [
  "extended-io",
  "standard",
];

export type ToolcraftBrowserProofBudget =
  (typeof toolcraftBrowserProofBudgetValues)[number];

export const TOOLCRAFT_BROWSER_PROOF_TIMEOUT_MS: Readonly<
  Record<ToolcraftBrowserProofBudget, number>
>;

export function isToolcraftBrowserProofBudget(
  value: unknown,
): value is ToolcraftBrowserProofBudget;

export function isToolcraftBrowserProofFile(
  value: unknown,
): value is `e2e/${string}.spec.ts`;

export function isToolcraftBrowserProofTestName(
  value: unknown,
): value is string;

export type ToolcraftBrowserProofRelationRow = Readonly<{
  budget?: ToolcraftBrowserProofBudget;
  file: `e2e/${string}.spec.ts`;
  testName: string;
}>;

export type ToolcraftBrowserProofRelationGroup<
  TBudget extends ToolcraftBrowserProofBudget | undefined =
    | ToolcraftBrowserProofBudget
    | undefined,
> = Readonly<{
  budget: TBudget;
  file: `e2e/${string}.spec.ts`;
  rowIndexes: readonly number[];
  testName: string;
}>;

export type ToolcraftBrowserProofRelationValidation<
  TBudget extends ToolcraftBrowserProofBudget | undefined =
    | ToolcraftBrowserProofBudget
    | undefined,
> = Readonly<{
  budgetConflicts: readonly Readonly<{
    budgets: readonly ToolcraftBrowserProofBudget[];
    file: `e2e/${string}.spec.ts`;
    testName: string;
  }>[];
  duplicateIdentities: readonly Readonly<
    ToolcraftBrowserProofRelationGroup<TBudget> & { count: number }
  >[];
  fileConflicts: readonly Readonly<{
    files: readonly `e2e/${string}.spec.ts`[];
    testName: string;
  }>[];
  groups: readonly ToolcraftBrowserProofRelationGroup<TBudget>[];
  reservedTestNameCollisions: readonly string[];
}>;

export function validateToolcraftBrowserProofRelations(
  rows: readonly Readonly<
    ToolcraftBrowserProofRelationRow & {
      budget: ToolcraftBrowserProofBudget;
    }
  >[],
  options?: Readonly<{ reservedTestNames?: readonly string[] }>,
): ToolcraftBrowserProofRelationValidation<ToolcraftBrowserProofBudget>;

export function validateToolcraftBrowserProofRelations(
  rows: readonly ToolcraftBrowserProofRelationRow[],
  options?: Readonly<{ reservedTestNames?: readonly string[] }>,
): ToolcraftBrowserProofRelationValidation;
