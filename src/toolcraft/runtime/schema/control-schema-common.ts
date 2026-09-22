import type {
  ToolcraftControlApplicabilitySchema,
  ToolcraftControlDisabledConditionSchema,
  ToolcraftControlOrderRole,
  ToolcraftControlPerformanceRole,
} from "./types";

/** Shared authoring semantics, not a bag of built-in component props. */
export type ToolcraftControlSchemaBase = {
  applicability: ToolcraftControlApplicabilitySchema;
  description?: string;
  disabled?: boolean;
  disabledWhen?: ToolcraftControlDisabledConditionSchema;
  keyframeable?: boolean;
  label?: boolean | string;
  orderRole?: ToolcraftControlOrderRole;
  performanceReason?: string;
  performanceRole?: ToolcraftControlPerformanceRole;
  semanticGroup?: string;
  target: string;
  visibleWhen?: never;
};

type UnionKeys<T> = T extends unknown ? keyof T : never;
/** Reject other branches' fields even when they arrive through a variable/spread. */
export type StrictControlUnion<T, All = T> = T extends unknown
  ? T & Partial<Record<Exclude<UnionKeys<All>, keyof T>, never>>
  : never;

export type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;
