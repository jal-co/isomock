import { ControlsPanelEditableSlider } from "./controls-panel-editable-slider";
import * as React from "react";
import {
  AnchorGrid,
  Checkbox,
  CodeTextarea,
  RangeInput,
  RangeSlider,
  Segmented,
  Select,
  Slider,
  Switch,
  TabsControl,
  TextInput,
  Vector,
  type ControlChangeMeta,
} from "@/toolcraft/ui";

import { CanvasAspectRatioControl } from "./controls-panel-aspect-ratio";
import type { ToolcraftControlSchema } from "../../../schema/types";
import { isToolcraftBuiltInControlSchema } from "../../../schema/control-schema";
import {
  getControlMarkerCount,
  shouldCommitTextControlOnBlur,
} from "../layout/controls-panel-layout";
import {
  asBoolean,
  asNumber,
  asNumberArray,
  asRangeInputValue,
  asString,
  asVectorPadCoordinateMode,
  asVectorPadVariant,
  asVectorValue,
} from "../values/controls-panel-values";

export type BasicControlCommit = (
  nextValue: unknown,
  meta?: ControlChangeMeta,
) => void;

export type BasicControlKeyframeWrap = (args: {
  children: React.ReactNode;
  control: ToolcraftControlSchema;
  disableAction: boolean;
  name: string;
  providerKey: string;
  value: unknown;
}) => React.ReactNode;

export type BasicControlRenderArgs = {
  commit: BasicControlCommit;
  control: ToolcraftControlSchema;
  id: string;
  name: string;
  usesHeaderKeyframeAction: boolean;
  value: unknown;
  vectorPadShape: "compact" | "square";
  withKeyframeLabelAction: BasicControlKeyframeWrap;
};

