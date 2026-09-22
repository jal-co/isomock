"use client";

import * as React from "react";
import { parseSliderEditValue } from "../slider/slider-edit-value";

import {
  EditableSliderValueLabel,
  Field,
  FieldError,
  getNumericValueLabelWidthReference,
  Slider,
} from "../../primitives";
import { ControlFieldLabel } from "../../control-layout";
import { cn } from "../../../lib/utils";
import {
  clampSliderValue,
  applySliderValueLabelUnit,
  formatSliderValueWithUnit,
  getSliderControlValue,
  parseSliderValueLabel,
} from "./slider-value";
import {
  createControlHistoryGroupId,
  type ControlChangeMeta,
  type ControlValueChangeHandler,
} from "../control-types";

export type SliderControlProps = {
  baseValue?: number;
  className?: string;
  disabled?: boolean;
  markerCount?: number;
  max?: number;
  min?: number;
  name: string;
  /** Optional numeric commit policy; return an error to retain the current value. */
  onValueEdit?: (value: number, reason?: "reset") => string | undefined;
  onValueChange?: ControlValueChangeHandler<number>;
  showFill?: boolean;
  step?: number;
  unit?: string;
  value: number;
  valueLabel?: string;
  variant?: "continuous" | "discrete";
};

export function SliderControl({
  baseValue,
  className,
  disabled = false,
  markerCount,
  max = 100,
  min = 0,
  name,
  onValueChange,
  onValueEdit,
  showFill,
  step = 1,
  unit,
  value,
  valueLabel,
  variant = "continuous",
}: SliderControlProps): React.JSX.Element {
  const [currentValue, setCurrentValue] = React.useState(value);
  const [editError, setEditError] = React.useState<string>();
  const liveHistoryGroupRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    setCurrentValue(value);
  }, [value]);

  const displayValueLabel =
    valueLabel && currentValue === value
      ? applySliderValueLabelUnit(valueLabel, unit)
      : formatSliderValueWithUnit(currentValue, step, unit);

  function getLiveHistoryMeta(): ControlChangeMeta {
    liveHistoryGroupRef.current ??= createControlHistoryGroupId(`slider:${name}`);

    return {
      history: "merge",
      historyGroup: liveHistoryGroupRef.current,
    };
  }

  function finishLiveHistoryGroup(): void {
    liveHistoryGroupRef.current = null;
  }

  function commitValue(nextValue: number, meta?: ControlChangeMeta): void {
    setEditError(undefined);
    const clampedValue = clampSliderValue(nextValue, min, max);

    setCurrentValue(clampedValue);
    onValueChange?.(clampedValue, meta);
  }

  function stepEditableValue(direction: -1 | 1, currentDraft: string): string | undefined {
    const parsedDraftValue = parseSliderValueLabel(currentDraft);
    const baseValue =
      typeof parsedDraftValue === "number" ? parsedDraftValue : currentValue;
    const nextValue = baseValue + direction * step;
    if (onValueEdit) return formatSliderValueWithUnit(nextValue, step, unit);
    const clampedValue = clampSliderValue(nextValue, min, max);

    commitValue(clampedValue, getLiveHistoryMeta());

    return formatSliderValueWithUnit(clampedValue, step, unit);
  }

  return (
    <Field className={cn("min-w-0 gap-1!", className)} data-disabled={disabled} data-invalid={Boolean(editError)}>
      <div className="flex w-full min-w-0 items-center justify-between gap-3">
        <ControlFieldLabel>{name}</ControlFieldLabel>
        <div className="inline-flex h-5 shrink-0 items-center gap-1.5">
          <EditableSliderValueLabel
            ariaLabel={`${name} value`}
            disabled={disabled}
            maxValueLabel={getNumericValueLabelWidthReference(
              displayValueLabel,
              { max, min },
            )}
            onCommit={(nextValueLabel) => {
              if (onValueEdit) {
                const parsed = parseSliderEditValue(nextValueLabel, false, unit);
                setEditError(parsed ? onValueEdit(parsed[0]!) : "Enter a valid number.");
                finishLiveHistoryGroup();
                return;
              }
              const parsedValue = parseSliderValueLabel(nextValueLabel);

              if (typeof parsedValue === "number") {
                commitValue(parsedValue);
              }

              finishLiveHistoryGroup();
            }}
            onStep={stepEditableValue}
            valueLabel={displayValueLabel}
          />
        </div>
      </div>
      <Slider
        getAriaLabel={() => name}
        markerCount={markerCount}
        max={max}
        min={min}
        disabled={disabled}
        onValueChange={(nextValue) => {
          const resolvedValue = getSliderControlValue(nextValue);

          if (typeof resolvedValue === "number") {
            commitValue(resolvedValue, getLiveHistoryMeta());
          }
        }}
        onValueCommitted={finishLiveHistoryGroup}
        onValueReset={onValueEdit ? nextValue => {
          const reset = getSliderControlValue(nextValue);
          if (typeof reset === "number") setEditError(onValueEdit(reset, "reset"));
          finishLiveHistoryGroup();
        } : undefined}
        resetValue={typeof baseValue === "number" ? [baseValue] : undefined}
        showFill={showFill}
        step={step}
        value={[currentValue]}
        variant={variant}
      />
      {editError ? <FieldError>{editError}</FieldError> : null}
    </Field>
  );
}
