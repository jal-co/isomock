import type { ControlChangeMeta } from "@/toolcraft/ui";

import type { ToolcraftControlSchema } from "../../../schema/types";
import { ControlsPanelCollectionItemFields } from "./controls-panel-collection-item-fields";

type FileDropItemValue = Readonly<Record<string, unknown>> & {
  mediaId: string;
};

export type ControlsPanelFileDropItemControlsProps = {
  control: ToolcraftControlSchema;
  index: number;
  mediaId: string;
  name: string;
  setControlValue: (
    target: string,
    value: unknown,
    label?: string,
    meta?: ControlChangeMeta,
  ) => void;
  value: unknown;
};

function asFileDropItemValues(value: unknown): readonly FileDropItemValue[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (item): item is FileDropItemValue =>
      typeof item === "object" &&
      item !== null &&
      typeof (item as { mediaId?: unknown }).mediaId === "string",
  );
}

export function ControlsPanelFileDropItemControls({
  control,
  index,
  mediaId,
  name,
  setControlValue,
  value,
}: ControlsPanelFileDropItemControlsProps): React.JSX.Element | null {
  const itemControls = control.itemControls;

  if (!itemControls || Object.keys(itemControls).length === 0) {
    return null;
  }

  const itemValues = asFileDropItemValues(value);
  const storedItemValue = itemValues.find((item) => item.mediaId === mediaId);

  return (
    <ControlsPanelCollectionItemFields
      controls={itemControls}
      id={`${control.target}:${mediaId}`}
      onChange={(nextValue, fieldName, meta) => {
        const nextItemValue: FileDropItemValue = { ...nextValue, mediaId };
        const existingIndex = itemValues.findIndex(
          (item) => item.mediaId === mediaId,
        );
        const nextItems = [...itemValues];

        if (existingIndex >= 0) {
          nextItems[existingIndex] = nextItemValue;
        } else {
          nextItems.push(nextItemValue);
        }

        setControlValue(
          control.target,
          nextItems,
          `${name} ${index + 1} ${fieldName}`,
          meta,
        );
      }}
      target={control.target}
      value={storedItemValue}
    />
  );
}
