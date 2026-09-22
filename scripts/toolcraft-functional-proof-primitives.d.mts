export function serializeToolcraftCanonicalJson(value: unknown): string;
export function createToolcraftCanonicalJsonHash(value: unknown): string;
export function hasToolcraftExactRecordKeys(
  value: unknown,
  keys: readonly string[],
): boolean;
export function isToolcraftCanonicalTargetArray(
  value: unknown,
  options?: Readonly<{ empty?: boolean; paths?: boolean }>,
): boolean;
export function isToolcraftDenseExactArray(value: unknown): value is unknown[];
export function deepFreezeToolcraftValue<T>(value: T): T;
export function isToolcraftDeeplyFrozen(value: unknown): boolean;
export function deriveToolcraftAcceptanceDomainId(acceptanceId: string): string;
export function createToolcraftAcceptanceContractHash(
  acceptanceEntry: unknown,
): string;
