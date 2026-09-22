import type { ToolcraftCollectionItemControlType } from "./collection-item-controls";
import type {
  DistributiveOmit,
  StrictControlUnion,
  ToolcraftControlSchemaBase,
} from "./control-schema-common";
import type { ToolcraftCompoundControlFields } from "./control-schema-compounds";
import type { ToolcraftInputControlFields } from "./control-schema-inputs";
import type {
  ToolcraftMediaAssetKind,
  ToolcraftModelFormat,
  ToolcraftModelImportLimits,
  ToolcraftModelTopologyProfile,
} from "./types";

type ItemFields = ToolcraftInputControlFields & ToolcraftCompoundControlFields;
type ItemCommon = Pick<
  ToolcraftControlSchemaBase,
  | "disabled"
  | "description"
  | "keyframeable"
  | "label"
  | "performanceReason"
  | "performanceRole"
>;
type ItemBranches = {
  [K in ToolcraftCollectionItemControlType]: ItemCommon &
    ItemFields[K] & { type: K };
};
type ItemFieldUniverse =
  | ItemFields[keyof ItemFields]
  | ToolcraftControlSchemaBase
  | FileDropCommon
  | ModelFileDropFields
  | MediaFileDropFields
  | CollectionCardinality
  | {
      actions?: never;
      identityField?: never;
      itemControl?: never;
      itemControls?: never;
      itemDefaultValue?: never;
      itemLabel?: never;
      selectionTarget?: never;
      variant?: never;
      optionsSource?: never;
    };
export type ToolcraftCollectionItemControlSchema = StrictControlUnion<
  ItemBranches[ToolcraftCollectionItemControlType],
  ItemBranches[ToolcraftCollectionItemControlType] | ItemFieldUniverse
>;
export type ToolcraftCollectionItemControlsSchema = Readonly<
  Record<string, ToolcraftCollectionItemControlSchema>
>;

type SingleItemCollection = {
  [K in ToolcraftCollectionItemControlType]: {
    defaultValue?: readonly NonNullable<ItemFields[K]["defaultValue"]>[];
    itemControl: Extract<ToolcraftCollectionItemControlSchema, { type: K }>;
    itemControls?: never;
    itemDefaultValue?: ItemFields[K]["defaultValue"];
  };
}[ToolcraftCollectionItemControlType];
type CompoundItemCollection = {
  /** Hidden stable identity; only compound collectionActions may opt in. */
  identityField?: "id";
  defaultValue?: readonly Readonly<Record<string, unknown>>[];
  itemControl?: never;
  itemControls: ToolcraftCollectionItemControlsSchema;
  itemDefaultValue?: never;
  selectionTarget?: string;
};
type CollectionCardinality = {
  addLabel?: string;
  hardMaxItems?: number;
  minItems?: number;
  recommendedMaxItems?: number;
  removeLabel?: string;
};
type FileDropCommon = {
  accept?: string;
  hardMaxItems?: number;
  recommendedMaxItems?: number;
};
type ModelFileDropFields = FileDropCommon & {
  assetKind: "model";
  defaultValue?: null;
  modelFormats?: readonly ToolcraftModelFormat[];
  modelLimits?: Partial<ToolcraftModelImportLimits>;
  multiple?: false;
  topologyProfile?: ToolcraftModelTopologyProfile;
};
type MediaFileDropFields = FileDropCommon & {
  assetKind?: ToolcraftMediaAssetKind;
  defaultValue?: null | readonly never[];
  multiple?: boolean;
};
type CollectionFileDropFields = FileDropCommon & {
  assetKind: "file";
  defaultValue?: readonly Readonly<Record<string, unknown>>[];
  itemControls?: ToolcraftCollectionItemControlsSchema;
  itemLabel?: string;
  multiple: true;
  variant: "collection-actions";
};

export type ToolcraftCollectionControlFields = {
  collectionActions: CollectionCardinality & { itemLabel?: string } & (
      | SingleItemCollection
      | CompoundItemCollection
    );
  sourceCollection: DistributiveOmit<
    SingleItemCollection,
    "itemDefaultValue"
  > & { itemLabel?: string };
  fileDrop: StrictControlUnion<
    ModelFileDropFields | MediaFileDropFields | CollectionFileDropFields
  >;
};
