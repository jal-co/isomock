import * as React from "react";
import {
  ControlInlineGroup,
  ControlList,
  Field,
  FieldLabel,
  Input,
  Select,
  type ControlChangeMeta,
} from "@/toolcraft/ui";
import { toolcraftCanvasAspectRatioPresets } from "../../../schema/canvas-aspect-ratio-presets";
import {
  asCanvasAspectRatioValue,
  parseCanvasAspectRatioOption,
  type CanvasAspectRatioValue,
} from "../values/controls-panel-aspect-ratio-values";

const options = [
  ...toolcraftCanvasAspectRatioPresets.map(({ value }) => ({ label: value, value })),
  { label: "Custom", value: "custom" },
];

function RatioPart({
  axis,
  value,
  onCommit,
}: {
  axis: "width" | "height";
  value: number;
  onCommit: (value: number) => void;
}): React.JSX.Element {
  const id = React.useId();
  const [draft, setDraft] = React.useState(String(value));
  const skipBlur = React.useRef(false);
  React.useEffect(() => setDraft(String(value)), [value]);

  function commit(): void {
    const next = Number(draft);
    if (!draft.trim() || !Number.isSafeInteger(next) || next <= 0) {
      setDraft(String(value));
      return;
    }
    setDraft(String(next));
    if (next !== value) onCommit(next);
  }

  return (
    <Field>
      <FieldLabel htmlFor={id}>{axis === "width" ? "Ratio W" : "Ratio H"}</FieldLabel>
      <Input
        aria-label={`Ratio ${axis}`}
        className="font-mono"
        id={id}
        inputMode="numeric"
        onBlur={() => {
          if (!skipBlur.current) commit();
          skipBlur.current = false;
        }}
        onChange={(event) => setDraft(event.target.value)}
        onFocus={() => { skipBlur.current = false; }}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== "Escape") return;
          event.preventDefault();
          if (event.key === "Enter") commit();
          else setDraft(String(value));
          skipBlur.current = true;
          event.currentTarget.blur();
        }}
        value={draft}
      />
    </Field>
  );
}

export function CanvasAspectRatioControl({
  defaultValue,
  name,
  onValueChange,
  value,
}: {
  defaultValue: unknown;
  name: string;
  onValueChange?: (value: CanvasAspectRatioValue, meta?: ControlChangeMeta) => void;
  value: unknown;
}): React.JSX.Element {
  const ratio = asCanvasAspectRatioValue(value, defaultValue);

  function updatePreset(next: string): void {
    const nextRatio = next === "custom"
      ? { ...ratio, mode: "custom" as const, value: `${ratio.width}:${ratio.height}` }
      : parseCanvasAspectRatioOption(next);
    if (nextRatio) onValueChange?.(nextRatio);
  }

  function updatePart(axis: "width" | "height", next: number): void {
    const parts = { width: ratio.width, height: ratio.height, [axis]: next };
    onValueChange?.({ ...parts, mode: "custom", value: `${parts.width}:${parts.height}` });
  }

  return (
    <div className="min-w-0" data-slot="canvas-aspect-ratio-control">
      <ControlList>
        <Select
          name={name}
          onValueChange={updatePreset}
          options={options}
          value={ratio.mode === "custom" ? "custom" : ratio.value}
        />
        {ratio.mode === "custom" ? (
          <ControlInlineGroup>
            <RatioPart axis="width" value={ratio.width} onCommit={(next) => updatePart("width", next)} />
            <RatioPart axis="height" value={ratio.height} onCommit={(next) => updatePart("height", next)} />
          </ControlInlineGroup>
        ) : null}
      </ControlList>
    </div>
  );
}
