export type ToolcraftSliderRange = Readonly<{ min: number; max: number }>;
export type ToolcraftEditableSliderRange = Readonly<{ hardMin?: number; hardMax?: number }>;

type NumericControl = {
  type: string;
  min?: number;
  max?: number;
  step?: number;
  defaultValue?: unknown;
  editableRange?: ToolcraftEditableSliderRange;
};

/** The semantic domain is independent of the user-adjustable visible scale. */
export function getToolcraftNumericDomain(control: NumericControl) {
  return control.editableRange
    ? { min: control.editableRange.hardMin, max: control.editableRange.hardMax }
    : { min: control.min, max: control.max };
}

export function getToolcraftInitialSliderRange(control: NumericControl): ToolcraftSliderRange {
  return { min: control.min ?? 0, max: control.max ?? 100 };
}

export function getToolcraftSliderRangeError(control: NumericControl, range: ToolcraftSliderRange): string | undefined {
  if (!Number.isFinite(range.min) || !Number.isFinite(range.max) || !Number.isFinite(range.max - range.min)) {
    return "Range boundaries must be finite numbers.";
  }
  if (range.min >= range.max) return "Minimum must be less than maximum.";
  const { min, max } = getToolcraftNumericDomain(control);
  if (min !== undefined && range.min < min) return `Minimum value is ${min}.`;
  if (max !== undefined && range.max > max) return `Maximum value is ${max}.`;
  const step = control.step ?? (control.type === "slider" ? 1 : 0.1);
  if (!Number.isFinite(step) || step <= 0 || !Number.isSafeInteger(Math.ceil((range.max - range.min) / step))) {
    return "Range exceeds the precision supported by this step.";
  }
  return undefined;
}

export function assertToolcraftEditableSliderRange(control: NumericControl, location: string): void {
  if (control.editableRange === undefined) return;
  const fail = (message: string): never => { throw new Error(`Toolcraft editableRange ${location}: ${message}`); };
  if (control.type !== "slider" && control.type !== "rangeSlider") fail("requires a slider or rangeSlider.");
  const policy = control.editableRange;
  if (!policy || typeof policy !== "object" || Array.isArray(policy) ||
      Object.keys(policy).some(key => key !== "hardMin" && key !== "hardMax")) fail("invalid hard-limit policy.");
  for (const bound of [policy.hardMin, policy.hardMax]) {
    if (bound !== undefined && !Number.isFinite(bound)) fail("hard limits must be finite.");
  }
  const range = getToolcraftInitialSliderRange(control);
  const error = getToolcraftSliderRangeError(control, range);
  if (error) fail(error);
  const defaults = Array.isArray(control.defaultValue) ? control.defaultValue : [control.defaultValue ?? range.min];
  if (defaults.some(value => typeof value !== "number" || !Number.isFinite(value) || value < range.min || value > range.max)) {
    fail("initial values must be inside the initial scale.");
  }
  if (control.type === "rangeSlider" && (!Array.isArray(control.defaultValue) || defaults.length !== 2 || defaults[0] > defaults[1])) {
    fail("requires two ordered default values.");
  }
}
