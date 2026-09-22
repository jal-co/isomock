import { isToolcraftBuiltInControlType, type ToolcraftBuiltInControlType } from "../contracts/component-contracts";
import type { ToolcraftCanvasAspectRatioValue } from "../state/canvas-state";
import type { ToolcraftCollectionControlFields } from "./control-schema-collections";
import type { DistributiveOmit, StrictControlUnion, ToolcraftControlSchemaBase } from "./control-schema-common";
import type { ToolcraftCompoundControlFields } from "./control-schema-compounds";
import type { ToolcraftInputControlFields } from "./control-schema-inputs";
import type { ToolcraftCustomControlType } from "./custom-control-type";
import type { ToolcraftActionSchema, ToolcraftMediaAssetKind, ToolcraftModelFormat, ToolcraftModelImportLimits, ToolcraftModelTopologyProfile, ToolcraftResolvedControlApplicabilitySchema } from "./types";

type ActionFields = {
  actions?: readonly (ToolcraftActionSchema | string)[];
  /** Legacy empty authoring placeholder; actions never own a state value. */
  defaultValue?: readonly never[] | null;
};
type BuiltInFields = Omit<ToolcraftInputControlFields, "text" | "select"> & ToolcraftCompoundControlFields & ToolcraftCollectionControlFields & {
  select: ToolcraftInputControlFields["select"];
  text: ToolcraftInputControlFields["text"] | (Omit<ToolcraftInputControlFields["text"], "defaultValue"> & {
    defaultValue?: number;
    target: "canvas.size.width" | "canvas.size.height";
  });
  actions: ActionFields;
  panelActions: ActionFields;
  settingsTransfer: Record<never, never>;
  aspectRatio: { defaultValue?: string | ToolcraftCanvasAspectRatioValue };
};

/** Indexing every registry key makes omitted built-ins a compiler error. */
type BuiltInBranches = {
  [K in ToolcraftBuiltInControlType]: ToolcraftControlSchemaBase & BuiltInFields[K] & { type: K };
}[ToolcraftBuiltInControlType];
type CustomBranch = ToolcraftControlSchemaBase & {
  assetKind?: ToolcraftMediaAssetKind;
  defaultValue?: unknown;
  /** Optional numeric workload domain used by existing performance contracts. */
  max?: number;
  min?: number;
  multiple?: boolean;
  type: ToolcraftCustomControlType;
};

export type ToolcraftControlSchema = StrictControlUnion<BuiltInBranches | CustomBranch>;
export type ToolcraftBuiltInControlSchema = Extract<ToolcraftControlSchema, { type: ToolcraftBuiltInControlType }>;
export type ToolcraftCustomControlSchema = Extract<ToolcraftControlSchema, { type: ToolcraftCustomControlType }>;
export type ToolcraftModelFileDropSchema = Extract<ToolcraftControlSchema, { assetKind: "model" }>;
export type ToolcraftNonModelControlSchema = Exclude<ToolcraftControlSchema, ToolcraftModelFileDropSchema>;

type ResolvedApplicability<T> = DistributiveOmit<T, "applicability" | "visibleWhen"> & {
  applicability: ToolcraftResolvedControlApplicabilitySchema;
};
export type ResolvedToolcraftNonModelControlSchema = ResolvedApplicability<ToolcraftNonModelControlSchema>;
export type ResolvedToolcraftModelFileDropSchema = ResolvedApplicability<Omit<ToolcraftModelFileDropSchema, "modelFormats" | "modelLimits" | "multiple" | "topologyProfile">> & {
  modelFormats: readonly ToolcraftModelFormat[];
  modelLimits: ToolcraftModelImportLimits;
  multiple: false;
  topologyProfile: ToolcraftModelTopologyProfile;
};
export type ResolvedToolcraftControlSchema = ResolvedToolcraftNonModelControlSchema | ResolvedToolcraftModelFileDropSchema;

/** Nominal custom strings cannot be narrowed by string equality alone in TypeScript. */
export function isToolcraftBuiltInControlSchema<T extends ToolcraftControlSchema>(
  control: T,
): control is Extract<T, { type: ToolcraftBuiltInControlType }> {
  return isToolcraftBuiltInControlType(control.type);
}
