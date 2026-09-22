"use client";

import * as React from "react";
import type { ReactNode } from "react";

import { cn } from "../../../lib/utils";
import {
  CollectionActionsControl,
  CollectionItemGroups,
} from "../collection-actions";
import { Field } from "../../primitives";
import { FileDropPresentationMessages } from "./file-drop-presentation-messages";
import type {
  FileDropCollectionActions,
  FileDropPresentation,
  FileDropPresentationEntry,
  FileDropPresentationItem,
} from "./file-drop-types";

type FileDropCollectionControlProps = {
  actions: FileDropCollectionActions;
  canRemoveAttachedItem: boolean;
  entries: readonly FileDropPresentationEntry[];
  onRemoveAttachedItem: (item: FileDropPresentationItem, index: number) => void;
  presentation: FileDropPresentation<string, unknown, unknown>;
  renderSlotControl: (
    presentation: FileDropPresentation<string, unknown, unknown>,
  ) => ReactNode;
};

export function FileDropCollectionControl({
  actions,
  canRemoveAttachedItem,
  entries,
  onRemoveAttachedItem,
  presentation,
  renderSlotControl,
}: FileDropCollectionControlProps): React.JSX.Element {
  const pendingBaseCountRef = React.useRef(entries.length);
  const [hasPendingSlot, setHasPendingSlot] = React.useState(
    () => entries.length === 0,
  );

  React.useEffect(() => {
    if (entries.length === 0 && !hasPendingSlot) {
      pendingBaseCountRef.current = 0;
      setHasPendingSlot(true);
    } else if (hasPendingSlot && entries.length > pendingBaseCountRef.current) {
      setHasPendingSlot(false);
    }
  }, [entries.length, hasPendingSlot]);

  const canAddSlot = actions.canAdd !== false && !hasPendingSlot;
  const canRemoveSlot = hasPendingSlot
    ? entries.length > 0
    : entries.length > 0 && canRemoveAttachedItem;

  function renderSlot(
    item: FileDropPresentationItem | null,
    index: number,
    key: React.Key,
  ): React.JSX.Element {
    const itemContent = item ? actions.renderItemContent?.(item, index) : null;
    const slotPresentation = {
      ...presentation,
      allowsFileBatch: false,
      allowsFolderSelection: false,
      emptyTitle: `Upload ${actions.itemLabel ?? "file"} ${index + 1}`,
      feedback: undefined,
      items: item ? [item] : [],
      secondaryActions: [],
      status: undefined,
    };
    return (
      <div
        className={cn("min-w-0", itemContent && "space-y-4")}
        data-slot="file-drop-collection-slot"
        key={key}
      >
        {renderSlotControl(slotPresentation)}
        {itemContent}
      </div>
    );
  }

  return (
    <Field className="min-w-0" style={{ gap: "6px" }}>
      <CollectionActionsControl
        addLabel={actions.addLabel}
        canAdd={canAddSlot}
        canRemove={canRemoveSlot}
        name={actions.name}
        onAdd={() => {
          pendingBaseCountRef.current = entries.length;
          setHasPendingSlot(true);
        }}
        onRemove={() => {
          if (hasPendingSlot) {
            setHasPendingSlot(false);
            return;
          }

          const entry = entries[entries.length - 1];

          if (entry) {
            onRemoveAttachedItem(entry.item, entry.sourceIndex);
          }
        }}
        removeLabel={actions.removeLabel}
      />
      <CollectionItemGroups>
        {entries.map((entry, index) =>
          renderSlot(entry.item, index, entry.key),
        )}
        {hasPendingSlot
          ? renderSlot(null, entries.length, `pending-${entries.length}`)
          : null}
      </CollectionItemGroups>
      <FileDropPresentationMessages
        feedback={presentation.feedback}
        status={presentation.status}
      />
    </Field>
  );
}
