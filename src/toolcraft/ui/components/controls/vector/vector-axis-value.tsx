"use client";

import * as React from "react";
import { LockSimpleIcon, LockSimpleOpenIcon } from "@phosphor-icons/react";
import { Button, EditableSliderValueLabel, Tooltip, TooltipContent, TooltipTrigger } from "../../primitives";

export function VectorAxisValue({ axis, label, locked, name, onCommit, onToggle, value }: {
  axis: "x" | "y";
  label: string;
  locked: boolean;
  name: string;
  onCommit: (draft: string) => void;
  onToggle: () => void;
  value: string;
}): React.JSX.Element {
  const action = `${locked ? "Unlock" : "Lock"} ${name} ${label} axis`;
  const Icon = locked ? LockSimpleIcon : LockSimpleOpenIcon;
  return (
    <span className="inline-flex items-center gap-0.5" data-vector-axis={axis}>
      <Tooltip>
        <TooltipTrigger render={<Button
          aria-label={action}
          aria-pressed={locked}
          data-icon-active={locked}
          onClick={onToggle}
          size="icon-xxs"
          type="button"
          variant="ghost"
        />}>
          <Icon aria-hidden="true" />
        </TooltipTrigger>
        <TooltipContent side="top">{action}</TooltipContent>
      </Tooltip>
      <EditableSliderValueLabel
        ariaLabel={`${name} ${label} value`}
        disabled={locked}
        font="mono"
        layout="content"
        onCommit={onCommit}
        valueLabel={value}
      />
    </span>
  );
}
