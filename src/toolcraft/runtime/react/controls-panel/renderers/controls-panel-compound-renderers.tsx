"use client";

import * as React from "react";
import {
  ChannelMixer,
  Color,
  ColorOpacity,
  Curves,
  FontPicker,
  Gradient,
  ImagePicker,
  Palette,
  type ChannelMixerValues,
  type ColorControlInput,
  type ColorControlInputPair,
  type ControlChangeMeta,
} from "@/toolcraft/ui";

import type { ToolcraftControlSchema } from "../../../schema/types";
import { isToolcraftBuiltInControlSchema } from "../../../schema/control-schema";
import {
  asColorOpacityValue,
  asColorValue,
  asCurveInterpolation,
  asFontPickerValue,
  asGradientValue,
  asString,
  defaultChannelMixerValues,
  isRecord,
} from "../values/controls-panel-values";

export type CompoundControlCommit = (
  nextValue: unknown,
  meta?: ControlChangeMeta,
) => void;

export type CompoundControlCommitWithLabel = (
  label: string,
) => CompoundControlCommit;

export type CompoundControlKeyframeWrap = (args: {
  children: React.ReactNode;
  control: ToolcraftControlSchema;
  disableAction: boolean;
  labelActionName?: string;
  name: string;
  providerKey: string;
  value: unknown;
}) => React.ReactNode;

export type CompoundShouldShowColorFieldLabel = (args: {
  control: ToolcraftControlSchema;
  sectionHasOnlyColorFields: boolean;
}) => boolean;

export type CompoundControlRenderArgs = {
  plainColorFullWidth?: boolean;
  commit: CompoundControlCommit;
  commitWithLabel: CompoundControlCommitWithLabel;
  control: ToolcraftControlSchema;
  id: string;
  name: string;
  sectionHasOnlyColorFields: boolean;
  shouldShowColorFieldLabel: CompoundShouldShowColorFieldLabel;
  usesHeaderKeyframeAction: boolean;
  value: unknown;
  withKeyframeLabelAction: CompoundControlKeyframeWrap;
};

export type CompoundColorGroupRenderArgs = {
  entries: readonly [id: string, control: ToolcraftControlSchema][];
  getControlName: (
    id: string,
    label: ToolcraftControlSchema["label"],
  ) => string;
  getControlValue: (control: ToolcraftControlSchema) => unknown;
  headerKeyframeTarget: string | null;
  maybeUpsertControlKeyframe: (
    control: ToolcraftControlSchema,
    label: string,
    value: unknown,
  ) => void;
  sectionHasOnlyColorFields: boolean;
  setControlValue: (
    target: string,
    value: unknown,
    label?: string,
    meta?: ControlChangeMeta,
  ) => void;
  shouldShowColorFieldLabel: CompoundShouldShowColorFieldLabel;
  withKeyframeLabelAction: CompoundControlKeyframeWrap;
};

export function renderCompoundColorGroup({
  entries,
  getControlName,
  getControlValue,
  headerKeyframeTarget,
  maybeUpsertControlKeyframe,
  sectionHasOnlyColorFields,
  setControlValue,
  shouldShowColorFieldLabel,
  withKeyframeLabelAction,
}: CompoundColorGroupRenderArgs): React.JSX.Element | null {
  const colorInputs = entries.map(([id, control]) => {
    const name = getControlName(id, control.label);
    const value = getControlValue(control);
    const colorValue = asColorValue(value);

    return {
      hex: colorValue.hex,
      name,
      onValueChange: (nextValue, meta) => {
        setControlValue(control.target, nextValue, name, meta);
        maybeUpsertControlKeyframe(control, name, nextValue);
      },
      showLabel: shouldShowColorFieldLabel({
        control,
        sectionHasOnlyColorFields,
      }),
    } satisfies ColorControlInput;
  });
  const [firstInput, secondInput] = colorInputs;

  if (!firstInput) {
    return null;
  }

  if (!secondInput) {
    const firstEntry = entries[0];
    const firstControl = firstEntry?.[1];
    const firstValue = firstControl ? getControlValue(firstControl) : undefined;

    return firstControl ? (
      withKeyframeLabelAction({
        children: (
          <Color
            hex={firstInput.hex}
            key={firstInput.name}
            name={firstInput.name}
            onValueChange={firstInput.onValueChange}
            showLabel={shouldShowColorFieldLabel({
              control: firstControl,
              sectionHasOnlyColorFields,
            })}
          />
        ),
        control: firstControl,
        disableAction: firstControl.target === headerKeyframeTarget,
        name: firstInput.name,
        providerKey: firstInput.name,
        value: firstValue,
      }) as React.JSX.Element
    ) : (
      <Color
        hex={firstInput.hex}
        key={firstInput.name}
        name={firstInput.name}
        onValueChange={firstInput.onValueChange}
        showLabel={firstInput.showLabel}
      />
    );
  }

  return (
    <Color
      inputs={[firstInput, secondInput] as ColorControlInputPair}
      key={`${firstInput.name}-${secondInput.name}`}
    />
  );
}

