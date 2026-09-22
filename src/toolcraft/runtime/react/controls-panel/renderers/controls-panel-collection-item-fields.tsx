import * as React from "react";
import type { ControlChangeMeta } from "@/toolcraft/ui";

import type {
  ToolcraftCollectionItemControlSchema,
  ToolcraftCollectionItemControlsSchema,
  ToolcraftControlSchema,
} from "../../../schema/types";
import { decodeToolcraftBuiltInLiveValue } from "../../../state/control-value-codecs";
import { renderBasicControl } from "./controls-panel-basic-renderers";
import { renderCompoundControl } from "./controls-panel-compound-renderers";

type ItemFieldChange = (nextValue: unknown, meta?: ControlChangeMeta) => void;

function renderWithoutKeyframeAction({
  children,
}: {
  children: React.ReactNode;
}): React.ReactNode {
  return children;
}

function getFieldName(
  id: string,
  control: ToolcraftCollectionItemControlSchema,
): string {
  if (typeof control.label === "string") {
    return control.label;
  }

  return id
    .replace(/([a-z0-9])([A-Z])/gu, "$1 $2")
    .replace(/[-_.]+/gu, " ")
    .replace(/^./u, (character) => character.toUpperCase());
}

function asItemRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(Object.entries(value));
}

export function ControlsPanelCollectionItemField({
  colorLabelMode,
  control,
  id,
  name,
  onChange,
  plainColorFullWidth = true,
  target,
  value,
  withKeyframeLabelAction = renderWithoutKeyframeAction,
}: {
  colorLabelMode: "authored" | "hidden";
  control: ToolcraftCollectionItemControlSchema;
  id: string;
  name: string;
  onChange: ItemFieldChange;
  plainColorFullWidth?: boolean;
  target: string;
  value: unknown;
  withKeyframeLabelAction?: (args: { children: React.ReactNode }) => React.ReactNode;
}): React.JSX.Element {
  const fieldSchema: ToolcraftControlSchema = {
    ...control,
    applicability: { mode: "always" },
    target,
  };
  const shouldShowColorFieldLabel = () =>
    colorLabelMode === "authored" && control.label !== false;
  const commitCanonicalValue: ItemFieldChange = (nextValue, meta) => {
    if (control.disabled) return;
    const decoded = decodeToolcraftBuiltInLiveValue(fieldSchema, nextValue);
    if (decoded?.accepted) {
      onChange(decoded.value, meta);
    }
  };
  const rendered =
    renderBasicControl({
      commit: commitCanonicalValue,
      control: fieldSchema,
      id,
      name,
      usesHeaderKeyframeAction: false,
      value,
      vectorPadShape: "compact",
      withKeyframeLabelAction,
    }) ??
    renderCompoundControl({
      plainColorFullWidth,
      commit: commitCanonicalValue,
      commitWithLabel: () => commitCanonicalValue,
      control: fieldSchema,
      id,
      name,
      sectionHasOnlyColorFields: false,
      shouldShowColorFieldLabel,
      usesHeaderKeyframeAction: false,
      value,
      withKeyframeLabelAction,
    });

  if (rendered == null) {
    throw new Error(
      `Unsupported Toolcraft collection item field: ${control.type}`,
    );
  }

  return <>{rendered}</>;
}

export function ControlsPanelCollectionItemFields({
  controls,
  id,
  onChange,
  onFieldChange,
  target,
  value,
  withFieldKeyframeAction,
}: {
  controls: ToolcraftCollectionItemControlsSchema;
  id: string;
  onChange: (
    nextValue: Readonly<Record<string, unknown>>,
    fieldName: string,
    meta?: ControlChangeMeta,
  ) => void;
  onFieldChange?: (
    fieldId: string,
    fieldValue: unknown,
    nextValue: Readonly<Record<string, unknown>>,
    fieldName: string,
    meta?: ControlChangeMeta,
  ) => void;
  target: string;
  value: unknown;
  withFieldKeyframeAction?: (args: {
    children: React.ReactNode;
    field: ToolcraftCollectionItemControlSchema;
    fieldId: string;
    name: string;
    value: unknown;
  }) => React.ReactNode;
}): React.JSX.Element {
  const record = asItemRecord(value);

  return (
    <div className="min-w-0 space-y-4" data-slot="collection-item-fields">
      {Object.entries(controls).map(([fieldId, field]) => {
        const fieldName = getFieldName(fieldId, field);

        return (
          <ControlsPanelCollectionItemField
            colorLabelMode="authored"
            control={field}
            id={`${id}:${fieldId}`}
            key={fieldId}
            name={fieldName}
            onChange={(nextValue, meta) => {
              const nextRecord = { ...record, [fieldId]: nextValue };
              if (onFieldChange) {
                onFieldChange(
                  fieldId,
                  nextValue,
                  nextRecord,
                  fieldName,
                  meta,
                );
                return;
              }
              onChange(nextRecord, fieldName, meta);
            }}
            target={target}
            value={record[fieldId] ?? field.defaultValue}
            withKeyframeLabelAction={(args) =>
              withFieldKeyframeAction?.({
                ...args,
                field,
                fieldId,
                name: fieldName,
                value: record[fieldId] ?? field.defaultValue,
              }) ?? args.children
            }
          />
        );
      })}
    </div>
  );
}