export function renderBasicControl({
  commit,
  control,
  id,
  name,
  usesHeaderKeyframeAction,
  value,
  vectorPadShape,
  withKeyframeLabelAction,
}: BasicControlRenderArgs): React.ReactNode | null {
  if (!isToolcraftBuiltInControlSchema(control)) return null;
  switch (control.type) {
    case "aspectRatio":
      return (
        <CanvasAspectRatioControl
          defaultValue={control.defaultValue}
          key={id}
          name={name}
          onValueChange={commit}
          value={value}
        />
      );

    case "anchorGrid":
      return withKeyframeLabelAction({
        children: (
          <AnchorGrid
            key={id}
            name={name}
            onValueChange={commit}
            value={
              asString(value, "center") as React.ComponentProps<
                typeof AnchorGrid
              >["value"]
            }
          />
        ),
        control,
        disableAction: usesHeaderKeyframeAction,
        name,
        providerKey: id,
        value,
      });

    case "checkbox":
      return (
        <Checkbox
          checked={asBoolean(value)}
          disabled={control.disabled}
          key={id}
          name={name}
          onCheckedChange={commit}
          showLabel={control.label !== false}
        />
      );

    case "code":
      return withKeyframeLabelAction({
        children: (
          <CodeTextarea
            defaultValue={asString(control.defaultValue, asString(value))}
            key={id}
            name={name}
            onValueChange={commit}
            showLabel={control.label !== false}
            value={asString(value)}
          />
        ),
        control,
        disableAction: usesHeaderKeyframeAction,
        name,
        providerKey: id,
        value,
      });

    case "rangeInput": {
      const rangeValue = asRangeInputValue(value);

      return withKeyframeLabelAction({
        children: (
          <RangeInput
            defaultValue={asRangeInputValue(control.defaultValue)}
            end={rangeValue.end}
            key={id}
            name={name}
            onValueChange={commit}
            showLabel={control.label !== false}
            start={rangeValue.start}
          />
        ),
        control,
        disableAction: usesHeaderKeyframeAction,
        name,
        providerKey: id,
        value,
      });
    }

    case "rangeSlider":
      return withKeyframeLabelAction({
        children: (
          control.editableRange ? <ControlsPanelEditableSlider control={control} name={name} value={value} commit={commit} /> : (
          <RangeSlider
            baseValue={asNumberArray(control.defaultValue, [])}
            disabled={control.disabled}
            markerCount={getControlMarkerCount(control)}
            max={control.max ?? 100}
            min={control.min ?? 0}
            key={id}
            name={name}
            onValueChange={commit}
            step={control.step ?? 0.1}
            unit={control.unit}
            value={asNumberArray(value, [control.min ?? 0, control.max ?? 100])}
            valueLabel={control.valueLabel}
            variant={control.variant === "discrete" ? "discrete" : "continuous"}
          />
          )
        ),
        control,
        disableAction: usesHeaderKeyframeAction,
        name,
        providerKey: id,
        value,
      });

    case "segmented":
      return withKeyframeLabelAction({
        children: (
          <Segmented
            key={id}
            name={name}
            onValueChange={commit}
            options={control.options ?? []}
            value={asString(value, control.options?.[0]?.value ?? "")}
            variant={control.variant === "dots" ? "dots" : "default"}
          />
        ),
        control,
        disableAction: usesHeaderKeyframeAction,
        name,
        providerKey: id,
        value,
      });

    case "select":
      return (
        <Select
          disabled={control.disabled}
          key={id}
          name={name}
          onValueChange={commit}
          options={control.options ?? []}
          showLabel={control.label !== false}
          value={asString(value, control.options?.[0]?.value ?? "")}
        />
      );

    case "tabs":
      return (
        <TabsControl
          ariaLabel={name}
          disabled={control.disabled}
          key={id}
          onValueChange={commit}
          options={control.options ?? []}
          value={asString(value, control.options?.[0]?.value ?? "")}
        />
      );

    case "slider":
      return withKeyframeLabelAction({
        children: (
          control.editableRange ? <ControlsPanelEditableSlider control={control} name={name} value={value} commit={commit} /> : (
          <Slider
            baseValue={asNumber(control.defaultValue, control.min ?? 0)}
            disabled={control.disabled}
            key={id}
            markerCount={getControlMarkerCount(control)}
            max={control.max ?? 100}
            min={control.min ?? 0}
            name={name}
            onValueChange={commit}
            step={control.step ?? 1}
            unit={control.unit}
            value={asNumber(
              value,
              asNumber(control.defaultValue, control.min ?? 0),
            )}
            valueLabel={control.valueLabel}
            variant={control.variant === "discrete" ? "discrete" : "continuous"}
          />
          )
        ),
        control,
        disableAction: usesHeaderKeyframeAction,
        name,
        providerKey: id,
        value,
      });

    case "switch":
      return (
        <Switch
          checked={asBoolean(value)}
          disabled={control.disabled}
          key={id}
          name={name}
          onCheckedChange={commit}
          showLabel={control.label !== false}
        />
      );

    case "text":
      return withKeyframeLabelAction({
        children: (
          <TextInput
            disabled={control.disabled}
            commitOnBlur={shouldCommitTextControlOnBlur(control)}
            defaultValue={asString(control.defaultValue, asString(value))}
            key={id}
            name={name}
            onValueChange={commit}
            showLabel={control.label !== false}
            value={asString(value)}
          />
        ),
        control,
        disableAction: usesHeaderKeyframeAction,
        name,
        providerKey: id,
        value,
      });

    case "vector": {
      const vectorValue = asVectorValue(value);
      const padVariant = asVectorPadVariant(control.variant);

      return withKeyframeLabelAction({
        children: (
          <Vector
            disabled={control.disabled}
            defaultValue={asVectorValue(control.defaultValue)}
            key={id}
            name={name}
            onValueChange={commit}
            padCoordinateMode={asVectorPadCoordinateMode(
              control.coordinateMode,
              padVariant,
            )}
            padShape={vectorPadShape}
            padVariant={padVariant}
            x={vectorValue.x}
            xLabel={control.xLabel}
            y={vectorValue.y}
            yLabel={control.yLabel}
          />
        ),
        control,
        disableAction: usesHeaderKeyframeAction,
        name,
        providerKey: id,
        value,
      });
    }

    default:
      return null;
  }
}