export function renderCompoundControl({
  plainColorFullWidth = true,
  commit,
  commitWithLabel,
  control,
  id,
  name,
  sectionHasOnlyColorFields,
  shouldShowColorFieldLabel,
  usesHeaderKeyframeAction,
  value,
  withKeyframeLabelAction,
}: CompoundControlRenderArgs): React.ReactNode | null {
  if (!isToolcraftBuiltInControlSchema(control)) return null;
  switch (control.type) {
    case "channelMixer": {
      const channelMixerName = name;

      return withKeyframeLabelAction({
        children: (
          <ChannelMixer
            key={id}
            name={channelMixerName}
            onValueChange={(nextValue) =>
              commitWithLabel(channelMixerName)(nextValue.values)
            }
            values={
              isRecord(value) ? (value as ChannelMixerValues) : defaultChannelMixerValues
            }
          />
        ),
        control,
        disableAction: false,
        labelActionName: channelMixerName,
        name,
        providerKey: id,
        value,
      });
    }

    case "color": {
      const colorValue = asColorValue(value);

      return withKeyframeLabelAction({
        children: (
          <Color
            fullWidth={plainColorFullWidth}
            hex={colorValue.hex}
            key={id}
            name={name}
            onValueChange={commit}
            showLabel={shouldShowColorFieldLabel({
              control,
              sectionHasOnlyColorFields,
            })}
          />
        ),
        control,
        disableAction: usesHeaderKeyframeAction,
        name,
        providerKey: id,
        value,
      });
    }

    case "colorOpacity": {
      const colorOpacityValue = asColorOpacityValue(value);

      return withKeyframeLabelAction({
        children: (
          <ColorOpacity
            hex={colorOpacityValue.hex}
            key={id}
            name={name}
            onValueChange={commit}
            opacity={colorOpacityValue.opacity}
            showLabel={shouldShowColorFieldLabel({
              control,
              sectionHasOnlyColorFields,
            })}
          />
        ),
        control,
        disableAction: usesHeaderKeyframeAction,
        name,
        providerKey: id,
        value: colorOpacityValue,
      });
    }

    case "curves": {
      const curvesName = control.label === false ? "Curves" : name;

      return withKeyframeLabelAction({
        children: (
          <Curves
            interpolation={asCurveInterpolation(control.interpolation)}
            key={id}
            name={curvesName}
            onValueChange={commitWithLabel(curvesName)}
            variant={control.variant === "single" ? "single" : "rgb"}
            {...(isRecord(value) ? value : {})}
          />
        ),
        control,
        disableAction: false,
        labelActionName: curvesName,
        name: curvesName,
        providerKey: id,
        value,
      });
    }

    case "gradient": {
      const gradientValue = asGradientValue(value);

      return withKeyframeLabelAction({
        children: (
          <Gradient
            angle={gradientValue.angle}
            gradientType={gradientValue.gradientType}
            key={id}
            onValueChange={commit}
            stops={gradientValue.stops}
          />
        ),
        control,
        disableAction: usesHeaderKeyframeAction,
        name,
        providerKey: id,
        value,
      });
    }

    case "fontPicker": {
      const fontPickerValue = asFontPickerValue(value);

      return withKeyframeLabelAction({
        children: (
          <FontPicker
            defaultValue={asFontPickerValue(control.defaultValue)}
            disabled={control.disabled}
            key={id}
            name={name}
            onValueChange={commit}
            value={fontPickerValue}
          />
        ),
        control,
        disableAction: usesHeaderKeyframeAction,
        name,
        providerKey: id,
        value: fontPickerValue,
      });
    }

    case "imagePicker":
      return (
        <ImagePicker
          items={control.items}
          key={id}
          name={name}
          onValueChange={commit}
          value={asString(value, control.items?.[0]?.value ?? "")}
        />
      );

    case "palette":
      return withKeyframeLabelAction({
        children: (
          <Palette
            defaultValue={
              isRecord(control.defaultValue)
                ? (control.defaultValue as React.ComponentProps<
                    typeof Palette
                  >["defaultValue"])
                : undefined
            }
            key={id}
            onValueChange={commit}
            value={
              isRecord(value)
                ? (value as React.ComponentProps<typeof Palette>["value"])
                : undefined
            }
          />
        ),
        control,
        disableAction: usesHeaderKeyframeAction,
        name,
        providerKey: id,
        value,
      });

    default:
      return null;
  }
}
