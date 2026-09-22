export type ToolcraftDeliveryCatalogAcceptance = Readonly<{
  acceptanceId: string;
  contractHash: string;
  domainId: string;
  file: `e2e/${string}.spec.ts`;
  testName: string;
}>;

export type ToolcraftDeliveryCatalogPerformance = Readonly<{
  passIds: readonly string[];
  pathId: string;
  testName: string;
}>;

export type ToolcraftDeliveryCatalog = Readonly<{
  acceptance: readonly ToolcraftDeliveryCatalogAcceptance[];
  performance: readonly ToolcraftDeliveryCatalogPerformance[];
  version: 2;
}>;

export type ToolcraftDeliveryCatalogValidation = Readonly<{
  catalog?: ToolcraftDeliveryCatalog;
  errors: readonly string[];
}>;

export function isToolcraftCanonicalCatalogFile(
  value: unknown,
): value is `e2e/${string}.spec.ts`;

export function validateToolcraftDeliveryCatalog(
  value: unknown,
): ToolcraftDeliveryCatalogValidation;
