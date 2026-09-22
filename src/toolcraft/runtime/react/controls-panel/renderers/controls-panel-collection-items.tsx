import { getToolcraftCollectionItemIdentity } from "../../../schema/collection-identity";
import * as React from "react";
import { CollectionItemGroups, type ControlChangeMeta } from "@/toolcraft/ui";

import { getToolcraftScalarCollectionItemControl } from "../../../schema/collection-item-defaults";
import type { ToolcraftControlSchema } from "../../../schema/types";
import {
  getCollectionItemName,
  getCollectionItemType,
} from "../values/controls-panel-values";
import {
  ControlsPanelCollectionItemField,
  ControlsPanelCollectionItemFields,
} from "./controls-panel-collection-item-fields";

export type ControlsPanelCollectionItemsProps = {
  control: ToolcraftControlSchema;
  items: readonly unknown[];
  onItemChange: (
    index: number,
    nextValue: unknown,
    meta?: ControlChangeMeta,
    fieldName?: string,
    fieldId?: string,
    fieldValue?: unknown,
  ) => void;
  onSelectItem?: (index: number) => void;
  selectedIndex?: number | null;
  slotPrefix: "collection-actions" | "source-collection";
  withFieldKeyframeAction?: (args: {
    children: React.ReactNode;
    field: NonNullable<ToolcraftControlSchema["itemControls"]>[string];
    fieldId: string;
    index: number;
    name: string;
    value: unknown;
  }) => React.ReactNode;
};

function renderCollectionItemControl({
  control,
  index,
  item,
  onItemChange,
}: {
  control: ToolcraftControlSchema;
  index: number;
  item: unknown;
  onItemChange: ControlsPanelCollectionItemsProps["onItemChange"];
}): React.ReactNode {
  const itemName = getCollectionItemName(control, index);
  const itemControl = getToolcraftScalarCollectionItemControl(control);

  return (
    <ControlsPanelCollectionItemField
      colorLabelMode="hidden"
      control={itemControl}
      id={`${control.target}:${index}`}
      name={itemName}
      onChange={(nextValue, meta) => onItemChange(index, nextValue, meta)}
      plainColorFullWidth={itemControl.type === "color"}
      target={control.target}
      value={item}
    />
  );
}

export function ControlsPanelCollectionItems({
  control,
  items,
  onItemChange,
  slotPrefix,
  onSelectItem,
  selectedIndex,
  withFieldKeyframeAction,
}: ControlsPanelCollectionItemsProps): React.JSX.Element {
  const itemControls = control.itemControls;

  if (itemControls) {
    return (
      <CollectionItemGroups>
        {items.map((item, index) => (
          <div
            data-selected={selectedIndex === index ? "true" : undefined}
            data-toolcraft-collection-item-index={index}
            data-toolcraft-collection-item-id={control.identityField ? getToolcraftCollectionItemIdentity(control, item, index) : undefined}
            key={getToolcraftCollectionItemIdentity(control, item, index)}
            onFocusCapture={() => onSelectItem?.(index)}
            onPointerDown={() => onSelectItem?.(index)}
          >
            <ControlsPanelCollectionItemFields
              controls={itemControls}
              id={`${control.target}:${getToolcraftCollectionItemIdentity(control, item, index)}`}
              onChange={(nextValue, fieldName, meta) =>
                onItemChange(index, nextValue, meta, fieldName)
              }
              onFieldChange={(fieldId, fieldValue, nextValue, fieldName, meta) =>
                onItemChange(
                  index,
                  nextValue,
                  meta,
                  fieldName,
                  fieldId,
                  fieldValue,
                )
              }
              target={control.target}
              value={item}
              withFieldKeyframeAction={(args) =>
                withFieldKeyframeAction?.({ ...args, index }) ?? args.children
              }
            />
          </div>
        ))}
      </CollectionItemGroups>
    );
  }

  const itemType = getCollectionItemType(control);
  const isCompactColorGrid = itemType === "color";

  return (
    <div
      className={
        isCompactColorGrid
          ? "grid min-w-0 grid-cols-2 gap-x-2 gap-y-4"
          : "min-w-0 space-y-4"
      }
      data-slot={`${slotPrefix}-${isCompactColorGrid ? "items-grid" : "items"}`}
    >
      {items.map((item, index) => (
        <React.Fragment key={index}>
          {renderCollectionItemControl({
            control,
            index,
            item,
            onItemChange,
          })}
        </React.Fragment>
      ))}
    </div>
  );
}
